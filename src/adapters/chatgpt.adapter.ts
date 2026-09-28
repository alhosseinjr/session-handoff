// src/adapters/chatgpt.adapter.ts
// Adapter for chatgpt.com and chat.openai.com

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class ChatGPTAdapter extends BaseAdapter {
  readonly site = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';
  readonly hostPatterns = ['chatgpt.com', 'chat.openai.com'];

  private readonly selectors = {
    // Primary: data-message-author-role attribute
    primary: '[data-message-author-role]',
    // Fallback 1: article elements
    articles: 'article',
    // Fallback 2: turn containers
    turns: '[data-testid^="conversation-turn"]',
    // User detection patterns
    userRole: '[data-message-author-role="user"]',
    assistantRole: '[data-message-author-role="assistant"]',
    // Input element
    input: '#prompt-textarea, textarea[data-id="root"], [contenteditable="true"][id="prompt-textarea"]',
    // Scroll container
    scrollContainer: 'main .overflow-y-auto, main [class*="react-scroll"]',
  };

  extractMessages(): ExtractedMessage[] {
    // Strategy 1: Primary selectors with data-message-author-role
    let nodes = document.querySelectorAll(this.selectors.primary);

    if (nodes.length > 0) {
      return this.extractFromRoleNodes(nodes);
    }

    // Strategy 2: Article elements
    nodes = document.querySelectorAll(this.selectors.articles);
    if (nodes.length > 0) {
      return this.extractFromArticles(nodes);
    }

    // Strategy 3: Turn containers
    nodes = document.querySelectorAll(this.selectors.turns);
    if (nodes.length > 0) {
      return this.extractFromTurns(nodes);
    }

    return [];
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
        (node.textContent?.includes('You said:') ?? false);

      const role = isUser ? 'user' : 'assistant';
      const msg = this.buildMessage(node, role);
      if (msg.text.trim()) messages.push(msg);
    });
    return messages;
  }

  private extractFromTurns(nodes: NodeListOf<Element>): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    nodes.forEach((node, index) => {
      const role = index % 2 === 0 ? 'user' : 'assistant';
      const msg = this.buildMessage(node, role as 'user' | 'assistant');
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
}
