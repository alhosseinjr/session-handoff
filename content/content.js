// content/content.js
//
// Runs on claude.ai, chatgpt.com and chat.openai.com. Extracts the visible
// conversation as an array of {role, text} objects ONLY when the popup asks
// for it (on the user's click). Nothing here runs automatically, polls the
// page, or sends data anywhere — it just answers one message request.

(function () {
  function textOf(el) {
    return (el.innerText || el.textContent || '').trim();
  }

  // ---- ChatGPT adapter ----
  // ChatGPT marks each turn with data-message-author-role="user"/"assistant".
  // Also supports fallback to article elements and turns.
  function extractChatGPT() {
    let nodes = document.querySelectorAll('[data-message-author-role]');
    if (!nodes || nodes.length === 0) {
      nodes = document.querySelectorAll('article');
    }
    const messages = [];
    nodes.forEach((node) => {
      let role = node.getAttribute('data-message-author-role');
      if (!role) {
        if (
          node.querySelector('[data-message-author-role="user"]') ||
          (node.textContent && node.textContent.includes('You said:')) ||
          node.querySelector('[data-testid*="user"]')
        ) {
          role = 'user';
        } else {
          role = 'assistant';
        }
      }
      const text = textOf(node);
      if (text) messages.push({ role: role === 'user' ? 'user' : 'assistant', text });
    });
    return messages.length ? messages : extractGeneric();
  }

  // ---- Claude.ai adapter ----
  // Claude's class names change between releases, so we try a few known
  // patterns first, then fall back to the generic heuristic below if none
  // of them match anything on the page.
  const CLAUDE_USER_SEL =
    '[data-testid="user-turn"], .font-user-message, [data-testid="user-message"]';
  const CLAUDE_ASSISTANT_SEL =
    '[data-testid="assistant-turn"], .font-claude-message, [data-testid="claude-message"]';

  function extractClaude() {
    const all = document.querySelectorAll(`${CLAUDE_USER_SEL}, ${CLAUDE_ASSISTANT_SEL}`);
    const messages = [];
    all.forEach((node) => {
      const isUser = node.matches(CLAUDE_USER_SEL);
      const text = textOf(node);
      if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
    });
    return messages.length ? messages : extractGeneric();
  }

  // ---- Generic fallback ----
  // Used for unsupported sites, or when a known adapter finds nothing (e.g.
  // after a site redesign breaks the selectors above). Heuristic: find the
  // container with the most text-heavy repeated children, and alternate
  // roles by DOM order. This is intentionally rough — good enough to seed a
  // handoff prompt, not meant to be a perfect transcript.
  function extractGeneric() {
    const candidates = Array.from(document.querySelectorAll('body *'))
      .filter((el) => el.children.length > 2)
      .map((el) => ({ el, count: el.children.length, textLen: textOf(el).length }))
      .filter((c) => c.textLen > 200)
      .sort((a, b) => b.count - a.count);

    if (!candidates.length) return [];

    const container = candidates[0].el;
    const children = Array.from(container.children).filter((c) => textOf(c).length > 20);
    return children.map((c, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: textOf(c),
    }));
  }

  function extractMessages() {
    const host = location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return extractChatGPT();
    if (host.includes('claude.ai')) return extractClaude();
    return extractGeneric();
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.type === 'CAPTURE_SESSION') {
      try {
        const messages = extractMessages();
        sendResponse({ ok: true, messages, title: document.title, url: location.href });
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
    }
    return true; // keep the message channel open for the async sendResponse above
  });
})();
