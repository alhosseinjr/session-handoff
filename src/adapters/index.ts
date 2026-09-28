// src/adapters/index.ts
// Adapter registry — resolves the correct adapter for the current site.

import type { SiteAdapter, SupportedSite } from '../lib/types';
import { ChatGPTAdapter } from './chatgpt.adapter';
import { ClaudeAdapter } from './claude.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { PerplexityAdapter } from './perplexity.adapter';
import { PoeAdapter } from './poe.adapter';
import { CopilotAdapter } from './copilot.adapter';
import { HeuristicAdapter } from './heuristic.adapter';

/** All registered adapters in priority order. */
const ADAPTERS: SiteAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
  new PerplexityAdapter(),
  new PoeAdapter(),
  new CopilotAdapter(),
  new HeuristicAdapter(), // always last — catches everything
];

/**
 * Get the adapter for the current hostname.
 */
export function getAdapter(hostname?: string): SiteAdapter {
  const host = hostname ?? location.hostname;
  for (const adapter of ADAPTERS) {
    if (adapter.site !== 'unknown' && adapter.matches(host)) {
      return adapter;
    }
  }
  return ADAPTERS[ADAPTERS.length - 1]; // HeuristicAdapter
}

/**
 * Detect which supported site the current page is.
 */
export function detectSite(hostname?: string): SupportedSite {
  return getAdapter(hostname).site;
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): SiteAdapter[] {
  return ADAPTERS;
}

/**
 * Get all supported host patterns for manifest.json.
 */
export function getAllHostPatterns(): string[] {
  const patterns: string[] = [];
  for (const adapter of ADAPTERS) {
    if (adapter.site !== 'unknown') {
      for (const pattern of adapter.hostPatterns) {
        patterns.push(`https://${pattern}/*`);
      }
    }
  }
  return patterns;
}

export { ADAPTERS };
