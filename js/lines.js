/**
 * lines.js
 * The entire "content system" now: a flat list of pre-written, complete
 * announcements, one per line. No templates, no placeholders, no phrase
 * categories — just curated text and a non-repeating random picker.
 */
(function (global) {
  'use strict';

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.text();
  }

  function parseLines(raw) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Load the announcement list, preferring the prebuilt bundle (works
   * under file://) and falling back to fetching the .txt directly
   * (works when served over http/https).
   */
  async function load() {
    let rawLines;
    if (Array.isArray(global.WARDOGS_LINES)) {
      rawLines = global.WARDOGS_LINES.map((l) => String(l));
    } else {
      const raw = await fetchText('data/announcements.txt');
      rawLines = parseLines(raw);
    }

    const seen = new Set();
    const lines = [];
    let duplicates = 0;
    let empty = 0;

    rawLines.forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        empty++;
        return;
      }
      if (seen.has(line)) {
        duplicates++;
        return;
      }
      seen.add(line);
      lines.push(line);
    });

    if (empty > 0) {
      console.warn(`[WARDOGS] Skipped ${empty} blank line(s) in the announcement list.`);
    }
    if (duplicates > 0) {
      console.warn(`[WARDOGS] Skipped ${duplicates} duplicate line(s) in the announcement list.`);
    }
    if (lines.length === 0) {
      throw new Error('No announcements found. Add lines to data/announcements.txt and rebuild the bundle.');
    }

    console.info(`[WARDOGS] Loaded ${lines.length} announcement${lines.length === 1 ? '' : 's'}.`);
    return lines;
  }

  /**
   * Pick the index of a random line that isn't in recent history,
   * rerolling up to maxAttempts times before gracefully accepting a
   * repeat (so a short list, or a history size close to the list
   * length, never hangs). Returns an index (not the text) because the
   * index doubles as a short, stable share-link id for a static list.
   */
  function pickNext(lines, historyManager, maxAttempts) {
    maxAttempts = maxAttempts || 50;
    if (lines.length === 1) {
      historyManager.add(0);
      return 0;
    }

    let index = Math.floor(Math.random() * lines.length);
    let attempt = 0;
    while (historyManager.has(index) && attempt < maxAttempts) {
      index = Math.floor(Math.random() * lines.length);
      attempt++;
    }
    historyManager.add(index);
    return index;
  }

  global.WardogsLines = { load, pickNext };
})(typeof window !== 'undefined' ? window : globalThis);
