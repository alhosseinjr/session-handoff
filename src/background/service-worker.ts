// src/background/service-worker.ts
// Background script handling side panel setup, keyboard shortcuts, and context menus.

import { generateSmartHandoffWithFallback } from '../lib/llm';
import { buildRuleBasedBrief } from '../lib/templater';
import { saveSnapshot, getSettings, generateId } from '../lib/storage';
import { getAllHostPatterns } from '../adapters';
import type { CaptureResult, ExtensionMessage } from '../lib/types';

// ─── Setup Side Panel ───────────────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ─── Listeners ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sh-capture-context',
    title: 'Capture Session Context',
    contexts: ['page'],
    documentUrlPatterns: getAllHostPatterns(),
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sh-capture-context' && tab?.id) {
    executeCapture(tab.id);
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  
  if (command === 'capture_session') {
    executeCapture(tab.id);
    chrome.sidePanel.open({ tabId: tab.id });
  } else if (command === 'open_sidepanel') {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((msg: ExtensionMessage & { tabId?: number }, sender) => {
  if (msg.type === 'OPEN_SIDEPANEL' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  } else if (msg.type === 'EXECUTE_CAPTURE') {
    const targetTabId = msg.tabId || sender.tab?.id;
    if (targetTabId) {
      executeCapture(targetTabId);
    }
  }
});

// ─── Core Capture Logic ─────────────────────────────────────────────────────

async function executeCapture(tabId: number) {
  try {
    const settings = await getSettings();
    
    // 1. Tell content script to capture
    let response: any;
    try {
      response = await chrome.tabs.sendMessage(tabId, { type: 'SCROLL_CAPTURE' });
    } catch (err) {
      // If the content script is missing (e.g. user didn't refresh after install), try to inject it
      if ((err as Error).message.includes('Receiving end does not exist')) {
        console.log('Injecting content script dynamically...');
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content/inpage.css']
        });
        // Wait a tiny bit for it to initialize
        await new Promise(r => setTimeout(r, 100));
        response = await chrome.tabs.sendMessage(tabId, { type: 'SCROLL_CAPTURE' });
      } else {
        throw err;
      }
    }

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Content script did not respond.');
    }

    const data = response as CaptureResult;
    
    // 2. Generate Brief
    let brief = '';
    let mode: 'rule-based' | 'ai-generated' = 'rule-based';
    let aiError: string | null = null;

    if (settings.defaultMode === 'smart') {
      try {
        const { brief: aiBrief } = await generateSmartHandoffWithFallback(data.messages);
        brief = aiBrief;
        mode = 'ai-generated';
      } catch (err) {
        aiError = (err as Error).message;
        console.warn('AI generation failed, falling back to rule-based:', aiError);
        brief = buildRuleBasedBrief(data.messages, {
          title: data.title,
          url: data.url,
          sourceSite: data.site,
        });
        brief = `> ⚠️ **Smart AI Notice**: AI generation failed (${aiError}). Generated rule-based brief instead.\n\n` + brief;
      }
    } else {
      brief = buildRuleBasedBrief(data.messages, {
        title: data.title,
        url: data.url,
        sourceSite: data.site,
      });
    }

    // 3. Save snapshot
    const snapshotName = `${data.title} (${new Date().toLocaleDateString()})`;
    await saveSnapshot({
      id: generateId(),
      name: snapshotName,
      brief,
      messages: data.messages,
      site: data.site,
      url: data.url,
      pageTitle: data.title,
      projectId: settings.defaultProjectId,
      tags: [],
      isPinned: false,
      isArchived: false,
      createdAt: data.capturedAt,
      updatedAt: data.capturedAt,
      version: 1,
      messageCount: data.messageCount,
      estimatedTokens: data.estimatedTokens,
      mode,
    });

    // 4. Notify side panel to refresh
    chrome.runtime.sendMessage({
      type: 'CAPTURE_RESULT',
      payload: {
        success: true,
        mode,
        warning: aiError ? `Smart AI failed (${aiError}). Showing fallback rule-based brief.` : undefined,
      },
    });

  } catch (error) {
    console.error('Capture failed:', error);
    chrome.runtime.sendMessage({ 
      type: 'CAPTURE_RESULT', 
      payload: { success: false, error: (error as Error).message } 
    });
  }
}
