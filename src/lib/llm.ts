// src/lib/llm.ts
// Multi-provider LLM engine with semantic chunking and adaptive prompts.
// Supports Groq, OpenAI, Anthropic, Google Gemini, and local Ollama.

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  ChunkSummary,
  ExtractedMessage,
} from './types';
import { estimateTokens } from './token-counter';
import { detectConversationType } from './templater';
import { decrypt } from './crypto';
import { getEncryptedKeys, getSettings } from './storage';

// ─── Provider Configurations ────────────────────────────────────────────────

export const PROVIDER_CONFIGS: Record<LLMProvider, LLMProviderConfig> = {
  groq: {
    provider: 'groq',
    displayName: 'Groq',
    apiKeyRequired: true,
    apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'openai/gpt-oss-120b',
    availableModels: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ],
    maxTokens: 65_536,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.00060,
  },
  openai: {
    provider: 'openai',
    displayName: 'OpenAI',
    apiKeyRequired: true,
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    maxTokens: 16_384,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic',
    apiKeyRequired: true,
    apiUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-20241022',
    availableModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'],
    maxTokens: 8_192,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    apiKeyRequired: true,
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.0-flash',
    availableModels: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    maxTokens: 8_192,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
  },
  ollama: {
    provider: 'ollama',
    displayName: 'Ollama (Local)',
    apiKeyRequired: false,
    apiUrl: 'http://localhost:11434/api/chat',
    defaultModel: 'mistral',
    availableModels: ['mistral', 'phi3', 'gemma2'],
    maxTokens: 4_096,
  },
};

// ─── System Prompts by Conversation Type ────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  coding: `You are an expert code assistant creating a "Session Handoff Brief" from a programming chat transcript.
Preserve EXACT function names, variable names, file paths, error messages, and stack traces.
Extract the project structure, current file contents, recent diffs, and dependencies.
Output in this Markdown format:

## Role for the New Assistant
[Specific technical role, e.g., "Senior React/TypeScript Developer"]

## Project / Task Summary
[Clear summary including tech stack and architecture]

## Current Objective
[Exact current coding task]

## Completed Work
[Bulleted list of completed items with file names]

## Files & Code State
[Key file contents, recent changes]

## Known Issues / Blockers
[Exact error messages, stack traces, failing tests]

## Constraints & Architecture Decisions
[Tech choices, patterns, requirements]

## Next Steps
[Specific next coding tasks]`,

  debugging: `You are creating a "Session Handoff Brief" from a debugging session.
Focus on: the exact error, what was tried, what was ruled out, and the current hypothesis.
Preserve ALL error messages, stack traces, and log output VERBATIM.
Output in this Markdown format:

## Role for the New Assistant
[e.g., "Debugging specialist for Node.js/React applications"]

## The Bug
[Clear description of the problem]

## Error Details
[Exact error messages, stack traces, logs]

## Environment
[OS, runtime versions, relevant config]

## What Was Tried
[Numbered list of attempted fixes and their results]

## What Was Ruled Out
[Approaches that didn't work and why]

## Current Hypothesis
[The leading theory for the root cause]

## Next Steps
[What to try next]`,

  writing: `You are creating a "Session Handoff Brief" from a writing/editing session.
Preserve the writing style, tone decisions, structural choices, and feedback incorporated.
Output in this Markdown format:

## Role for the New Assistant
[e.g., "Technical writer specializing in developer documentation"]

## Project Summary
[What's being written, for whom]

## Current State
[Draft status, word count, sections completed]

## Style & Tone Guidelines
[Voice, audience level, formatting preferences]

## Key Decisions Made
[Structural and content choices]

## Feedback Incorporated
[Changes made based on review]

## Next Steps
[What to write/edit next]`,

  research: `You are creating a "Session Handoff Brief" from a research/analysis session.
Preserve sources, findings, methodologies, and analytical frameworks discussed.
Output in this Markdown format:

## Role for the New Assistant
[e.g., "Research analyst specializing in market analysis"]

## Research Topic
[Clear statement of the research question]

## Findings So Far
[Key discoveries with sources]

## Methodology
[Approach used for analysis]

## Data & Sources
[Links, papers, datasets referenced]

## Open Questions
[Unresolved research questions]

## Next Steps
[What to investigate next]`,

  general: `You are creating a "Session Handoff Brief" from a chat transcript.
Summarize with HIGH ACCURACY. Preserve exact names, specific details, and nuanced decisions.
Output in this Markdown format:

## Role for the New Assistant
[Infer the appropriate role]

## Task Summary
[Clear summary of the overall task]

## Current Objective
[What was being worked on at the end]

## Completed Work
[What has been accomplished]

## Key Decisions
[Important choices and their rationale]

## Known Issues
[Current problems or blockers]

## Next Steps
[What needs to happen next]`,
};

// ─── Core LLM Call ──────────────────────────────────────────────────────────

async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const config = PROVIDER_CONFIGS[request.provider];

  // Sanitize API key to prevent "String contains non ISO-8859-1 code point" fetch header errors
  request.apiKey = request.apiKey?.replace(/[^\x20-\x7E]/g, '') || '';

  if (request.provider === 'anthropic') {
    return callAnthropic(request, config);
  }
  if (request.provider === 'gemini') {
    return callGemini(request, config);
  }
  if (request.provider === 'ollama') {
    return callOllama(request, config);
  }
  // OpenAI-compatible (OpenAI, Groq)
  return callOpenAICompatible(request, config);
}

async function callOpenAICompatible(
  request: LLMRequest,
  config: LLMProviderConfig
): Promise<LLMResponse> {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `${config.displayName} API Error: ${response.status} - ${(err as Record<string, Record<string, string>>).error?.message ?? response.statusText}`
    );
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    model: request.model,
    provider: request.provider,
  };
}

async function callAnthropic(
  request: LLMRequest,
  _config: LLMProviderConfig
): Promise<LLMResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': request.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
      temperature: request.temperature,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Anthropic API Error: ${response.status} - ${(err as Record<string, string>).message ?? response.statusText}`
    );
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    model: request.model,
    provider: 'anthropic',
  };
}

async function callGemini(request: LLMRequest, _config: LLMProviderConfig): Promise<LLMResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${request.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: request.systemPrompt }] },
      contents: [{ parts: [{ text: request.userPrompt }] }],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Gemini API Error: ${response.status} - ${(err as Record<string, Record<string, string>>).error?.message ?? response.statusText}`
    );
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    model: request.model,
    provider: 'gemini',
  };
}

async function callOllama(request: LLMRequest, _config: LLMProviderConfig): Promise<LLMResponse> {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      stream: false,
      options: { temperature: request.temperature, num_predict: request.maxTokens },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama Error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.message.content,
    inputTokens: data.prompt_eval_count ?? 0,
    outputTokens: data.eval_count ?? 0,
    model: request.model,
    provider: 'ollama',
  };
}

// ─── Semantic Chunking ──────────────────────────────────────────────────────

/**
 * Split messages into semantic chunks based on topic shifts and token limits.
 * Each chunk should be independently summarizable.
 */
export function chunkMessages(
  messages: ExtractedMessage[],
  maxTokensPerChunk: number = 6000
): ExtractedMessage[][] {
  if (messages.length === 0) return [];

  const chunks: ExtractedMessage[][] = [];
  let current: ExtractedMessage[] = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const msgTokens = estimateTokens(msg.text) + 4;

    // If adding this message would exceed limit, start new chunk
    if (currentTokens + msgTokens > maxTokensPerChunk && current.length > 0) {
      // Try to end on an assistant message boundary for cleaner splits
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(msg);
    currentTokens += msgTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

// ─── Cost Estimation ────────────────────────────────────────────────────────

export interface CostEstimate {
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokensEstimate: number;
  estimatedCost: number;
  currency: string;
}

export function estimateCost(
  messages: ExtractedMessage[],
  provider: LLMProvider,
  model?: string
): CostEstimate {
  const config = PROVIDER_CONFIGS[provider];
  const inputText = messages.map((m) => m.text).join('\n');
  const inputTokens = estimateTokens(inputText);
  const outputTokensEstimate = Math.min(inputTokens * 0.3, 4000); // ~30% of input or 4k max

  const inCost = config.costPer1kInput ?? 0;
  const outCost = config.costPer1kOutput ?? 0;
  const estimatedCost =
    (inputTokens / 1000) * inCost + (outputTokensEstimate / 1000) * outCost;

  return {
    provider,
    model: model ?? config.defaultModel,
    inputTokens,
    outputTokensEstimate: Math.round(outputTokensEstimate),
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    currency: 'USD',
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Get the decrypted API key for a provider.
 */
async function getApiKey(provider: LLMProvider): Promise<string> {
  const keys = await getEncryptedKeys();
  const entry = keys[provider];
  if (!entry) throw new Error(`No API key configured for ${provider}`);
  return decrypt(entry.ciphertext, entry.iv);
}

/**
 * Generate a smart AI handoff brief from messages.
 * Handles chunking for long conversations and falls back through providers.
 */
export async function generateSmartHandoff(
  messages: ExtractedMessage[],
  onProgress?: (status: string) => void,
  overrideProvider?: LLMProvider,
  overrideModel?: string
): Promise<{ brief: string; stats: LLMResponse }> {
  const settings = await getSettings();
  const provider = overrideProvider ?? settings.llmProvider;
  const config = PROVIDER_CONFIGS[provider];
  const model = overrideModel ?? (settings.llmModel && config.availableModels.includes(settings.llmModel) ? settings.llmModel : config.defaultModel);
  const conversationType = detectConversationType(messages);

  onProgress?.(`Detecting conversation type: ${conversationType}`);

  const apiKey = config.apiKeyRequired ? await getApiKey(provider) : '';
  const systemPrompt = SYSTEM_PROMPTS[conversationType];

  // Check if chunking is needed
  const totalTokens = estimateTokens(messages.map((m) => m.text).join('\n'));
  const maxInputForProvider = (config.maxTokens ?? 30_000) * 0.7; // Use 70% of context for input

  if (totalTokens <= maxInputForProvider) {
    // Single pass — conversation fits in one call
    onProgress?.(`Summarizing ${messages.length} messages with ${config.displayName}...`);

    const transcript = messages
      .map((m) => `**${m.role.toUpperCase()}**: ${m.text}`)
      .join('\n\n---\n\n');

    const response = await callLLM({
      provider,
      apiKey,
      model,
      systemPrompt,
      userPrompt: `Here is the transcript to summarize:\n\n${transcript}`,
      maxTokens: 3000,
      temperature: 0.1,
    });

    return { brief: response.content, stats: response };
  }

  // Multi-chunk summarization
  const chunks = chunkMessages(messages, Math.floor(maxInputForProvider * 0.8));
  onProgress?.(`Conversation too long for single pass. Splitting into ${chunks.length} chunks...`);

  const chunkSummaries: ChunkSummary[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Summarizing chunk ${i + 1}/${chunks.length}...`);

    const transcript = chunks[i]
      .map((m) => `**${m.role.toUpperCase()}**: ${m.text}`)
      .join('\n\n---\n\n');

    const response = await callLLM({
      provider,
      apiKey,
      model,
      systemPrompt: `You are summarizing part ${i + 1} of ${chunks.length} of a chat transcript. Capture all key details, decisions, code changes, and action items from this segment. Be thorough but concise.`,
      userPrompt: transcript,
      maxTokens: 2000,
      temperature: 0.1,
    });

    chunkSummaries.push({
      chunkIndex: i,
      summary: response.content,
      messageRange: [0, chunks[i].length - 1],
    });

    totalInputTokens += response.inputTokens;
    totalOutputTokens += response.outputTokens;
  }

  // Synthesis pass — combine chunk summaries into final brief
  onProgress?.('Synthesizing final handoff brief...');

  const synthesisInput = chunkSummaries
    .map((cs) => `### Part ${cs.chunkIndex + 1}\n${cs.summary}`)
    .join('\n\n---\n\n');

  const synthesisResponse = await callLLM({
    provider,
    apiKey,
    model,
    systemPrompt,
    userPrompt: `Below are summaries of ${chunkSummaries.length} sequential parts of a long conversation. Synthesize them into a single, comprehensive handoff brief:\n\n${synthesisInput}`,
    maxTokens: 3000,
    temperature: 0.1,
  });

  return {
    brief: synthesisResponse.content,
    stats: {
      content: synthesisResponse.content,
      inputTokens: totalInputTokens + synthesisResponse.inputTokens,
      outputTokens: totalOutputTokens + synthesisResponse.outputTokens,
      model,
      provider,
    },
  };
}

/**
 * Generate smart handoff with provider fallback chain.
 */
export async function generateSmartHandoffWithFallback(
  messages: ExtractedMessage[],
  onProgress?: (status: string) => void
): Promise<{ brief: string; stats: LLMResponse }> {
  const settings = await getSettings();
  const providers = [settings.llmProvider, ...settings.fallbackOrder.filter((p) => p !== settings.llmProvider)];

  for (const provider of providers) {
    try {
      const config = PROVIDER_CONFIGS[provider];
      onProgress?.(`Trying ${config.displayName}...`);
      const result = await generateSmartHandoff(messages, onProgress, provider, config.defaultModel);
      return result;
    } catch (err) {
      onProgress?.(`${PROVIDER_CONFIGS[provider].displayName} failed: ${(err as Error).message}. Trying next...`);
      continue;
    }
  }

  throw new Error('All LLM providers failed. Please check your API keys and try again.');
}

/**
 * Test connectivity and API key validity for a provider.
 */
export async function testLLMConnection(
  provider: LLMProvider,
  apiKeyInput?: string
): Promise<{ success: boolean; message: string; model: string }> {
  const config = PROVIDER_CONFIGS[provider];
  let apiKey = apiKeyInput?.trim();
  if (!apiKey && config.apiKeyRequired) {
    try {
      apiKey = await getApiKey(provider);
    } catch (err) {
      return {
        success: false,
        message: (err as Error).message,
        model: config.defaultModel,
      };
    }
  }

  const model = config.defaultModel;

  try {
    const res = await callLLM({
      provider,
      apiKey: apiKey || '',
      model,
      systemPrompt: 'You are a test assistant.',
      userPrompt: 'Reply with the single word "CONNECTED".',
      maxTokens: 10,
      temperature: 0,
    });

    return {
      success: true,
      message: res.content.trim(),
      model,
    };
  } catch (err) {
    return {
      success: false,
      message: (err as Error).message,
      model,
    };
  }
}

export { SYSTEM_PROMPTS, callLLM };

