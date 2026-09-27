# Session Handoff (v0.1 prototype)

A free, local-only browser extension that captures a Claude.ai / ChatGPT
conversation and turns it into a structured "handoff brief" you can paste
into a new chat, tab, or model so it can continue exactly where the last one
left off — without you re-explaining the whole project.

No API keys. No server. No cost. Everything runs in your browser and is
stored in `chrome.storage.local` on your machine only.

## What v1 does

- Injects a content script on `claude.ai`, `chatgpt.com`, and `chat.openai.com`.
- On click of "Capture current tab" in the popup, reads the visible
  conversation from the page DOM.
- Runs it through a **rule-based** (no LLM) template that produces:
  project summary, current objective, completed work, code blocks found,
  known issues, constraints, rejected approaches, next action, and open
  questions.
- Shows the result in an editable textarea.
- Copy to clipboard, or save as a named snapshot you can reload later.
- Right-click → "Send selection to Session Handoff" as a fallback if a
  site's layout changes and the automatic extraction breaks.
- Manual paste-and-generate option, for any site not directly supported.

## What v1 deliberately does NOT do (by design, see the plan we discussed)

- No LLM-assisted summarization (keeps it free and private — this is the
  natural v2 addition once you've used the rule-based version and can see
  where it falls short).
- No automatic "paste into new chat" injection (chat inputs are usually
  rich-text `contenteditable` elements, not plain `<textarea>`s, which makes
  reliable auto-insert fragile — copy-paste is the robust v1 path).
- No auto-detection of "you're about to run out of context."

## Install (Chrome / Edge / Brave — all free, no store account needed)

1. Download/unzip this folder somewhere permanent (don't delete it after
   install — Chrome loads the extension directly from these files).
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top right toggle).
4. Click **Load unpacked**.
5. Select the `handoff-extension` folder (the one containing
   `manifest.json`).
6. Pin the extension (puzzle-piece icon → pin) so it's visible in the
   toolbar.

## Use

1. Open a long conversation on claude.ai or chatgpt.com.
2. Click the extension icon.
3. Click **Capture current tab**.
4. Review/edit the generated brief in the textarea.
5. Click **Copy to clipboard**, open a new chat, paste it as your first
   message.
6. Optionally click **Save snapshot** first if you want to keep it in your
   history for later.

If capture doesn't find anything (site redesign, or an unsupported site):
use the right-click "Send selection to Session Handoff" on selected text,
or the "Paste conversation manually" fallback in the popup.

## Known limitations

- Very long conversations that are virtualized (only the visible portion is
  rendered in the DOM) may only capture what's currently on screen — scroll
  up to load more before capturing.
- Site DOM selectors (`content/content.js`) may need updating if
  claude.ai/chatgpt.com change their markup. The generic fallback heuristic
  should still produce something usable even if the specific selectors stop
  matching.
- The rule-based extraction is heuristic, not perfect — always skim the
  generated brief before using it.

## Folder structure

```
handoff-extension/
├── manifest.json
├── background/service-worker.js   # context menu for the selection fallback
├── content/content.js             # site adapters + generic fallback extractor
├── lib/
│   ├── storage.js                 # chrome.storage.local snapshot CRUD
│   └── templater.js               # rule-based handoff-brief builder
└── popup/
    ├── popup.html
    ├── popup.css
    └── popup.js
```

## Next steps (v2 ideas, once v1 has been used for real)

- Optional LLM-assisted mode using your own Anthropic/OpenAI API key,
  called directly from the extension (still no relay server) — for a
  noticeably better summary than the rule-based pass.
- Chunked summarization for very long transcripts.
- Auto-scroll to load the full conversation before capture.
- In-page "Capture" button injected next to the chat input, so you don't
  need to open the popup at all.
