// src/sidepanel/sidepanel.ts
// Logic for the side panel UI

import {
  getSettings,
  saveSettings,
  getSnapshots,
  getSnapshotById,
  saveSnapshot,
  deleteSnapshot,
  searchSnapshots,
  saveEncryptedKey,
  getEncryptedKeys,
  generateId,
} from '../lib/storage';
import { PROVIDER_CONFIGS, testLLMConnection } from '../lib/llm';
import type { Snapshot, UserSettings, LLMProvider } from '../lib/types';

// DOM Elements
const els = {
  navCapture: document.getElementById('nav-capture') as HTMLButtonElement,
  navSnapshots: document.getElementById('nav-snapshots') as HTMLButtonElement,
  navSettings: document.getElementById('nav-settings') as HTMLButtonElement,
  viewCapture: document.getElementById('view-capture') as HTMLElement,
  viewSnapshots: document.getElementById('view-snapshots') as HTMLElement,
  viewSettings: document.getElementById('view-settings') as HTMLElement,
  
  // Capture View
  btnCapture: document.getElementById('btn-capture') as HTMLButtonElement,
  emptyState: document.getElementById('empty-state') as HTMLElement,
  editorContainer: document.getElementById('editor-container') as HTMLElement,
  briefEditor: document.getElementById('brief-editor') as HTMLTextAreaElement,
  snapshotTitle: document.getElementById('snapshot-title') as HTMLElement,
  snapshotModeBadge: document.getElementById('snapshot-mode-badge') as HTMLElement,
  captureWarning: document.getElementById('capture-warning') as HTMLElement,
  btnCopy: document.getElementById('btn-copy') as HTMLButtonElement,
  btnSave: document.getElementById('btn-save') as HTMLButtonElement,
  
  // Snapshots View
  searchInput: document.getElementById('search-input') as HTMLInputElement,
  snapshotsList: document.getElementById('snapshots-list') as HTMLElement,
  
  // Settings View
  selMode: document.getElementById('sel-mode') as HTMLSelectElement,
  aiSettings: document.getElementById('ai-settings') as HTMLElement,
  selProvider: document.getElementById('sel-provider') as HTMLSelectElement,
  inputApikey: document.getElementById('input-apikey') as HTMLInputElement,
  btnSaveKey: document.getElementById('btn-save-key') as HTMLButtonElement,
  btnTestKey: document.getElementById('btn-test-key') as HTMLButtonElement,
  testKeyResult: document.getElementById('test-key-result') as HTMLElement,
  chkAutoinject: document.getElementById('chk-autoinject') as HTMLInputElement,
  chkInpage: document.getElementById('chk-inpage') as HTMLInputElement,
};

let currentSnapshotId: string | null = null;
let settingsCache: UserSettings | null = null;

// ─── Navigation ─────────────────────────────────────────────────────────────

function switchView(viewId: 'capture' | 'snapshots' | 'settings') {
  // Update Nav
  els.navCapture.classList.toggle('active', viewId === 'capture');
  els.navSnapshots.classList.toggle('active', viewId === 'snapshots');
  els.navSettings.classList.toggle('active', viewId === 'settings');

  // Update Views
  els.viewCapture.classList.toggle('hidden', viewId !== 'capture');
  els.viewSnapshots.classList.toggle('hidden', viewId !== 'snapshots');
  els.viewSettings.classList.toggle('hidden', viewId !== 'settings');

  els.viewCapture.classList.toggle('active', viewId === 'capture');
  els.viewSnapshots.classList.toggle('active', viewId === 'snapshots');
  els.viewSettings.classList.toggle('active', viewId === 'settings');

  if (viewId === 'snapshots') loadSnapshotsList();
  if (viewId === 'settings') loadSettings();
}

els.navCapture.addEventListener('click', () => switchView('capture'));
els.navSnapshots.addEventListener('click', () => switchView('snapshots'));
els.navSettings.addEventListener('click', () => switchView('settings'));

// ─── Capture Flow ───────────────────────────────────────────────────────────

els.btnCapture.addEventListener('click', async () => {
  els.btnCapture.disabled = true;
  els.btnCapture.textContent = 'Capturing...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id) {
      // Trigger background script capture sequence via messaging or command
      // Wait, we can just send a message to background script to do it,
      // but background script handles the tab logic. Let's just execute capture directly or via background.
      chrome.runtime.sendMessage({ type: 'EXECUTE_CAPTURE', tabId: tab.id });
    }
  } catch (err) {
    console.error(err);
    alert('Capture failed. Please try again on a supported chat page.');
    els.btnCapture.disabled = false;
    els.btnCapture.textContent = 'Capture Now';
  }
});

// Listen for capture results from background script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CAPTURE_RESULT') {
    els.btnCapture.disabled = false;
    els.btnCapture.textContent = 'Capture Now';
    
    if (msg.payload.success) {
      if (msg.payload.warning) {
        els.captureWarning.classList.remove('hidden');
        els.captureWarning.textContent = msg.payload.warning;
      } else {
        els.captureWarning.classList.add('hidden');
      }
      loadLatestCapture();
    } else {
      alert(`Capture failed: ${msg.payload.error}`);
    }
  }
});

async function loadLatestCapture() {
  const snaps = await getSnapshots();
  if (snaps.length > 0) {
    loadSnapshotIntoEditor(snaps[0].id);
  }
}

// ─── Editor ─────────────────────────────────────────────────────────────────

async function loadSnapshotIntoEditor(id: string) {
  const snap = await getSnapshotById(id);
  if (!snap) return;

  currentSnapshotId = snap.id;
  els.emptyState.classList.add('hidden');
  els.editorContainer.classList.remove('hidden');
  
  els.snapshotTitle.textContent = snap.name;
  els.briefEditor.value = snap.brief;

  if (snap.mode === 'ai-generated') {
    els.snapshotModeBadge.className = 'badge badge-ai';
    els.snapshotModeBadge.textContent = '✨ Smart AI';
  } else {
    els.snapshotModeBadge.className = 'badge badge-rule';
    els.snapshotModeBadge.textContent = '⚡ Rule-Based';
  }

  switchView('capture');
}

els.btnSave.addEventListener('click', async () => {
  const brief = els.briefEditor.value.trim();
  const name = els.snapshotTitle.textContent?.trim() || 'Untitled Snapshot';

  if (!currentSnapshotId) {
    if (!brief) return;
    const newSnap: Snapshot = {
      id: generateId(),
      name,
      brief,
      messages: [],
      site: 'manual',
      url: '',
      pageTitle: name,
      projectId: 'default',
      tags: [],
      isPinned: false,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      messageCount: 0,
      estimatedTokens: 0,
      mode: 'rule-based',
    };
    await saveSnapshot(newSnap);
    currentSnapshotId = newSnap.id;
    els.btnSave.textContent = 'Saved!';
    setTimeout(() => (els.btnSave.textContent = '💾 Save'), 2000);
    return;
  }

  const snap = await getSnapshotById(currentSnapshotId);
  if (snap) {
    snap.name = name;
    snap.brief = els.briefEditor.value;
    await saveSnapshot(snap);
    els.btnSave.textContent = 'Saved!';
    setTimeout(() => (els.btnSave.textContent = '💾 Save'), 2000);
  }
});

els.btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(els.briefEditor.value);
  els.btnCopy.textContent = 'Copied!';
  setTimeout(() => (els.btnCopy.textContent = '📋 Copy'), 2000);
});

// ─── Snapshots List ─────────────────────────────────────────────────────────

async function loadSnapshotsList(query = '') {
  const snaps = await searchSnapshots(query);
  els.snapshotsList.innerHTML = '';
  
  if (snaps.length === 0) {
    els.snapshotsList.innerHTML = `
      <div class="empty-state">
        <p>No snapshots found</p>
        <p class="subtitle">Captures and saved summaries will appear here.</p>
      </div>`;
    return;
  }

  snaps.forEach(snap => {
    const div = document.createElement('div');
    div.className = 'snapshot-item';
    div.innerHTML = `
      <div class="snapshot-header-row">
        <h3>${escapeHtml(snap.name)}</h3>
        <div class="snapshot-actions">
          <button class="icon-btn-sm copy-snap-btn" title="Copy brief">📋</button>
          <button class="icon-btn-sm delete-snap-btn" title="Delete snapshot">🗑️</button>
        </div>
      </div>
      <div class="snapshot-meta">
        <span class="badge site-badge">${escapeHtml(snap.site)}</span>
        <span>${new Date(snap.createdAt).toLocaleDateString()}</span>
        <span>•</span>
        <span>${snap.messageCount || 0} msgs</span>
      </div>
    `;

    div.addEventListener('click', () => loadSnapshotIntoEditor(snap.id));

    const copyBtn = div.querySelector('.copy-snap-btn');
    copyBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(snap.brief);
      copyBtn.textContent = '✓';
      setTimeout(() => (copyBtn.textContent = '📋'), 1500);
    });

    const delBtn = div.querySelector('.delete-snap-btn');
    delBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete snapshot "${snap.name}"?`)) {
        await deleteSnapshot(snap.id);
        if (currentSnapshotId === snap.id) {
          currentSnapshotId = null;
          els.emptyState.classList.remove('hidden');
          els.editorContainer.classList.add('hidden');
        }
        await loadSnapshotsList(els.searchInput.value);
      }
    });

    els.snapshotsList.appendChild(div);
  });
}

els.searchInput.addEventListener('input', (e) => {
  loadSnapshotsList((e.target as HTMLInputElement).value);
});

// ─── Settings ───────────────────────────────────────────────────────────────

async function updateKeyStatus() {
  const provider = els.selProvider.value as LLMProvider;
  if (provider === 'ollama') {
    els.inputApikey.disabled = true;
    els.inputApikey.value = '';
    els.inputApikey.placeholder = 'No API key needed (Local Ollama)';
    els.btnSaveKey.disabled = true;
    els.btnSaveKey.textContent = 'Not Needed';
    return;
  }
  els.inputApikey.disabled = false;
  els.btnSaveKey.disabled = false;
  const keys = await getEncryptedKeys();
  if (keys[provider]) {
    els.inputApikey.placeholder = '•••••••••••••••• (API Key Active)';
    els.btnSaveKey.textContent = 'Update Key';
  } else {
    els.inputApikey.placeholder = 'Enter API Key';
    els.btnSaveKey.textContent = 'Save Key';
  }
}

async function loadSettings() {
  settingsCache = await getSettings();
  
  els.selMode.value = settingsCache.defaultMode;
  els.chkAutoinject.checked = settingsCache.autoInjectEnabled;
  els.chkInpage.checked = settingsCache.showInPageButton;
  els.selProvider.value = settingsCache.llmProvider;
  
  toggleAiSettings();
  await updateKeyStatus();
}

function toggleAiSettings() {
  if (els.selMode.value === 'smart') {
    els.aiSettings.classList.remove('hidden');
  } else {
    els.aiSettings.classList.add('hidden');
  }
}

els.selMode.addEventListener('change', async () => {
  toggleAiSettings();
  await saveSettings({ defaultMode: els.selMode.value as 'smart' | 'rule-based' });
});

els.chkAutoinject.addEventListener('change', async () => {
  await saveSettings({ autoInjectEnabled: els.chkAutoinject.checked });
});

els.chkInpage.addEventListener('change', async () => {
  await saveSettings({ showInPageButton: els.chkInpage.checked });
});

els.selProvider.addEventListener('change', async () => {
  const provider = els.selProvider.value as LLMProvider;
  const defaultModel = PROVIDER_CONFIGS[provider]?.defaultModel || 'gpt-4o-mini';
  await saveSettings({ llmProvider: provider, llmModel: defaultModel });
  await updateKeyStatus();
});

els.btnSaveKey.addEventListener('click', async () => {
  const provider = els.selProvider.value as LLMProvider;
  const key = els.inputApikey.value.trim();
  if (!key) return;
  
  try {
    const { encrypt } = await import('../lib/crypto');
    const encrypted = await encrypt(key);
    await saveEncryptedKey(provider, encrypted);
    // Auto-activate Smart AI mode so captures use the new key
    await saveSettings({ defaultMode: 'smart' });
    els.selMode.value = 'smart';
    toggleAiSettings();

    els.inputApikey.value = '';
    els.btnSaveKey.textContent = '✓ Saved!';
    await updateKeyStatus();
    setTimeout(() => {
      els.btnSaveKey.textContent = 'Update Key';
    }, 2000);
  } catch (err) {
    alert('Failed to encrypt/save key');
  }
});

els.btnTestKey.addEventListener('click', async () => {
  const provider = els.selProvider.value as LLMProvider;
  const inputKey = els.inputApikey.value.trim();
  els.btnTestKey.disabled = true;
  els.btnTestKey.textContent = 'Testing...';
  els.testKeyResult.classList.remove('hidden');
  els.testKeyResult.className = 'test-result';
  els.testKeyResult.textContent = `Testing connection to ${provider}...`;

  try {
    const res = await testLLMConnection(provider, inputKey || undefined);
    if (res.success) {
      els.testKeyResult.className = 'test-result success';
      els.testKeyResult.innerHTML = `✅ <strong>Connected!</strong> Model <code>${res.model}</code> responded successfully.`;
    } else {
      els.testKeyResult.className = 'test-result error';
      els.testKeyResult.innerHTML = `❌ <strong>Failed:</strong> ${escapeHtml(res.message)}`;
    }
  } catch (err) {
    els.testKeyResult.className = 'test-result error';
    els.testKeyResult.innerHTML = `❌ <strong>Error:</strong> ${escapeHtml((err as Error).message)}`;
  } finally {
    els.btnTestKey.disabled = false;
    els.btnTestKey.textContent = '⚡ Test Connection';
  }
});

// ─── Init ───────────────────────────────────────────────────────────────────

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

(async () => {
  await loadSettings();
  loadLatestCapture();
})();
