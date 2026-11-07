import { describe, it, expect } from 'vitest';
import { generateShareLink, parseShareLink } from '../src/lib/export-import';
import type { Snapshot } from '../src/lib/types';

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: 'test-id',
    name: 'Handler Migration',
    brief: '# Plan\n\n1. Migrate handler\n2. Add tests ✅',
    messages: [],
    site: 'chatgpt',
    url: 'https://chat.openai.com',
    pageTitle: 'Migration chat',
    projectId: null,
    tags: [],
    isPinned: false,
    isArchived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    messageCount: 12,
    estimatedTokens: 3400,
    mode: 'rule-based',
    ...overrides,
  } as Snapshot;
}

describe('generateShareLink / parseShareLink', () => {
  it('round-trips snapshot content', () => {
    const snapshot = makeSnapshot();
    const link = generateShareLink(snapshot);
    const parsed = parseShareLink(link);

    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe(snapshot.name);
    expect(parsed!.brief).toBe(snapshot.brief);
    expect(parsed!.site).toBe(snapshot.site);
    expect(parsed!.messageCount).toBe(snapshot.messageCount);
  });

  it('handles unicode content without mojibake', () => {
    const snapshot = makeSnapshot({
      name: '汉字 テスト em—dash',
      brief: 'Übersicht: ✅🛠️ émigré',
    });
    const parsed = parseShareLink(generateShareLink(snapshot));
    expect(parsed!.name).toBe(snapshot.name);
    expect(parsed!.brief).toBe(snapshot.brief);
  });

  it('returns null for links without a hash', () => {
    expect(parseShareLink('https://session-handoff.dev/share')).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(parseShareLink('https://session-handoff.dev/share#!!!not-base64!!!')).toBeNull();
  });
});
