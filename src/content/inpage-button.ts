// src/content/inpage-button.ts
// Injects a floating capture button into the chat interface.
// The button only appears when ≥3 messages are present.

import { getAdapter } from '../adapters';

const BUTTON_ID = 'sh-capture-btn';
const BADGE_ID = 'sh-context-badge';

let observer: MutationObserver | null = null;

/**
 * Initialize the in-page capture button.
 */
export function initInPageButton(): void {
  // Wait for the page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => tryInjectButton());
  } else {
    tryInjectButton();
  }

  // Observe DOM changes to re-inject if needed
  observer = new MutationObserver(debounce(tryInjectButton, 1000));
  observer.observe(document.body, { childList: true, subtree: true });
}

function tryInjectButton(): void {
  // Don't duplicate
  if (document.getElementById(BUTTON_ID)) return;

  const adapter = getAdapter();
  const inputEl = adapter.getInputElement();
  if (!inputEl) return;

  // Check message count
  const count = adapter.getMessageCount();
  if (count < 3) return;

  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.className = 'sh-inpage-btn';
  btn.title = 'Capture session for handoff (Ctrl+Shift+H)';
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  `;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
  });

  // Insert near the input element
  const parent = inputEl.closest('form') ?? inputEl.parentElement;
  if (parent) {
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(btn);
  }
}

/**
 * Show/update the context warning badge.
 */
export function updateContextBadge(level: 'none' | 'yellow' | 'red', percentage: number): void {
  let badge = document.getElementById(BADGE_ID);

  if (level === 'none') {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.className = 'sh-context-badge';
    const btn = document.getElementById(BUTTON_ID);
    if (btn?.parentElement) {
      btn.parentElement.appendChild(badge);
    } else {
      return;
    }
  }

  badge.className = `sh-context-badge sh-badge-${level}`;
  badge.textContent = `${Math.round(percentage * 100)}%`;
  badge.title = `Context window ${Math.round(percentage * 100)}% used`;
}

/**
 * Remove all injected elements.
 */
export function destroyInPageButton(): void {
  document.getElementById(BUTTON_ID)?.remove();
  document.getElementById(BADGE_ID)?.remove();
  observer?.disconnect();
  observer = null;
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as unknown as T;
}
