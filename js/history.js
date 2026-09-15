/**
 * history.js
 * Tracks recently-generated announcement "signatures" to prevent repeats,
 * persisted to localStorage so protection survives a page reload.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'wardogs_history_v1';

  class HistoryManager {
    constructor(maxSize) {
      this.maxSize = maxSize || 30;
      this.entries = this._load();
    }

    _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn('[WARDOGS] Could not read history from localStorage, starting fresh.', e);
        return [];
      }
    }

    _save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
      } catch (e) {
        console.warn('[WARDOGS] Could not persist history to localStorage.', e);
      }
    }

    has(signature) {
      return this.entries.includes(signature);
    }

    add(signature) {
      this.entries.push(signature);
      while (this.entries.length > this.maxSize) {
        this.entries.shift();
      }
      this._save();
    }

    setMaxSize(size) {
      this.maxSize = size;
      while (this.entries.length > this.maxSize) {
        this.entries.shift();
      }
      this._save();
    }

    clear() {
      this.entries = [];
      this._save();
    }

    get size() {
      return this.entries.length;
    }
  }

  global.WardogsHistory = { HistoryManager };
})(typeof window !== 'undefined' ? window : globalThis);
