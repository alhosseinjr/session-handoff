// src/lib/types.ts
// Core type definitions for the entire Session Handoff extension.

// ─── Message & Extraction ───────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface CodeBlock {
  language: string;
  content: string;
}

export interface ExtractedMessage {
  role: MessageRole;
  text: string;
  timestamp?: string;
  codeBlocks: CodeBlock[];
  hasToolCall: boolean;
  fileReferences: string[];
  mediaReferences: string[];
}

export interface CaptureResult {
  ok: boolean;
  messages: ExtractedMessage[];
  title: string;
  url: string;
  site: SupportedSite;
  messageCount: number;
  estimatedTokens: number;
  capturedAt: string;
  error?: string;
}

// ─── Adapter System ─────────────────────────────────────────────────────────

export type SupportedSite =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'poe'
  | 'copilot'
  | 'manual'
  | 'unknown';

export interface SiteAdapter {
  readonly site: SupportedSite;
  readonly displayName: string;
  readonly hostPatterns: string[];
  matches(hostname: string): boolean;
  extractMessages(): ExtractedMessage[];
  getInputElement(): HTMLElement | null;
  isVirtualized(): boolean;
  getScrollContainer(): HTMLElement | null;
  getMessageCount(): number;
}

// ─── LLM Providers ─────────────────────────────────────────────────────────

export type LLMProvider = 'groq' | 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface LLMProviderConfig {
  provider: LLMProvider;
  displayName: string;
  apiKeyRequired: boolean;
  apiUrl: string;
  defaultModel: string;
  availableModels: string[];
  maxTokens: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export interface LLMRequest {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: LLMProvider;
}

export interface ChunkSummary {
  chunkIndex: number;
  summary: string;
  messageRange: [number, number];
}

// ─── Storage & Snapshots ────────────────────────────────────────────────────

export interface Snapshot {
  id: string;
  name: string;
  brief: string;
  messages: ExtractedMessage[];
  site: SupportedSite;
  url: string;
  pageTitle: string;
  projectId: string;
  tags: string[];
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  messageCount: number;
  estimatedTokens: number;
  mode: 'rule-based' | 'ai-generated';
  parentSnapshotId?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  snapshotCount: number;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  defaultMode: 'rule-based' | 'smart';
  llmProvider: LLMProvider;
  llmModel: string;
  fallbackOrder: LLMProvider[];
  showInPageButton: boolean;
  autoInjectEnabled: boolean;
  contextWarningEnabled: boolean;
  contextWarningThreshold: number; // 0-1 percentage
  notificationsEnabled: boolean;
  defaultProjectId: string;
  shortcuts: KeyboardShortcuts;
}

export interface KeyboardShortcuts {
  captureSession: string;
  openSidePanel: string;
  injectLastSnapshot: string;
  saveCurrentBrief: string;
}

export interface EncryptedApiKeys {
  [provider: string]: {
    ciphertext: string;
    iv: string;
  };
}

// ─── Context Limit Detection ────────────────────────────────────────────────

export type ContextWarningLevel = 'none' | 'yellow' | 'red';

export interface ContextStatus {
  estimatedTokens: number;
  maxTokens: number;
  percentage: number;
  level: ContextWarningLevel;
}

export interface ModelContextLimits {
  [model: string]: number;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface SessionStats {
  id: string;
  site: SupportedSite;
  messageCount: number;
  estimatedTokens: number;
  capturedAt: string;
  durationEstimate?: number; // ms
}

export interface WeeklySummary {
  weekStart: string;
  totalCaptures: number;
  totalTokens: number;
  siteBreakdown: Record<SupportedSite, number>;
}

// ─── Messages (Inter-component communication) ───────────────────────────────

export type MessageType =
  | 'CAPTURE_SESSION'
  | 'EXECUTE_CAPTURE'
  | 'CAPTURE_RESULT'
  | 'SCROLL_CAPTURE'
  | 'SCROLL_PROGRESS'
  | 'SCROLL_ABORT'
  | 'INJECT_PROMPT'
  | 'INJECT_RESULT'
  | 'GET_CONTEXT_STATUS'
  | 'CONTEXT_STATUS'
  | 'OPEN_SIDEPANEL'
  | 'GET_PAGE_INFO'
  | 'PAGE_INFO';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// ─── Export/Import ──────────────────────────────────────────────────────────

export type ExportFormat = 'markdown' | 'json' | 'text' | 'zip';

export interface ExportData {
  version: string;
  exportedAt: string;
  snapshots: Snapshot[];
  projects: Project[];
  settings?: UserSettings;
}
