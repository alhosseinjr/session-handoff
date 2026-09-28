// src/adapters/claude.adapter.ts
// Adapter for claude.ai and console.anthropic.com

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class ClaudeAdapter extends BaseAdapter {
  readonly site = 'claude' as const;
  readonly displayName = 'Claude';
  readonly hostPatterns = ['claude.ai', 'console.anthropic.com'];

  private readonly selectors = {
    // Primary: data-testid
    userTurn: '[data-testid="user-turn"], [data-testid="user-message"]',
    assistantTurn: '[data-testid="assistant-turn"], [data-testid="claude-message"]',
    // Fallback 1: Font class names
    userFont: '.font-user-message',
    assistantFont: '.font-claude-message',
    // Fallback 2: Role-based aria labels
    userAria: '[aria-label*="User"], [aria-label*="Human"]',
    assistantAria: '[aria-label*="Claude"], [aria-label*="Assistant"]',
    // Fallback 3: Conversation container
    conversationContainer: '[class*="conversation"], [class*="chat-messages"]',
    // Input element
    input: '[contenteditable="true"].ProseMirror, [contenteditable="true"][data-placeholder], div.ProseMirror[contenteditable]',
    // Scroll container
    scrollContainer: '[class*="conversation-content"], [class*="chat-scroll"], main .overflow-y-auto',
  };

  extractMessages(): ExtractedMessage[] {
    // Strategy 1: Test ID selectors
    const userSel = this.selectors.userTurn;
    const assistantSel = this.selectors.assistantTurn;
    const all = document.querySelectorAll(`${userSel}, ${assistantSel}`);

    if (all.length > 0) {
      return this.extractFromTestIds(all, userSel);
    }

    // Strategy 2: Font class names
    const userFont = document.querySelectorAll(this.selectors.userFont);
    const assistantFont = document.querySelectorAll(this.selectors.assistantFont);

    if (userFont.length > 0 || assistantFont.length > 0) {
      return this.extractFromFontClasses(userFont, assistantFont);
    }

    // Strategy 3: Aria labels
    const userAria = document.querySelectorAll(this.selectors.userAria);
    const assistantAria = document.querySelectorAll(this.selectors.assistantAria);

    if (userAria.length > 0 || assistantAria.length > 0) {
      return this.extractFromAriaLabels(userAria, assistantAria);
    }

    return [];
  }

  private extractFromTestIds(all: NodeListOf<Element>, userSel: string): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    all.forEach((node) => {
      const isUser = node.matches(userSel);
      const msg = this.buildMessage(node, isUser ? 'user' : 'assistant');
      if (msg.text.trim()) messages.push(msg);
    });
    return messages;
  }

  private extractFromFontClasses(
    userNodes: NodeListOf<Element>,
    assistantNodes: NodeListOf<Element>
  ): ExtractedMessage[] {
    const allNodes: { el: Element; role: 'user' | 'assistant'; pos: number }[] = [];

    userNodes.forEach((el) => {
      allNodes.push({ el, role: 'user', pos: this.domPosition(el) });
    });
    assistantNodes.forEach((el) => {
      allNodes.push({ el, role: 'assistant', pos: this.domPosition(el) });
    });

    allNodes.sort((a, b) => a.pos - b.pos);

    return allNodes
      .map(({ el, role }) => this.buildMessage(el, role))
      .filter((m) => m.text.trim());
  }

  private extractFromAriaLabels(
    userNodes: NodeListOf<Element>,
    assistantNodes: NodeListOf<Element>
  ): ExtractedMessage[] {
    return this.extractFromFontClasses(userNodes, assistantNodes);
  }

  private domPosition(el: Element): number {
    const rect = el.getBoundingClientRect();
    return rect.top + window.scrollY;
  }

  getInputElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.input);
  }

  isVirtualized(): boolean {
    const container = this.getScrollContainer();
    if (!container) return false;
    return container.scrollHeight > container.clientHeight * 3;
  }

  getScrollContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.scrollContainer);
  }
}
