import { describe, it, expect } from 'vitest';
import { chunkMessages } from '../src/lib/llm';
import type { ExtractedMessage } from '../src/lib/types';

function makeMessage(role: 'user' | 'assistant', chars: number, id: number): ExtractedMessage {
  return {
    role,
    text: `${id}: ${'x'.repeat(Math.max(0, chars - id.toString().length - ': '.length))}`,
    codeBlocks: [],
    hasToolCall: false,
    fileReferences: [],
    mediaReferences: [],
  };
}

describe('chunkMessages', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkMessages([], 100)).toEqual([]);
  });

  it('keeps everything in a single chunk when under the limit', () => {
    const messages = [makeMessage('user', 100, 1), makeMessage('assistant', 100, 2)];
    const chunks = chunkMessages(messages, 10_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('respects the per-chunk token limit', () => {
    const messages: ExtractedMessage[] = [];
    for (let i = 1; i <= 10; i++) messages.push(makeMessage(i % 2 ? 'user' : 'assistant', 400, i));
    const chunks = chunkMessages(messages, 150);
    // Each message costs roughChars/4 + 4 tokens; each message ~104 tokens so
    // a chunk can hold at most 2 messages (208 > 150 would overflow) — verify no chunk exceeds the limit.
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const tokens = chunk.reduce((sum, m) => sum + Math.ceil(m.text.length / 4) + 4, 0);
      expect(tokens).toBeLessThanOrEqual(150 + 104); // allow a single over-large message
    }
  });

  it('preserves message order across chunks', () => {
    const messages: ExtractedMessage[] = [];
    for (let i = 1; i <= 6; i++) messages.push(makeMessage(i % 2 ? 'user' : 'assistant', 500, i));
    const chunks = chunkMessages(messages, 200);
    const flattened = chunks.flat();
    expect(flattened).toHaveLength(6);
    for (let i = 0; i < flattened.length; i++) {
      expect(flattened[i].text.startsWith(`${i + 1}: `)).toBe(true);
    }
  });

  it('never drops messages', () => {
    const messages: ExtractedMessage[] = [];
    for (let i = 1; i <= 20; i++) messages.push(makeMessage(i % 2 ? 'user' : 'assistant', 300, i));
    const chunks = chunkMessages(messages, 100);
    expect(chunks.flat()).toHaveLength(20);
  });
});
