// src/content/auto-inject.ts
// Detects empty chat interfaces and offers to inject the last snapshot.
// Handles complex injection into contenteditable and textareas.

import { getAdapter } from '../adapters';

const PILL_ID = 'sh-inject-pill';

/**
 * Check if the chat is empty and inject the prompt pill if needed.
 */
export function checkAndShowAutoInject(
  snapshotName: string,
  onInject: () => void
): void {
  const adapter = getAdapter();
  const inputEl = adapter.getInputElement();

  // If there are already messages or no input, do nothing
  if (!inputEl || adapter.getMessageCount() > 0) return;
  if (document.getElementById(PILL_ID)) return;

  const pill = document.createElement('div');
  pill.id = PILL_ID;
  pill.className = 'sh-inject-pill';
  pill.innerHTML = `
    <span class="sh-pill-text">Continue: <strong>${escapeHtml(snapshotName)}</strong>?</span>
    <button class="sh-pill-btn sh-pill-accept">Yes</button>
    <button class="sh-pill-btn sh-pill-dismiss">✕</button>
  `;

  const acceptBtn = pill.querySelector('.sh-pill-accept') as HTMLButtonElement;
  const dismissBtn = pill.querySelector('.sh-pill-dismiss') as HTMLButtonElement;

  acceptBtn.addEventListener('click', (e) => {
    e.preventDefault();
    pill.remove();
    onInject();
  });

  dismissBtn.addEventListener('click', (e) => {
    e.preventDefault();
    pill.remove();
  });

  // Position above the input
  const parent = inputEl.closest('form') ?? inputEl.parentElement;
  if (parent) {
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(pill);
  }
}

/**
 * Inject text into the chat input field safely, triggering framework events.
 * Streams in chunks to prevent freezing the browser on massive prompts.
 */
export async function injectText(text: string): Promise<boolean> {
  const adapter = getAdapter();
  const inputEl = adapter.getInputElement();
  if (!inputEl) return false;

  inputEl.focus();

  const isContentEditable =
    inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true';

  if (isContentEditable) {
    // Clear first
    inputEl.textContent = '';
    
    // For rich editors (ProseMirror in Claude), document.execCommand works best
    // but we need to do it chunk by chunk if it's huge
    const chunks = splitIntoChunks(text, 5000);
    for (const chunk of chunks) {
      document.execCommand('insertText', false, chunk);
      await new Promise((r) => setTimeout(r, 10)); // Yield to main thread
    }
  } else if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
    // Native textarea
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    
    nativeInputValueSetter?.call(inputEl, text);
    
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Trigger auto-resize events often used by React/Vue
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Try to dispatch a 'keydown' for 'Enter' if the user wants it auto-submitted?
  // We won't auto-submit by default for safety.

  return true;
}

function splitIntoChunks(str: string, size: number): string[] {
  const numChunks = Math.ceil(str.length / size);
  const chunks = new Array(numChunks);
  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size);
  }
  return chunks;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
