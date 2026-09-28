// src/adapters/gemini.adapter.ts
// Adapter for gemini.google.com

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class GeminiAdapter extends BaseAdapter {
  readonly site = 'gemini' as const;
  readonly displayName = 'Google Gemini';
  readonly hostPatterns = ['gemini.google.com'];

  private readonly selectors = {
    // Primary: model/user turn containers
    userTurn: '.user-query, [data-turn-role="user"], .query-content, message-content.user-message',
    assistantTurn:
      '.model-response, [data-turn-role="model"], .response-content, message-content.model-response',
    // Fallback: conversation turns
    turnContainer: '.conversation-turn, .chat-turn, [class*="turn-container"]',
    // Input
    input: '.ql-editor, [contenteditable="true"][aria-label*="Enter"], rich-textarea .ql-editor, .text-input-field textarea',
    // Scroll
    scrollContainer: '.conversation-container, [class*="chat-container"], main .overflow-y-auto',
  };

  extractMessages(): ExtractedMessage[] {
    // Strategy 1: Role-specific selectors
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

    // Strategy 2: Turn containers (alternating)
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
