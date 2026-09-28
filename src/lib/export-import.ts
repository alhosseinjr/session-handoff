// src/lib/export-import.ts
// Export/import functionality for snapshots and settings.

import type { Snapshot, ExportFormat, ExportData } from './types';
import { getSnapshots, getProjects, getSettings, saveSnapshot, saveProject } from './storage';
import { generateId } from './storage';

/**
 * Export a single snapshot in the specified format.
 */
export function exportSnapshot(snapshot: Snapshot, format: ExportFormat): string {
  switch (format) {
    case 'markdown':
      return exportAsMarkdown(snapshot);
    case 'json':
      return JSON.stringify(snapshot, null, 2);
    case 'text':
      return exportAsPlainText(snapshot);
    default:
      return JSON.stringify(snapshot, null, 2);
  }
}

function exportAsMarkdown(snapshot: Snapshot): string {
  const lines: string[] = [];
  lines.push(`# ${snapshot.name}`);
  lines.push('');
  lines.push(`> Captured from **${snapshot.site}** on ${new Date(snapshot.createdAt).toLocaleString()}`);
  lines.push(`> Messages: ${snapshot.messageCount} · Tokens: ~${snapshot.estimatedTokens}`);
  lines.push(`> Mode: ${snapshot.mode}`);
  if (snapshot.tags.length) lines.push(`> Tags: ${snapshot.tags.join(', ')}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(snapshot.brief);
  return lines.join('\n');
}

function exportAsPlainText(snapshot: Snapshot): string {
  const lines: string[] = [];
  lines.push(`SESSION HANDOFF BRIEF: ${snapshot.name}`);
  lines.push(`Captured from ${snapshot.site} on ${new Date(snapshot.createdAt).toLocaleString()}`);
  lines.push(`Messages: ${snapshot.messageCount} | Tokens: ~${snapshot.estimatedTokens}`);
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('');
  // Strip markdown formatting for plain text
  const plain = snapshot.brief
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_([^_]+)_/g, '$1');
  lines.push(plain);
  return lines.join('\n');
}

/**
 * Export all data as a JSON bundle (for backup/restore).
 */
export async function exportAllData(): Promise<ExportData> {
  const [snapshots, projects, settings] = await Promise.all([
    getSnapshots(),
    getProjects(),
    getSettings(),
  ]);

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    snapshots,
    projects,
    settings,
  };
}

/**
 * Export all data as a downloadable ZIP file using JSZip.
 */
export async function exportAsZip(): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const data = await exportAllData();

  // Add main data file
  zip.file('session-handoff-export.json', JSON.stringify(data, null, 2));

  // Add each snapshot as individual markdown file
  const snapshotsFolder = zip.folder('snapshots');
  if (snapshotsFolder) {
    for (const snapshot of data.snapshots) {
      const safeName = snapshot.name.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '-');
      snapshotsFolder.file(`${safeName}.md`, exportAsMarkdown(snapshot));
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Import data from a JSON export bundle.
 * Merges with existing data (doesn't overwrite unless duplicate IDs).
 */
export async function importData(
  jsonStr: string,
  options: { overwriteExisting?: boolean } = {}
): Promise<{ snapshotsImported: number; projectsImported: number }> {
  const data: ExportData = JSON.parse(jsonStr);

  if (!data.version || !data.snapshots) {
    throw new Error('Invalid import file format');
  }

  let snapshotsImported = 0;
  let projectsImported = 0;

  // Import projects first
  if (data.projects) {
    for (const project of data.projects) {
      if (options.overwriteExisting) {
        await saveProject(project);
        projectsImported++;
      } else {
        // Generate new ID to avoid conflicts
        const newProject = { ...project, id: generateId() };
        await saveProject(newProject);
        projectsImported++;
      }
    }
  }

  // Import snapshots
  for (const snapshot of data.snapshots) {
    if (options.overwriteExisting) {
      await saveSnapshot(snapshot);
    } else {
      const newSnapshot = { ...snapshot, id: generateId() };
      await saveSnapshot(newSnapshot);
    }
    snapshotsImported++;
  }

  return { snapshotsImported, projectsImported };
}

/**
 * Generate a shareable link from a snapshot (base64 encoded, privacy-safe).
 */
export function generateShareLink(snapshot: Snapshot): string {
  const minimalData = {
    n: snapshot.name,
    b: snapshot.brief,
    s: snapshot.site,
    t: snapshot.createdAt,
    mc: snapshot.messageCount,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(minimalData))));
  return `https://session-handoff.dev/share#${encoded}`;
}

/**
 * Parse a shareable link back into snapshot data.
 */
export function parseShareLink(
  url: string
): { name: string; brief: string; site: string; createdAt: string; messageCount: number } | null {
  try {
    const hash = url.split('#')[1];
    if (!hash) return null;
    const decoded = decodeURIComponent(escape(atob(hash)));
    const data = JSON.parse(decoded);
    return {
      name: data.n,
      brief: data.b,
      site: data.s,
      createdAt: data.t,
      messageCount: data.mc,
    };
  } catch {
    return null;
  }
}

export type { ExportData };
