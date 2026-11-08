// src/adapters/chatgpt.adapter.ts
// Adapter for chatgpt.com and chat.openai.com
//
// ChatGPT ships two conversation renderers:
//  - Legacy: messages carry `data-message-author-role` inside <article>
//    `[data-testid^="conversation-turn"]` containers.
//  - New (rolled out 2026): the `data-message-author-role` attribute is gone.
//    Turns are wrapped in `[data-turn-key]` containers and the role is encoded
//    in `data-content-search-unit-key` / `data-chatgpt-search-unit-key`
//    (values ending in ":user" / ":assistant"), `data-turn`, or detected via a
//    `[data-user-message-bubble]` descendant.

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class ChatGPTAdapter extends BaseAdapter {
  readonly site = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';
  readonly hostPatterns = ['chatgpt.com', 'chat.openai.com'];

  private readonly selectors = {
    // Legacy renderer: role attribute on the message bubble
    primary: '[data-message-author-role]',
    // Legacy renderer fallback: article elements
    articles: 'article',
    // New renderer: role-bearing turn containers/units
    turnUnits:
      '[data-message-author-role], [data-turn], [data-turn-key], ' +
      '[data-content-search-unit-key], [data-chatgpt-search-unit-key], ' +
      '[data-user-message-bubble], [data-conversation-role], [data-chatgpt-agent-turn-start]',
    // New renderer: user/assistant markers inside a turn
    userBubble: '[data-user-message-bubble]',
    assistantMarker:
      '[data-conversation-role="assistant"], [data-chatgpt-agent-turn-start]',
    // Input element
    input: '#prompt-textarea, textarea[data-id="root"], [contenteditable="true"][id="prompt-textarea"]',
    // Scroll container
    scrollContainer: 'main .overflow-y-auto, main [class*="react-scroll"]',
  };

  extractMessages(): ExtractedMessage[] {
    // Run every extraction strategy and keep the one that captures the most
    // content. This avoids a partial legacy match (e.g. only user nodes kept
    // their attribute) silently dropping all assistant replies.
    const legacyRole = this.extractFromRoleNodes(
      document.querySelectorAll(this.selectors.primary)
    );
    const turnUnits = this.extractFromTurnUnits();
    const articles = this.extractFromArticles(
      document.querySelectorAll(this.selectors.articles)
    );

    const hasAssistant = (msgs: ExtractedMessage[]) =>
      msgs.some((m) => m.role === 'assistant');
    const candidates = [
      { strategy: 'legacy-role', msgs: legacyRole },
      { strategy: 'turn-units', msgs: turnUnits },
      { strategy: 'articles', msgs: articles },
    ];

    // Prefer the first strategy that yields both roles; otherwise the one
    // with the most messages overall.
    const complete = candidates.find(
      (c) => c.msgs.length > 1 && hasAssistant(c.msgs) && c.msgs.some((m) => m.role === 'user')
    );
    if (complete) return complete.msgs;

    const best = candidates.reduce((a, b) => (b.msgs.length > a.msgs.length ? b : a));
    return best.msgs;
  }

  /** Resolve the author role encoded on a new-renderer element, if any. */
  private resolveTurnRole(el: Element): 'user' | 'assistant' | null {
    const roleAttr = el.getAttribute('data-message-author-role');
    if (roleAttr === 'user' || roleAttr === 'assistant') return roleAttr;

    // data-content-search-unit-key / data-chatgpt-search-unit-key values end
    // in ":user" or ":assistant" in the new renderer.
    for (const attr of ['data-content-search-unit-key', 'data-chatgpt-search-unit-key']) {
      const key = el.getAttribute(attr);
      if (key) {
        const suffix = (key.split(':').pop() ?? '').toLowerCase();
        if (suffix === 'user') return 'user';
        if (suffix === 'assistant') return 'assistant';
      }
    }

    const turn = el.getAttribute('data-turn')?.toLowerCase();
    if (turn === 'user') return 'user';
    if (turn === 'assistant') return 'assistant';

    if (el.querySelector(this.selectors.userBubble)) return 'user';
    if (el.querySelector(this.selectors.assistantMarker)) return 'assistant';
    if (el.matches(this.selectors.userBubble)) return 'user';
    if (el.matches(this.selectors.assistantMarker)) return 'assistant';
    return null;
  }

  /**
   * New-renderer extraction: emit the role-bearing turn containers in DOM
   * order. When a container wraps a *different* role than the inner role
   * markers (mixed wrapper), the inner markers are emitted as individual
   * messages instead so the exchange is not collapsed into one bubble.
   */
  private extractFromTurnUnits(): ExtractedMessage[] {
    const matched = Array.from(
      document.querySelectorAll<HTMLElement>(this.selectors.turnUnits)
    );
    const candidates = matched.filter((el) => this.resolveTurnRole(el) !== null);
    if (candidates.length === 0) return [];

    const messages: ExtractedMessage[] = [];
    const elements: Element[] = [];
    const seenGist = new Set<string>();

    const accept = (el: Element, role: 'user' | 'assistant') => {
      const msg = this.buildMessage(el, role);
      const gist = `${role}|${msg.text.trim().slice(0, 120)}`;
      if (!msg.text.trim() || seenGist.has(gist)) return;
      seenGist.add(gist);
      messages.push(msg);
      elements.push(el);
    };

    for (const el of candidates) {
      // Only emit outermost candidates: skip anything nested in another
      // candidate.
      if (candidates.some((other) => other !== el && other.contains(el))) continue;
      if (elements.some((r) => r.contains(el))) continue;

      const role = this.resolveTurnRole(el)!;
      const innerAll = candidates.filter((inner) => inner !== el && el.contains(inner));
      const sameRole = innerAll.filter((inner) => this.resolveTurnRole(inner) === role);
      const otherRole = innerAll.filter((inner) => this.resolveTurnRole(inner) !== role);

      if (otherRole.length === 0) {
        // Plain turn: the container holds exactly one message of `role`.
        accept(el, role);
        continue;
      }

      // Mixed wrapper (rare): one container spans both roles. Emit each
      // inner marker as its own message, descending to the innermost ones.
      // A same-role inner marker is the precise text for the wrapper's own
      // role, so only fall back to the (over-broad) container text when none
      // exists.
      const deepest = (nodes: Element[]) =>
        nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
      for (const node of deepest(otherRole)) accept(node, this.resolveTurnRole(node)!);
      const sameInnermost = deepest(sameRole);
      if (sameInnermost.length > 0) {
        for (const node of sameInnermost) accept(node, role);
      } else {
        accept(el, role);
      }
    }

    // Restore document order (inner markers may precede their outer wrappers
    // under document position comparison).
    const ordered = messages
      .map((msg, i) => ({ msg, el: elements[i] }))
      .sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      })
      .map((entry) => entry.msg);

    return ordered;
  }

  private extractFromRoleNodes(nodes: NodeListOf<Element>): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    nodes.forEach((node) => {
      const role = node.getAttribute('data-message-author-role');
      if (role === 'user' || role === 'assistant') {
        const msg = this.buildMessage(node, role);
        if (msg.text.trim()) messages.push(msg);
      }
    });
    return messages;
  }

  private extractFromArticles(nodes: NodeListOf<Element>): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    nodes.forEach((node) => {
      const isUser =
        !!node.querySelector('[data-message-author-role="user"]') ||
        !!node.querySelector('[data-testid*="user"]') ||
        !!node.querySelector(this.selectors.userBubble) ||
        (node.textContent?.includes('You said:') ?? false);

      const role = isUser ? 'user' : 'assistant';
      const msg = this.buildMessage(node, role);
      if (msg.text.trim()) messages.push(msg);
    });
    return messages;
  }

  getInputElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.input);
  }

  isVirtualized(): boolean {
    // ChatGPT virtualizes long conversations
    const container = this.getScrollContainer();
    if (!container) return false;
    return container.scrollHeight > container.clientHeight * 3;
  }

  getScrollContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.scrollContainer);
  }

  getDiagnostics(): Record<string, number> {
    return {
      roleNodes: document.querySelectorAll(this.selectors.primary).length,
      articles: document.querySelectorAll('article').length,
      turnContainers: document.querySelectorAll('[data-testid^="conversation-turn"]').length,
      turnKeyUnits: document.querySelectorAll('[data-turn-key]').length,
      searchUnitKeys: document.querySelectorAll(
        '[data-content-search-unit-key], [data-chatgpt-search-unit-key]'
      ).length,
      turnAttrs: document.querySelectorAll('[data-turn]').length,
      userBubbles: document.querySelectorAll(this.selectors.userBubble).length,
      scrollContainers: document.querySelectorAll(this.selectors.scrollContainer).length,
      textAreaChars: (document.querySelector('main')?.textContent ?? '').length,
    };
  }
}
