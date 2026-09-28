// src/lib/templater.ts
// Rule-based handoff brief generator.
// Produces a structured markdown brief from extracted messages, without any
// network calls. Serves as the fallback when AI mode is unavailable or disabled.

import type { ExtractedMessage } from './types';
import { estimateMessagesTokens, formatTokenCount } from './token-counter';

const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const ISSUE_RE =
  /\b(error|bug|issue|problem|fails?|failing|broken|todo|doesn't work|not working|exception|crash|undefined|null reference)\b/i;
const CONSTRAINT_RE =
  /\b(must|please make sure|don't|do not|never|always|prefer|should not|avoid|requirement|important)\b/i;
const REJECTED_RE =
  /\b(instead of|rather than|avoid using|don't use|won't use|didn't work|that doesn't|wrong approach)\b/i;
const COMPLETED_RE =
  /\b(I've|I have|created|added|implemented|fixed|updated|wrote|built|set up|configured|refactored|migrated|deployed)\b/i;
const FILE_REF_RE = /\b[\w-]+\.(ts|tsx|js|jsx|py|rs|go|java|css|html|json|yaml|yml|toml|md|sql)\b/g;

interface TemplaterMeta {
  sourceSite?: string;
  url?: string;
  title?: string;
}

/**
 * Build a rule-based handoff brief from extracted messages.
 */
export function buildRuleBasedBrief(messages: ExtractedMessage[], meta: TemplaterMeta): string {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const assistantMsgs = messages.filter((m) => m.role === 'assistant');

  const firstUser = userMsgs[0]?.text ?? '';
  const lastUser = userMsgs.at(-1)?.text ?? '';
  const lastAssistant = assistantMsgs.at(-1)?.text ?? '';

  const completed = extractSentences(assistantMsgs, COMPLETED_RE, 10);
  const issues = extractSentences(messages, ISSUE_RE, 8);
  const constraints = extractSentences(userMsgs, CONSTRAINT_RE, 8);
  const rejected = extractSentences(messages, REJECTED_RE, 6);
  const codeBlocks = extractCodeBlocks(assistantMsgs, 5);
  const questions = extractQuestions(lastAssistant, 5);
  const fileRefs = extractFileReferences(messages);
  const tokens = estimateMessagesTokens(messages);

  const lines: string[] = [];

  lines.push('# Session Handoff Brief');
  lines.push('');
  lines.push(
    `_Captured from **${meta.sourceSite ?? 'unknown'}** on ${new Date().toLocaleString()} · ${messages.length} messages · ~${formatTokenCount(tokens)} tokens_`
  );
  if (meta.title) lines.push(`_Page: ${meta.title}_`);
  lines.push('');
  lines.push(
    'You are continuing a previous AI-assisted working session. Do **not** restart from scratch. Read this brief carefully, then continue from the exact current state described below.'
  );
  lines.push('');

  lines.push('## Role for the New Assistant');
  lines.push(
    'Continue as the same kind of assistant this task needs — infer from the context below (technical / product / writing / research / debugging).'
  );
  lines.push('');

  lines.push('## Project / Task Summary');
  lines.push(truncate(firstUser, 800) || '_Not captured — add manually._');
  lines.push('');

  lines.push('## Current Objective');
  lines.push(truncate(lastUser, 600) || '_Not captured — add manually._');
  lines.push('');

  lines.push('## Completed Work');
  lines.push(
    completed.length
      ? toBullets(completed)
      : '_None auto-detected — review transcript and add manually._'
  );
  lines.push('');

  if (fileRefs.length > 0) {
    lines.push('## Files Referenced');
    lines.push(toBullets(fileRefs.slice(0, 20)));
    lines.push('');
  }

  lines.push('## Current Code / State');
  lines.push(codeBlocks.length ? codeBlocks.join('\n\n') : '_No code blocks auto-detected._');
  lines.push('');

  lines.push('## Known Issues / Open Problems');
  lines.push(issues.length ? toBullets(issues) : '_None auto-detected._');
  lines.push('');

  lines.push('## Constraints and Preferences');
  lines.push(constraints.length ? toBullets(constraints) : '_None auto-detected._');
  lines.push('');

  lines.push('## What NOT to Repeat');
  lines.push(rejected.length ? toBullets(rejected) : '_None auto-detected._');
  lines.push('');

  lines.push('## Exact Next Action');
  lines.push(truncate(lastAssistant, 600) || '_Not captured — state the next step manually._');
  lines.push('');

  lines.push('## Open Questions for the User');
  lines.push(questions.length ? toBullets(questions) : '_None auto-detected._');
  lines.push('');

  lines.push('---');
  lines.push(
    `_Auto-generated from ${messages.length} messages using rule-based heuristics (not an LLM). Review and edit before pasting into a new session._`
  );

  return lines.join('\n');
}

/**
 * Detect conversation type from messages (coding, writing, research, debugging).
 */
export function detectConversationType(
  messages: ExtractedMessage[]
): 'coding' | 'writing' | 'research' | 'debugging' | 'general' {
  const allText = messages.map((m) => m.text).join(' ');
  const hasCode = messages.some((m) => m.codeBlocks.length > 0);
  const hasErrors = ISSUE_RE.test(allText);

  if (hasCode && hasErrors) return 'debugging';
  if (hasCode) return 'coding';
  if (/\b(paper|article|essay|blog|write|draft|paragraph|chapter|edit)\b/i.test(allText))
    return 'writing';
  if (/\b(research|study|analysis|data|findings|hypothesis|methodology)\b/i.test(allText))
    return 'research';
  return 'general';
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function extractSentences(msgs: ExtractedMessage[], regex: RegExp, max: number): string[] {
  const out: string[] = [];
  for (const m of msgs) {
    const sentences = m.text.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const trimmed = s.trim();
      if (regex.test(trimmed) && trimmed.length > 10 && trimmed.length < 400) {
        out.push(trimmed);
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

function extractCodeBlocks(msgs: ExtractedMessage[], max: number): string[] {
  const out: string[] = [];
  for (const m of [...msgs].reverse()) {
    const matches = m.text.match(CODE_BLOCK_RE);
    if (matches) {
      for (const block of matches) {
        out.push(block);
        if (out.length >= max) return out.reverse();
      }
    }
  }
  return out.reverse();
}

function extractQuestions(text: string, max: number): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().endsWith('?'))
    .slice(-max);
}

function extractFileReferences(msgs: ExtractedMessage[]): string[] {
  const files = new Set<string>();
  for (const m of msgs) {
    const matches = m.text.match(FILE_REF_RE);
    if (matches) {
      for (const f of matches) files.add(f);
    }
  }
  return Array.from(files);
}

function toBullets(arr: string[]): string {
  return arr.map((s) => '- ' + s).join('\n');
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  text = text.trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export { extractSentences, extractFileReferences, truncate, toBullets };
export type { TemplaterMeta };
export { ISSUE_RE, COMPLETED_RE, CONSTRAINT_RE, REJECTED_RE };
