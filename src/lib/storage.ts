// src/lib/storage.ts
// Storage layer for snapshots, projects, settings, and analytics.
// All data is stored in chrome.storage.local — nothing leaves the browser.

import type {
  Snapshot,
  Project,
  UserSettings,
  SessionStats,
  EncryptedApiKeys,
  KeyboardShortcuts,
  LLMProvider,
} from './types';

// ─── Keys ───────────────────────────────────────────────────────────────────

const KEYS = {
  SNAPSHOTS: 'sh_snapshots',
  PROJECTS: 'sh_projects',
  SETTINGS: 'sh_settings',
  API_KEYS: 'sh_api_keys',
  STATS: 'sh_stats',
} as const;

// ─── Default Values ─────────────────────────────────────────────────────────

const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  captureSession: 'Ctrl+Shift+C',
  openSidePanel: 'Ctrl+Shift+H',
  injectLastSnapshot: 'Ctrl+Shift+I',
  saveCurrentBrief: 'Ctrl+S',
};

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  defaultMode: 'rule-based',
  llmProvider: 'groq',
  llmModel: 'openai/gpt-oss-120b',
  fallbackOrder: ['groq', 'openai', 'gemini'],
  showInPageButton: true,
  autoInjectEnabled: true,
  contextWarningEnabled: true,
  contextWarningThreshold: 0.7,
  notificationsEnabled: true,
  defaultProjectId: 'default',
  shortcuts: DEFAULT_SHORTCUTS,
};

const DEFAULT_PROJECT: Project = {
  id: 'default',
  name: 'General',
  color: '#6366f1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  snapshotCount: 0,
};

// ─── Helper ─────────────────────────────────────────────────────────────────

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T) ?? fallback;
}

async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

// ─── Snapshots ──────────────────────────────────────────────────────────────

export async function getSnapshots(): Promise<Snapshot[]> {
  return get<Snapshot[]>(KEYS.SNAPSHOTS, []);
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const all = await getSnapshots();
  const idx = all.findIndex((s) => s.id === snapshot.id);
  if (idx >= 0) {
    all[idx] = { ...snapshot, updatedAt: new Date().toISOString(), version: all[idx].version + 1 };
  } else {
    all.unshift(snapshot);
  }
  await set(KEYS.SNAPSHOTS, all);
  // Update project snapshot count
  await updateProjectSnapshotCount(snapshot.projectId);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const all = await getSnapshots();
  const snap = all.find((s) => s.id === id);
  const filtered = all.filter((s) => s.id !== id);
  await set(KEYS.SNAPSHOTS, filtered);
  if (snap) await updateProjectSnapshotCount(snap.projectId);
}

export async function getSnapshotById(id: string): Promise<Snapshot | undefined> {
  const all = await getSnapshots();
  return all.find((s) => s.id === id);
}

export async function searchSnapshots(query: string): Promise<Snapshot[]> {
  const all = await getSnapshots();
  if (!query.trim()) return all.filter((s) => !s.isArchived);
  const q = query.toLowerCase();
  return all.filter(
    (s) =>
      !s.isArchived &&
      (s.name.toLowerCase().includes(q) ||
        s.brief.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.pageTitle.toLowerCase().includes(q))
  );
}

export async function getSnapshotsByProject(projectId: string): Promise<Snapshot[]> {
  const all = await getSnapshots();
  return all.filter((s) => s.projectId === projectId && !s.isArchived);
}

export async function getSnapshotsByTag(tag: string): Promise<Snapshot[]> {
  const all = await getSnapshots();
  return all.filter((s) => s.tags.includes(tag) && !s.isArchived);
}

export async function togglePinSnapshot(id: string): Promise<void> {
  const all = await getSnapshots();
  const snap = all.find((s) => s.id === id);
  if (snap) {
    snap.isPinned = !snap.isPinned;
    snap.updatedAt = new Date().toISOString();
    await set(KEYS.SNAPSHOTS, all);
  }
}

export async function archiveSnapshot(id: string): Promise<void> {
  const all = await getSnapshots();
  const snap = all.find((s) => s.id === id);
  if (snap) {
    snap.isArchived = true;
    snap.updatedAt = new Date().toISOString();
    await set(KEYS.SNAPSHOTS, all);
  }
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const projects = await get<Project[]>(KEYS.PROJECTS, []);
  if (!projects.length) {
    await set(KEYS.PROJECTS, [DEFAULT_PROJECT]);
    return [DEFAULT_PROJECT];
  }
  return projects;
}

export async function saveProject(project: Project): Promise<void> {
  const all = await getProjects();
  const idx = all.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    all[idx] = { ...project, updatedAt: new Date().toISOString() };
  } else {
    all.push(project);
  }
  await set(KEYS.PROJECTS, all);
}

export async function deleteProject(id: string): Promise<void> {
  if (id === 'default') return; // Can't delete default
  const all = await getProjects();
  await set(
    KEYS.PROJECTS,
    all.filter((p) => p.id !== id)
  );
  // Move orphan snapshots to default
  const snapshots = await getSnapshots();
  for (const s of snapshots) {
    if (s.projectId === id) {
      s.projectId = 'default';
    }
  }
  await set(KEYS.SNAPSHOTS, snapshots);
}

async function updateProjectSnapshotCount(projectId: string): Promise<void> {
  const projects = await getProjects();
  const snapshots = await getSnapshots();
  const proj = projects.find((p) => p.id === projectId);
  if (proj) {
    proj.snapshotCount = snapshots.filter(
      (s) => s.projectId === projectId && !s.isArchived
    ).length;
    await set(KEYS.PROJECTS, projects);
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getSettings(): Promise<UserSettings> {
  return get<UserSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  await set(KEYS.SETTINGS, { ...current, ...settings });
}

export { DEFAULT_SETTINGS };

// ─── API Keys (encrypted) ───────────────────────────────────────────────────

export async function getEncryptedKeys(): Promise<EncryptedApiKeys> {
  return get<EncryptedApiKeys>(KEYS.API_KEYS, {});
}

export async function saveEncryptedKey(
  provider: LLMProvider,
  data: { ciphertext: string; iv: string }
): Promise<void> {
  const keys = await getEncryptedKeys();
  keys[provider] = data;
  await set(KEYS.API_KEYS, keys);
}

export async function removeEncryptedKey(provider: LLMProvider): Promise<void> {
  const keys = await getEncryptedKeys();
  delete keys[provider];
  await set(KEYS.API_KEYS, keys);
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export async function getStats(): Promise<SessionStats[]> {
  return get<SessionStats[]>(KEYS.STATS, []);
}

export async function addStats(stat: SessionStats): Promise<void> {
  const all = await getStats();
  all.unshift(stat);
  // Keep only last 500 entries
  if (all.length > 500) all.length = 500;
  await set(KEYS.STATS, all);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export async function getStorageUsage(): Promise<{ used: number; total: number }> {
  const bytes = await chrome.storage.local.getBytesInUse(null);
  return { used: bytes, total: 10_485_760 }; // 10MB limit for chrome.storage.local
}
