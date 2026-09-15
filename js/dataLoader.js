/**
 * dataLoader.js
 * Loads phrase/template JSON, either from a pre-bundled `data/bundle.js`
 * (works under file:// with a plain <script> tag) or, as a fallback when
 * running from an http(s) server, via fetch() of `data/content.json`.
 *
 * Produces a normalized in-memory data set:
 *   {
 *     templates: [...],
 *     categories: { [categoryName]: PhraseEntry[] },
 *     styles: Set<string>
 *   }
 */
(function (global) {
  'use strict';

  const CONTENT_FILE = 'content.json';

  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.json();
  }

  async function loadRawData() {
    // Preferred path: a prebuilt bundle exposed as window.WARDOGS_DATA.
    // This is what lets index.html work by double-click under file://.
    if (global.WARDOGS_DATA && global.WARDOGS_DATA.templates) {
      return {
        templates: global.WARDOGS_DATA.templates,
        phrases: global.WARDOGS_DATA.phrases
      };
    }

    // Fallback: fetch the single content file directly. Only works when
    // served over http(s) (browsers block fetch() under file://).
    return fetchJson(`data/${CONTENT_FILE}`);
  }

  /**
   * Index every phrase by its own "category" field (not any notion of
   * file or section). This is what lets new categories be added to
   * content.json without touching any JS.
   */
  function buildData(raw, validationLog) {
    const categories = {};
    const styles = new Set();
    const seenPhraseIds = new Set();

    const phrases = Array.isArray(raw.phrases) ? raw.phrases : [];
    if (!Array.isArray(raw.phrases)) {
      validationLog.error(`content.json: "phrases" should be an array, got ${typeof raw.phrases}`);
    }

    phrases.forEach((entry, idx) => {
      const where = `phrases[${idx}]`;
      if (!entry || typeof entry !== 'object') {
        validationLog.error(`${where}: entry is not an object, skipping`);
        return;
      }
      if (!entry.id || typeof entry.id !== 'string') {
        validationLog.error(`${where}: missing/invalid "id", skipping`);
        return;
      }
      if (seenPhraseIds.has(entry.id)) {
        validationLog.error(`${where}: duplicate phrase id "${entry.id}", skipping`);
        return;
      }
      if (!entry.text || typeof entry.text !== 'string' || !entry.text.trim()) {
        validationLog.error(`${where} (${entry.id}): empty or missing "text", skipping`);
        return;
      }
      if (!entry.category || typeof entry.category !== 'string') {
        validationLog.error(`${where} (${entry.id}): missing/invalid "category", skipping`);
        return;
      }
      if (entry.weight !== undefined && (typeof entry.weight !== 'number' || entry.weight < 0)) {
        validationLog.error(`${where} (${entry.id}): invalid "weight" (${entry.weight}), defaulting to 1`);
        entry.weight = 1;
      }
      if (entry.contexts !== undefined && !Array.isArray(entry.contexts)) {
        validationLog.error(`${where} (${entry.id}): "contexts" must be an array, defaulting to ["any"]`);
        entry.contexts = ['any'];
      }
      if (entry.styles !== undefined && !Array.isArray(entry.styles)) {
        validationLog.error(`${where} (${entry.id}): "styles" must be an array, ignoring`);
        entry.styles = [];
      }

      seenPhraseIds.add(entry.id);

      const normalized = {
        id: entry.id,
        text: entry.text.trim(),
        category: entry.category,
        styles: entry.styles || [],
        contexts: (entry.contexts && entry.contexts.length) ? entry.contexts : ['any'],
        weight: typeof entry.weight === 'number' ? entry.weight : 1,
        tags: entry.tags || [],
        requires: entry.requires || [],
        excludes: entry.excludes || []
      };

      (normalized.styles || []).forEach((s) => styles.add(s));

      if (!categories[normalized.category]) categories[normalized.category] = [];
      categories[normalized.category].push(normalized);
    });

    // Templates
    const seenTemplateIds = new Set();
    const placeholderPattern = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
    const computedVars = new Set(['CURRENT_TIME', 'DAY_OF_WEEK', 'TIME_PERIOD']);

    const templates = (raw.templates || []).filter((tpl, idx) => {
      const where = `templates[${idx}]`;
      if (!tpl || typeof tpl !== 'object') {
        validationLog.error(`${where}: entry is not an object, skipping`);
        return false;
      }
      if (!tpl.id || typeof tpl.id !== 'string') {
        validationLog.error(`${where}: missing/invalid "id", skipping`);
        return false;
      }
      if (seenTemplateIds.has(tpl.id)) {
        validationLog.error(`${where}: duplicate template id "${tpl.id}", skipping`);
        return false;
      }
      if (!tpl.template || typeof tpl.template !== 'string') {
        validationLog.error(`${where} (${tpl.id}): missing/invalid "template" string, skipping`);
        return false;
      }
      if (!['short', 'medium', 'long'].includes(tpl.length)) {
        validationLog.error(`${where} (${tpl.id}): invalid "length" ("${tpl.length}"), defaulting to "medium"`);
        tpl.length = 'medium';
      }
      if (tpl.weight !== undefined && (typeof tpl.weight !== 'number' || tpl.weight < 0)) {
        validationLog.error(`${where} (${tpl.id}): invalid "weight", defaulting to 1`);
        tpl.weight = 1;
      }

      // Check every placeholder resolves to a known category or computed var.
      let match;
      placeholderPattern.lastIndex = 0;
      while ((match = placeholderPattern.exec(tpl.template))) {
        const name = match[1];
        if (computedVars.has(name)) continue;
        const categoryName = placeholderToCategory(name);
        if (!categories[categoryName]) {
          validationLog.error(
            `${where} (${tpl.id}): placeholder {{${name}}} references unknown category "${categoryName}" (no phrases loaded for it)`
          );
        }
      }

      seenTemplateIds.add(tpl.id);
      tpl.weight = typeof tpl.weight === 'number' ? tpl.weight : 1;
      return true;
    });

    return { templates, categories, styles };
  }

  /** {{SAFETY_WARNING}} -> "safetyWarning" */
  function placeholderToCategory(name) {
    return name
      .toLowerCase()
      .split('_')
      .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
  }

  function createValidationLog() {
    const errors = [];
    return {
      error(msg) {
        errors.push(msg);
        console.warn(`[WARDOGS validation] ${msg}`);
      },
      errors
    };
  }

  async function load() {
    const validationLog = createValidationLog();
    const raw = await loadRawData();
    const data = buildData(raw, validationLog);
    if (validationLog.errors.length) {
      console.warn(
        `[WARDOGS] Loaded phrase library with ${validationLog.errors.length} validation warning(s). See above.`
      );
    } else {
      console.info('[WARDOGS] Phrase library validated with no issues.');
    }
    return { ...data, validationErrors: validationLog.errors };
  }

  global.WardogsDataLoader = { load, placeholderToCategory };
})(typeof window !== 'undefined' ? window : globalThis);
