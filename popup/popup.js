// popup/popup.js
// Wires up the popup UI. Depends on Storage (lib/storage.js) and Templater
// (lib/templater.js) being loaded first as classic scripts (see popup.html).

const captureBtn = document.getElementById('captureBtn');
const captureStatus = document.getElementById('captureStatus');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const saveBtn = document.getElementById('saveBtn');
const titleInput = document.getElementById('titleInput');
const historyList = document.getElementById('historyList');
const pasteInput = document.getElementById('pasteInput');
const generateFromPasteBtn = document.getElementById('generateFromPasteBtn');
const selectionRow = document.getElementById('selectionRow');
const useSelectionBtn = document.getElementById('useSelectionBtn');
const dismissSelectionBtn = document.getElementById('dismissSelectionBtn');
const modeBadge = document.getElementById('modeBadge');
const settingsBtn = document.getElementById('settingsBtn');

let lastMeta = {};
let groqApiKey = null;

chrome.storage.local.get(['groqApiKey'], (result) => {
  if (result.groqApiKey) {
    groqApiKey = result.groqApiKey;
    modeBadge.textContent = 'Smart Mode (Groq)';
    modeBadge.style.backgroundColor = '#10b981';
  }
});

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendCaptureMessage(tabId, callback) {
  chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_SESSION' }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script may not be injected into this pre-existing tab. Inject dynamically.
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: ['content/content.js'],
        },
        () => {
          if (chrome.runtime.lastError) {
            callback(null, new Error(chrome.runtime.lastError.message));
            return;
          }
          // Retry sending message after script injection
          chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_SESSION' }, (retryResponse) => {
            if (chrome.runtime.lastError) {
              callback(null, new Error(chrome.runtime.lastError.message));
            } else {
              callback(retryResponse, null);
            }
          });
        }
      );
    } else {
      callback(response, null);
    }
  });
}

captureBtn.addEventListener('click', async () => {
  captureStatus.textContent = 'Capturing…';
  output.value = '';
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('No active tab found.');

    sendCaptureMessage(tab.id, (response, err) => {
      if (err) {
        captureStatus.textContent =
          'Could not read this page. Please refresh the ChatGPT tab (F5) or use manual paste below.';
        return;
      }
      if (!response || !response.ok) {
        captureStatus.textContent =
          'Capture failed: ' + (response && response.error ? response.error : 'unknown error');
        return;
      }
      if (!response.messages || !response.messages.length) {
        captureStatus.textContent =
          'No messages found on this page. Try scrolling or paste manually.';
        return;
      }
      lastMeta = { sourceSite: new URL(tab.url).hostname, sourceUrl: tab.url };
      
      if (groqApiKey) {
        captureStatus.textContent = `Summarizing ${response.messages.length} messages with AI...`;
        const rawTranscript = response.messages.map(m => `${m.role.toUpperCase()}:\n${m.text}`).join('\n\n');
        generateSmartHandoff(rawTranscript, groqApiKey).then(summary => {
          output.value = `_Captured from ${lastMeta.sourceSite}_\n\n${summary}`;
          titleInput.value = tab.title ? tab.title.slice(0, 60) : '';
          captureStatus.textContent = `Smart summary generated!`;
        }).catch(err => {
          captureStatus.textContent = 'AI Error: ' + err.message;
        });
      } else {
        output.value = Templater.build(response.messages, lastMeta);
        titleInput.value = tab.title ? tab.title.slice(0, 60) : '';
        captureStatus.textContent = `Captured ${response.messages.length} messages (Fast Mode).`;
      }
    });
  } catch (err) {
    captureStatus.textContent = 'Error: ' + err.message;
  }
});

generateFromPasteBtn.addEventListener('click', () => {
  const raw = pasteInput.value.trim();
  if (!raw) return;
  // Rough split: blank-line-separated paragraphs, alternating user/assistant.
  const paragraphs = raw.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const messages = paragraphs.map((p, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: p.trim(),
  }));
  lastMeta = { sourceSite: 'manual paste', sourceUrl: '' };
  
  if (groqApiKey) {
    captureStatus.textContent = `Summarizing pasted text with AI...`;
    generateSmartHandoff(raw, groqApiKey).then(summary => {
      output.value = `_Generated from pasted text_\n\n${summary}`;
      captureStatus.textContent = `Smart summary generated!`;
    }).catch(err => {
      captureStatus.textContent = 'AI Error: ' + err.message;
    });
  } else {
    output.value = Templater.build(messages, lastMeta);
    captureStatus.textContent = `Generated from ${messages.length} pasted blocks (Fast Mode).`;
  }
});

copyBtn.addEventListener('click', async () => {
  if (!output.value) return;
  await navigator.clipboard.writeText(output.value);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => (copyBtn.textContent = 'Copy to clipboard'), 1200);
});

saveBtn.addEventListener('click', async () => {
  if (!output.value.trim()) return;
  const snapshot = {
    id: Storage.newId(),
    title: titleInput.value.trim() || 'Untitled snapshot',
    sourceSite: lastMeta.sourceSite || 'unknown',
    sourceUrl: lastMeta.sourceUrl || '',
    createdAt: Date.now(),
    handoffPrompt: output.value,
  };
  await Storage.save(snapshot);
  await renderHistory();
});

async function renderHistory() {
  const all = await Storage.getAll();
  historyList.innerHTML = '';
  if (!all.length) {
    historyList.innerHTML = '<li class="meta">No snapshots saved yet.</li>';
    return;
  }
  all.forEach((snap) => {
    const li = document.createElement('li');
    const date = new Date(snap.createdAt).toLocaleString();
    li.innerHTML = `
      <div>
        <div>${escapeHtml(snap.title)}</div>
        <div class="meta">${escapeHtml(snap.sourceSite)} · ${date}</div>
      </div>
      <div class="row">
        <button data-action="load" data-id="${snap.id}">Load</button>
        <button data-action="delete" data-id="${snap.id}">Delete</button>
      </div>
    `;
    historyList.appendChild(li);
  });
}

historyList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const action = btn.getAttribute('data-action');
  const all = await Storage.getAll();
  const snap = all.find((s) => s.id === id);
  if (action === 'load' && snap) {
    output.value = snap.handoffPrompt;
    titleInput.value = snap.title;
    captureStatus.textContent = 'Loaded snapshot: ' + snap.title;
  } else if (action === 'delete') {
    await Storage.remove(id);
    await renderHistory();
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function checkPendingSelection() {
  const selection = await Storage.getPendingSelection();
  if (selection) {
    selectionRow.classList.remove('hidden');
    useSelectionBtn.onclick = async () => {
      pasteInput.value = selection;
      selectionRow.classList.add('hidden');
      await Storage.clearPendingSelection();
    };
    dismissSelectionBtn.onclick = async () => {
      selectionRow.classList.add('hidden');
      await Storage.clearPendingSelection();
    };
  }
}

renderHistory();
checkPendingSelection();
