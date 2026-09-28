// src/adapters/poe.adapter.ts
// Adapter for poe.com

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class PoeAdapter extends BaseAdapter {
  readonly site = 'poe' as const;
  readonly displayName = 'Poe';
  readonly hostPatterns = ['poe.com'];

  private readonly selectors = {
    userTurn: '[class*="humanMessage"], [class*="UserMessage"]',
    assistantTurn: '[class*="botMessage"], [class*="BotMessage"]',
    messageContainer: '[class*="Message_row"], [class*="message-row"]',
    input: 'textarea.GrowingTextArea, textarea[class*="TextArea"], [contenteditable="true"]',
    scrollContainer: '[class*="ChatMessages"], [class*="chat-messages"]',
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

    // Fallback: message container rows
    const rows = document.querySelectorAll(this.selectors.messageContainer);
    if (rows.length > 0) {
      const messages: ExtractedMessage[] = [];
      rows.forEach((node, i) => {
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
