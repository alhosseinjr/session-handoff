// tests/chatgpt-adapter.test.ts
// DOM-based tests for the ChatGPT adapter (legacy + new renderer strategies).

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatGPTAdapter } from '../src/adapters/chatgpt.adapter';

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe('ChatGPTAdapter — legacy renderer', () => {
  beforeEach(() => setBody(''));

  it('extracts user + assistant messages from data-message-author-role nodes', () => {
    setBody(`
      <main>
        <article data-testid="conversation-turn-1">
          <div data-message-author-role="user">How do I center a div?</div>
        </article>
        <article data-testid="conversation-turn-2">
          <div data-message-author-role="assistant">Use flexbox on the parent container.</div>
        </article>
      </main>
    `);
    const adapter = new ChatGPTAdapter();
    const msgs = adapter.extractMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: 'user', text: 'How do I center a div?' });
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toContain('flexbox');
    expect(msgs.some((m) => m.role === 'assistant')).toBe(true);
  });
});

describe('ChatGPTAdapter — new turn-key renderer', () => {
  beforeEach(() => setBody(''));

  it('resolves roles from data-content-search-unit-key suffixes', () => {
    setBody(`
      <main>
        <div data-turn-key="t1">
          <div data-content-search-unit-key="exchange-1:user">How do I center a div?</div>
          <div data-turn-key="t1:assistant">
            <div data-chatgpt-search-unit-key="reply-key:assistant"><div class="markdown">Use flexbox on the parent.</div></div>
          </div>
        </div>
      </main>
    `);
    const adapter = new ChatGPTAdapter();
    const msgs = adapter.extractMessages();
    expect(msgs.some((m) => m.role === 'user' && m.text.includes('center a div'))).toBe(true);
    expect(msgs.some((m) => m.role === 'assistant' && m.text.includes('flexbox'))).toBe(true);
    // contains BOTH roles (outer wrapper must not collapse everything into one bubble)
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
  });

  it('resolves roles from the data-turn attribute and user bubble markers', () => {
    setBody(`
      <main>
        <div data-turn="user">What is 2+2?</div>
        <div data-turn-key="t2"><div data-user-message-bubble>ignored inner duplicate marker</div>
          <span data-conversation-role="assistant"><div class="markdown">It is 4.</div></span>
        </div>
      </main>
    `);
    const adapter = new ChatGPTAdapter();
    const msgs = adapter.extractMessages();
    expect(msgs.some((m) => m.role === 'user' && m.text.includes('2+2'))).toBe(true);
    expect(msgs.some((m) => m.role === 'assistant' && m.text.includes('It is 4'))).toBe(true);
  });

  it('prefers the strategy that captures the most messages over a partial legacy match', () => {
    setBody(`
      <main>
        <div data-message-author-role="user">only legacy user kept its attribute</div>
        <div data-turn="assistant"><div class="markdown">new-renderer assistant reply</div></div>
      </main>
    `);
    const adapter = new ChatGPTAdapter();
    const msgs = adapter.extractMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs.some((m) => m.role === 'assistant' && m.text.includes('new-renderer'))).toBe(true);
  });

  it('skips empty nodes and keeps document order', () => {
    setBody(`
      <main>
        <div data-turn="assistant"><div class="markdown">answer exists</div></div>
        <div data-turn="user"></div>
        <div data-turn="user">follow-up question?</div>
      </main>
    `);
    const adapter = new ChatGPTAdapter();
    const msgs = adapter.extractMessages();
    const texts = msgs.map((m) => m.text);
    expect(texts).toEqual(['answer exists', 'follow-up question?']);
  });
});

describe('ChatGPTAdapter — diagnostics', () => {
  beforeEach(() => setBody(''));

  it('reports counts for both renderer generations', () => {
    setBody(`
      <main>
        <div data-turn-key="t1" data-content-search-unit-key="u:user">hello</div>
        <div data-user-message-bubble></div>
      </main>
    `);
    const adapter = new ChatGPTAdapter();
    const diag = adapter.getDiagnostics();
    expect(diag.turnKeyUnits).toBe(1);
    expect(diag.searchUnitKeys).toBe(1);
    expect(diag.userBubbles).toBe(1);
    expect(diag.textAreaChars).toBeGreaterThan(0);
  });
});
