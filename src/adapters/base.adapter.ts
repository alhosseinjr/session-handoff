// src/adapters/base.adapter.ts
// Base adapter class and utilities shared by all site-specific adapters.

import type { SiteAdapter, SupportedSite, ExtractedMessage, CodeBlock } from '../lib/types';

/**
 * Extract text content from a DOM element, preserving code block structure.
 */
export function textOf(el: Element): string {
  return (el as HTMLElement).innerText || el.textContent || '';
}

/**
 * Extract code blocks from an element, preserving language tags.
 */
export function extractCodeBlocksFromElement(el: Element): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const codeEls = el.querySelectorAll('pre code, pre');

  for (const codeEl of codeEls) {
    const lang =
      codeEl.className
        .split(/\s+/)
        .find((c) => c.startsWith('language-') || c.startsWith('hljs-'))
        ?.replace(/^(language-|hljs-)/, '') ?? '';
    blocks.push({
      language: lang,
      content: codeEl.textContent?.trim() ?? '',
    });
  }

  return blocks;
}

/**
 * Detect file references in text (e.g., "src/utils.ts", "package.json").
 */
export function extractFileRefs(text: string): string[] {
  const pattern =
    /\b[\w./-]+\.(ts|tsx|js|jsx|py|rs|go|java|css|html|json|yaml|yml|toml|md|sql|sh|rb|php|c|cpp|h|hpp|swift|kt)\b/g;
  const matches = text.match(pattern);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Check if a node contains tool/function call indicators.
 */
export function hasToolCall(el: Element): boolean {
  const text = el.textContent ?? '';
  return (
    /\btool_use\b|function_call|<tool>|<function>|```tool_code/i.test(text) ||
    !!el.querySelector('[data-tool], [class*="tool-call"], [class*="function-call"]')
  );
}

/**
 * Extract media references (images, links to files).
 */
export function extractMediaRefs(el: Element): string[] {
  const refs: string[] = [];
  const images = el.querySelectorAll('img[src]');
  for (const img of images) {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:')) {
      refs.push(src);
    }
  }
  return refs;
}

/**
 * Abstract base for all site adapters.
 * Subclasses must implement the abstract methods.
 */
export abstract class BaseAdapter implements SiteAdapter {
  abstract readonly site: SupportedSite;
  abstract readonly displayName: string;
  abstract readonly hostPatterns: string[];

  matches(hostname: string): boolean {
    return this.hostPatterns.some((p) => hostname.includes(p));
  }

  abstract extractMessages(): ExtractedMessage[];

  abstract getInputElement(): HTMLElement | null;

  isVirtualized(): boolean {
    return false;
  }

  getScrollContainer(): HTMLElement | null {
    return null;
  }

  getMessageCount(): number {
    return this.extractMessages().length;
  }

  /**
   * Build an ExtractedMessage from a DOM element.
   */
  protected buildMessage(
    el: Element,
    role: 'user' | 'assistant'
  ): ExtractedMessage {
    const text = textOf(el).trim();
    return {
      role,
      text,
      codeBlocks: extractCodeBlocksFromElement(el),
      hasToolCall: hasToolCall(el),
      fileReferences: extractFileRefs(text),
      mediaReferences: extractMediaRefs(el),
    };
  }
}
