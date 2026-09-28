// src/adapters/perplexity.adapter.ts
// Adapter for perplexity.ai

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class PerplexityAdapter extends BaseAdapter {
  readonly site = 'perplexity' as const;
  readonly displayName = 'Perplexity';
  readonly hostPatterns = ['perplexity.ai'];

  private readonly selectors = {
    userTurn: '[class*="UserMessage"], [data-testid*="user"], .prose.user-query',
    assistantTurn:
      '[class*="AnswerMessage"], [class*="AssistantMessage"], [data-testid*="assistant"], .prose.answer',
    turnContainer: '[class*="ConversationTurn"], [class*="thread-message"]',
    input: 'textarea[placeholder], [contenteditable="true"]',
    scrollContainer: '[class*="thread-container"], main .overflow-y-auto',
  };

  extractMessages(): ExtractedMessage[] {
    const userSel = this.selectors.userTurn;
    const assistantSel = this.selectors.assistantTurn;
    const all = document.querySelectorAll(`${userSel}, ${assistantSel}`);

    if (all.length > 0) {
      const messages: ExtractedMessage[] = [];
      all.forEach((node) => {
        const isUser = node.matches(userSel);
        const msg = this.buildMessage(node, isUser ? 'user' : 'assistant');
        if (msg.text.trim()) messages.push(msg);
      });
      return messages;
    }

    // Fallback: turn containers
    const turns = document.querySelectorAll(this.selectors.turnContainer);
    if (turns.length > 0) {
      const messages: ExtractedMessage[] = [];
      turns.forEach((node, i) => {
        const role = (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant';
        const msg = this.buildMessage(node, role);
        if (msg.text.trim()) messages.push(msg);
      });
      return messages;
    }

    return [];
  }

  getInputElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.input);
  }

  getScrollContainer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.scrollContainer);
  }
}
