// lib/llm.js

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b'; // Best open model on Groq currently

/**
 * Summarize a raw conversation transcript using Groq API.
 */
async function generateSmartHandoff(rawTranscript, apiKey) {
  if (!apiKey) {
    throw new Error('No Groq API key provided');
  }

  const systemPrompt = `You are a highly skilled assistant tasked with creating a "Handoff Brief" from a chat transcript between a User and an AI.
Your goal is to summarize the session with HIGH TECHNICAL ACCURACY. DO NOT over-abstract. Preserve exact function names, variable names, errors, and critical code snippets.

Output the brief strictly in this Markdown format:
## Role for the New Assistant
[Infer the role, e.g., Expert React Developer, Data Scientist]

## Project / Task Summary
[Clear summary of the overall project]

## Current Objective
[Exactly what the user was trying to achieve at the end of the transcript]

## Completed Work
[List what has already been done or resolved, include specific file names or approaches taken]

## Known Issues / Blockers
[List current bugs, errors, or roadblocks. Quote exact error messages if present]

## Next Steps
[What needs to happen next]

Do not include any pleasantries or conversational text. Output ONLY the markdown structure requested.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Here is the transcript to summarize:\n\n${rawTranscript}` }
  ];

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      temperature: 0.1, // Keep it deterministic and factual
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Groq API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
