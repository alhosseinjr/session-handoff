// src/adapters/copilot.adapter.ts
// Adapter for copilot.microsoft.com

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter } from './base.adapter';

export class CopilotAdapter extends BaseAdapter {
  readonly site = 'copilot' as const;
  readonly displayName = 'Microsoft Copilot';
  readonly hostPatterns = ['copilot.microsoft.com'];

  private readonly selectors = {
    userTurn: '[data-content="user-message"], .user-message, [class*="UserMessage"]',
    assistantTurn: '[data-content="bot-message"], .bot-message, [class*="BotMessage"]',
    turnContainer: 'cib-message-group, [class*="message-group"]',
    input: '#searchbox, textarea[aria-label], [contenteditable="true"]',
    scrollContainer: 'cib-chat-turn, [class*="chat-container"]',
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
