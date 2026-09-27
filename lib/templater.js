// lib/templater.js
//
// Turns a raw list of {role, text} messages into a structured "handoff
// prompt" a new AI session can use to continue the work immediately.
// Entirely rule-based / heuristic — no network call, no API key, no cost.
// It will not be as good as an LLM-written summary, but it's free, private,
// and works offline; it's meant to be reviewed and lightly edited by the
// user before pasting into a new chat, not used blindly.

const Templater = {
  CODE_BLOCK_RE: /```[\s\S]*?```/g,
  ISSUE_RE: /\b(error|bug|issue|problem|fails?|failing|broken|todo|doesn't work|not working)\b/i,
  CONSTRAINT_RE: /\b(must|please make sure|don't|do not|never|always|prefer|should not|avoid)\b/i,
  REJECTED_RE: /\b(instead of|rather than|avoid using|don't use|won't use|didn't work)\b/i,
  COMPLETED_RE: /\b(I've|I have|created|added|implemented|fixed|updated|wrote|built|set up|configured)\b/i,

  build(messages, meta) {
    meta = meta || {};
    const userMsgs = messages.filter((m) => m.role === 'user');
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');

    const firstUser = userMsgs[0] ? userMsgs[0].text : '';
    const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].text : '';
    const lastAssistant = assistantMsgs.length
      ? assistantMsgs[assistantMsgs.length - 1].text
      : '';

    const completed = this.extractSentences(assistantMsgs, this.COMPLETED_RE, 8);
    const issues = this.extractSentences(messages, this.ISSUE_RE, 6);
    const constraints = this.extractSentences(userMsgs, this.CONSTRAINT_RE, 6);
    const rejected = this.extractSentences(messages, this.REJECTED_RE, 6);
    const codeBlocks = this.extractCodeBlocks(assistantMsgs, 3);
    const questions = this.extractQuestions(lastAssistant, 4);

    const lines = [];
    lines.push('# Session Handoff Brief');
    lines.push('');
    lines.push(
      `_Captured from ${meta.sourceSite || 'unknown source'} on ${new Date().toLocaleString()}_`
    );
    lines.push('');
    lines.push(
      'You are continuing a previous AI-assisted working session. Do not restart from scratch. Read this brief, then continue from the exact current state described below.'
    );
    lines.push('');

    lines.push('## Role for the New Assistant');
    lines.push(
      'Continue as the same kind of assistant this task needs (technical / product / writing — infer from context below).'
    );
    lines.push('');

    lines.push('## Project / Task Summary');
    lines.push(this.truncate(firstUser, 600) || '_Not captured — add manually._');
    lines.push('');

    lines.push('## Current Objective');
    lines.push(this.truncate(lastUser, 400) || '_Not captured — add manually._');
    lines.push('');

    lines.push('## Completed Work');
    lines.push(
      completed.length
        ? this.toBullets(completed)
        : '_None auto-detected — review transcript and add manually._'
    );
    lines.push('');

    lines.push('## Current Code / State');
    lines.push(codeBlocks.length ? codeBlocks.join('\n\n') : '_No code blocks auto-detected._');
    lines.push('');

    lines.push('## Known Issues / Open Problems');
    lines.push(issues.length ? this.toBullets(issues) : '_None auto-detected._');
    lines.push('');

    lines.push('## Constraints and Preferences');
    lines.push(constraints.length ? this.toBullets(constraints) : '_None auto-detected._');
    lines.push('');

    lines.push('## What NOT to Repeat');
    lines.push(rejected.length ? this.toBullets(rejected) : '_None auto-detected._');
    lines.push('');

    lines.push('## Exact Next Action');
    lines.push(
      this.truncate(lastAssistant, 400) || '_Not captured — state the next step manually._'
    );
    lines.push('');

    lines.push('## Open Questions for the User');
    lines.push(questions.length ? this.toBullets(questions) : '_None auto-detected._');
    lines.push('');

    lines.push('---');
    lines.push(
      `_Auto-generated from ${messages.length} captured messages using rule-based heuristics, not an LLM. Review and edit before pasting into a new session._`
    );

    return lines.join('\n');
  },

  extractSentences(msgs, regex, max) {
    const out = [];
    for (const m of msgs) {
      const sentences = m.text.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        const trimmed = s.trim();
        if (regex.test(trimmed) && trimmed.length > 10 && trimmed.length < 300) {
          out.push(trimmed);
          if (out.length >= max) return out;
        }
      }
    }
    return out;
  },

  extractCodeBlocks(msgs, max) {
    const out = [];
    for (const m of msgs.slice().reverse()) {
      const matches = m.text.match(this.CODE_BLOCK_RE);
      if (matches) {
        for (const block of matches) {
          out.push(block);
          if (out.length >= max) return out.reverse();
        }
      }
    }
    return out.reverse();
  },

  extractQuestions(text, max) {
    if (!text) return [];
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().endsWith('?'));
    return sentences.slice(-max);
  },

  toBullets(arr) {
    return arr.map((s) => '- ' + s).join('\n');
  },

  truncate(text, max) {
    if (!text) return '';
    text = text.trim();
    return text.length > max ? text.slice(0, max) + '…' : text;
  },
};
