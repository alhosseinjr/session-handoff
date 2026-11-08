// tests/templater.test.ts
import { describe, it, expect } from 'vitest';
import { buildRuleBasedBrief, detectConversationType } from '../src/lib/templater';
import type { ExtractedMessage } from '../src/lib/types';

function msg(role: 'user' | 'assistant', text: string): ExtractedMessage {
  return {
    role,
    text,
    codeBlocks: [],
    hasToolCall: false,
    fileReferences: [],
    mediaReferences: [],
  };
}

describe('buildRuleBasedBrief', () => {
  it('produces an explicit empty-capture notice instead of a fabricated brief', () => {
    const brief = buildRuleBasedBrief([], { sourceSite: 'chatgpt', url: 'https://chatgpt.com/x' });
    expect(brief).toContain('Empty capture');
    expect(brief).not.toContain('## Task Summary');
  });

  it('briefs real messages with the standard structure', () => {
    const brief = buildRuleBasedBrief(
      [
        msg('user', 'Please fix the login bug in src/auth.ts.'),
        msg('assistant', "I've fixed the bug in src/auth.ts and updated the token check."),
      ],
      { sourceSite: 'chatgpt' }
    );
    expect(brief).toContain('# Session Handoff Brief');
    expect(brief).toContain('2 messages');
  });
});

describe('detectConversationType', () => {
  it('detects an obvious coding conversation', () => {
    const type = detectConversationType([
      msg('user', 'Here is the error stack trace from my TypeScript build.'),
      msg('assistant', 'The bug is in the function that parses the config file.\n```ts\nconst x = 1;\n```'),
    ]);
    expect(['coding', 'general']).toContain(type);
  });

  it('does not crash on empty input', () => {
    expect(() => detectConversationType([])).not.toThrow();
  });
});
