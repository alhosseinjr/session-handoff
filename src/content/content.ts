// src/content/content.ts
// Main entry point for the content script injected into supported sites.

import { getAdapter } from '../adapters';
import { scrollCapture } from './scroll-capture';
import { initInPageButton, updateContextBadge } from './inpage-button';
import { checkAndShowAutoInject, injectText } from './auto-inject';
import { estimateMessagesTokens, getContextLimit } from '../lib/token-counter';
import type { ExtensionMessage } from '../lib/types';
import './inpage.css';

// State
let abortController: AbortController | null = null;
let contextInterval: ReturnType<typeof setInterval> | null = null;

function handleMessage(
  request: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean | void {
  const adapter = getAdapter();

  switch (request.type) {
    case 'CAPTURE_SESSION': {
      try {
        const messages = adapter.extractMessages();
        const tokens = estimateMessagesTokens(messages);
        sendResponse({
          ok: true,
          messages,
          title: document.title,
          url: location.href,
          site: adapter.site,
          messageCount: messages.length,
          estimatedTokens: tokens,
          capturedAt: new Date().toISOString(),
        });
      } catch (err) {
        sendResponse({ ok: false, error: (err as Error).message });
      }
      return false; // Sync response
    }

    case 'SCROLL_CAPTURE': {
      abortController = new AbortController();
      scrollCapture(adapter, {
        abortSignal: abortController.signal,
        onProgress: (pct, count) => {
          chrome.runtime.sendMessage({
            type: 'SCROLL_PROGRESS',
            payload: { pct, count },
          });
        },
      })
        .then((messages) => {
          const tokens = estimateMessagesTokens(messages);
          sendResponse({
            ok: true,
            messages,
            title: document.title,
            url: location.href,
            site: adapter.site,
            messageCount: messages.length,
            estimatedTokens: tokens,
            capturedAt: new Date().toISOString(),
          });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: (err as Error).message });
        });
      return true; // Async response
    }

    case 'SCROLL_ABORT': {
      abortController?.abort();
      sendResponse({ ok: true });
      return false;
    }

    case 'INJECT_PROMPT': {
      const payload = request.payload as { text: string };
      injectText(payload.text)
        .then((ok) => sendResponse({ ok }))
        .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
      return true;
    }

    case 'GET_PAGE_INFO': {
      sendResponse({
        site: adapter.site,
        title: document.title,
        url: location.href,
        messageCount: adapter.getMessageCount(),
      });
      return false;
    }
  }
}

function initContentScript() {
  chrome.runtime.onMessage.addListener(handleMessage);

  // Initialize UI features based on settings
  chrome.storage.local.get('sh_settings').then((data) => {
    const settings = data.sh_settings;
    if (!settings) return;

    if (settings.showInPageButton) {
      initInPageButton();
    }

    if (settings.contextWarningEnabled) {
      startContextMonitoring(settings.contextWarningThreshold, settings.llmModel);
    }
  });

  // Check for auto-inject if we just loaded a new chat
  checkAutoInject();
}

function startContextMonitoring(threshold: number, model: string) {
  if (contextInterval) clearInterval(contextInterval);
  
  const adapter = getAdapter();
  const limit = getContextLimit(model);

  contextInterval = setInterval(() => {
    const messages = adapter.extractMessages();
    if (messages.length === 0) {
      updateContextBadge('none', 0);
      return;
    }

    const tokens = estimateMessagesTokens(messages);
    const pct = tokens / limit;

    if (pct >= 0.9) {
      updateContextBadge('red', pct);
    } else if (pct >= threshold) {
      updateContextBadge('yellow', pct);
    } else {
      updateContextBadge('none', pct);
    }
  }, 10000); // Check every 10s
}

function checkAutoInject() {
  chrome.storage.local.get(['sh_settings', 'sh_snapshots']).then((data) => {
    const settings = data.sh_settings;
    if (!settings || !settings.autoInjectEnabled) return;

    const snapshots = data.sh_snapshots || [];
    if (snapshots.length === 0) return;

    // Get the most recent snapshot
    const latest = snapshots[0];
    
    // Only offer if the snapshot is recent (e.g. last 24h)
    const ageMs = Date.now() - new Date(latest.createdAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) return;

    checkAndShowAutoInject(latest.name, () => {
      injectText(latest.brief);
    });
  });
}

// Start
initContentScript();
