// src/adapters/heuristic.adapter.ts
// Generic heuristic adapter — fallback for unsupported sites.
// Finds the most likely chat container by analyzing DOM structure.

import type { ExtractedMessage } from '../lib/types';
import { BaseAdapter, textOf } from './base.adapter';

export class HeuristicAdapter extends BaseAdapter {
  readonly site = 'unknown' as const;
  readonly displayName = 'Generic (Heuristic)';
  readonly hostPatterns: string[] = []; // matches nothing by default

  matches(_hostname: string): boolean {
    return true; // always matches as last resort
  }

  extractMessages(): ExtractedMessage[] {
    // Strategy 1: Look for elements with role-related attributes
    const roleEls = document.querySelectorAll(
      '[data-role], [data-message-role], [data-author], [data-sender]'
    );
    if (roleEls.length >= 2) {
      return this.extractFromRoleAttributes(roleEls);
    }

    // Strategy 2: Look for repeated structured children in a container
    return this.extractFromStructure();
  }

  private extractFromRoleAttributes(nodes: NodeListOf<Element>): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    nodes.forEach((node) => {
      const roleAttr =
        node.getAttribute('data-role') ??
        node.getAttribute('data-message-role') ??
        node.getAttribute('data-author') ??
        node.getAttribute('data-sender') ??
        '';

      const isUser = /user|human|me|you/i.test(roleAttr);
      const msg = this.buildMessage(node, isUser ? 'user' : 'assistant');
      if (msg.text.trim().length > 5) messages.push(msg);
    });
    return messages;
  }

  private extractFromStructure(): ExtractedMessage[] {
    // Find the container with the most text-heavy repeated children
    const candidates = Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.children.length > 2)
      .map((el) => ({
        el,
        count: el.children.length,
        textLen: textOf(el).length,
      }))
      .filter((c) => c.textLen > 200)
      .sort((a, b) => b.count - a.count);

    if (!candidates.length) return [];

    const container = candidates[0].el;
    const children = Array.from(container.children).filter(
      (c) => textOf(c).trim().length > 20
    );

    return children
      .map((c, i) => this.buildMessage(c, i % 2 === 0 ? 'user' : 'assistant'))
      .filter((m) => m.text.trim());
  }

  getInputElement(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('[contenteditable="true"]') ??
      document.querySelector<HTMLElement>('textarea')
    );
  }
}
