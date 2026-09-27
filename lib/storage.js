// lib/storage.js
//
// Snapshot CRUD helpers over chrome.storage.local — the extension's only
// storage. Loaded as a classic (non-module) script before popup.js, so it
// exposes a plain global `Storage` object. Everything here is local to the
// user's browser profile; nothing is ever sent over the network.

const Storage = {
  KEY: 'handoff_snapshots',

  async getAll() {
    const data = await chrome.storage.local.get(this.KEY);
    return data[this.KEY] || [];
  },

  async save(snapshot) {
    const all = await this.getAll();
    all.unshift(snapshot); // newest first
    await chrome.storage.local.set({ [this.KEY]: all });
    return snapshot;
  },

  async remove(id) {
    const all = await this.getAll();
    const filtered = all.filter((s) => s.id !== id);
    await chrome.storage.local.set({ [this.KEY]: filtered });
  },

  async getPendingSelection() {
    const data = await chrome.storage.local.get('pendingSelection');
    return data.pendingSelection || null;
  },

  async clearPendingSelection() {
    await chrome.storage.local.remove('pendingSelection');
  },

  newId() {
    return 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  },
};
