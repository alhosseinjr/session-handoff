// src/content/scroll-capture.ts
// Virtualization-aware capture: auto-scrolls to load all messages,
// with progress reporting and abort capability.

import type { SiteAdapter, ExtractedMessage } from '../lib/types';

export interface ScrollCaptureOptions {
  maxScrollTime: number;     // ms — timeout protection
  scrollStep: number;        // px per scroll step
  renderWaitMs: number;      // ms to wait after each scroll for rendering
  onProgress?: (pct: number, loaded: number) => void;
  abortSignal?: AbortSignal;
}

const DEFAULT_OPTIONS: ScrollCaptureOptions = {
  maxScrollTime: 60_000,
  scrollStep: 800,
  renderWaitMs: 400,
};

/**
 * Perform a full-scroll capture of a virtualized conversation.
 * Scrolls to top, then slowly scrolls down capturing all messages.
 */
export async function scrollCapture(
  adapter: SiteAdapter,
  opts: Partial<ScrollCaptureOptions> = {}
): Promise<ExtractedMessage[]> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const container = adapter.getScrollContainer();

  if (!container) {
    // No scroll container found — just capture what's visible
    return adapter.extractMessages();
  }

  // If not virtualized, just grab everything
  if (!adapter.isVirtualized()) {
    return adapter.extractMessages();
  }

  const startTime = Date.now();
  const allMessages = new Map<string, ExtractedMessage>();

  // Scroll to top first
  container.scrollTop = 0;
  await wait(options.renderWaitMs * 2);

  const totalHeight = container.scrollHeight;
  let currentScroll = 0;
  let lastMessageCount = 0;
  let staleCount = 0;

  while (currentScroll < container.scrollHeight) {
    // Check abort
    if (options.abortSignal?.aborted) {
      break;
    }

    // Check timeout
    if (Date.now() - startTime > options.maxScrollTime) {
      break;
    }

    // Extract visible messages
    const visible = adapter.extractMessages();
    for (const msg of visible) {
      const key = msgKey(msg);
      if (!allMessages.has(key)) {
        allMessages.set(key, msg);
      }
    }

    // Report progress
    const pct = Math.min(99, Math.round((currentScroll / totalHeight) * 100));
    options.onProgress?.(pct, allMessages.size);

    // Check if we're getting new messages
    if (allMessages.size === lastMessageCount) {
      staleCount++;
      if (staleCount > 10) break; // No new content for 10 scroll steps
    } else {
      staleCount = 0;
      lastMessageCount = allMessages.size;
    }

    // Scroll down
    currentScroll += options.scrollStep;
    container.scrollTop = currentScroll;
    await wait(options.renderWaitMs);
  }

  options.onProgress?.(100, allMessages.size);

  // Convert map to sorted array (by insertion order which reflects DOM order)
  return Array.from(allMessages.values());
}

/** Generate a fingerprint key for deduplication. */
function msgKey(msg: ExtractedMessage): string {
  const snippet = msg.text.slice(0, 120).trim();
  return `${msg.role}::${snippet}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
