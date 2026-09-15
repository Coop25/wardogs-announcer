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
   * Pick a random line that isn't in recent history, rerolling up to
   * maxAttempts times before gracefully accepting a repeat (so a short
   * list, or a history size close to the list length, never hangs).
   */
  function pickNext(lines, historyManager, maxAttempts) {
    maxAttempts = maxAttempts || 50;
    if (lines.length === 1) {
      historyManager.add(lines[0]);
      return lines[0];
    }

    let choice = lines[Math.floor(Math.random() * lines.length)];
    let attempt = 0;
    while (historyManager.has(choice) && attempt < maxAttempts) {
      choice = lines[Math.floor(Math.random() * lines.length)];
      attempt++;
    }
    historyManager.add(choice);
    return choice;
  }

  global.WardogsLines = { load, pickNext };
})(typeof window !== 'undefined' ? window : globalThis);
