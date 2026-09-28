import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from '../src/lib/token-counter';

describe('Token Counter', () => {
  it('estimates tokens for plain text', () => {
    // 20 chars / 4 = 5 tokens
    const text = 'Hello world, this is a test.';
    expect(estimateTokens(text)).toBe(7); // "Hello world, this is a test." length is 28 -> 7
  });

  it('estimates tokens for code blocks accurately', () => {
    const text = 'Here is some code:\n```javascript\nconsole.log("hello");\n```\nDone.';
    // plain: 'Here is some code:\n\nDone.' length 25 -> ~7
    // code: '```javascript\nconsole.log("hello");\n```' length 40 -> ~13
    // total -> ~20
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);
  });

  it('handles empty strings', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates message array tokens including overhead', () => {
    const messages = [
      { text: 'Hello', role: 'user' as const },
      { text: 'Hi there', role: 'assistant' as const }
    ];
    // Hello -> 2, Hi there -> 2. Overhead: 4 per message = 8. Total ~12.
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBeGreaterThan(8);
  });
});
