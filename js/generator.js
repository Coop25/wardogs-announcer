/**
 * generator.js
 * The procedural announcement engine. Knows nothing about jokes — only
 * about templates, phrase categories, contexts, weights, and history.
 * All comedy content lives in /data/*.json.
 */
(function (global) {
  'use strict';

  const PLACEHOLDER_RE = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
  const COMPUTED_VARS = new Set(['CURRENT_TIME', 'DAY_OF_WEEK', 'TIME_PERIOD', 'HOUR', 'MINUTE']);
  const MAX_RESOLVE_DEPTH = 6;

  function placeholderToCategory(name) {
    return name
      .toLowerCase()
      .split('_')
      .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
  }

  function weightedPick(items, weightFn) {
    weightFn = weightFn || ((x) => (typeof x.weight === 'number' ? x.weight : 1));
    const total = items.reduce((sum, item) => sum + Math.max(weightFn(item), 0), 0);
    if (total <= 0) return items[Math.floor(Math.random() * items.length)];
    let r = Math.random() * total;
    for (const item of items) {
      r -= Math.max(weightFn(item), 0);
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  function pickLength(probabilities) {
    const short = probabilities?.short ?? 0.25;
    const medium = probabilities?.medium ?? 0.55;
    const long = probabilities?.long ?? 0.2;
    const total = short + medium + long || 1;
    const r = Math.random() * total;
    if (r < short) return 'short';
    if (r < short + medium) return 'medium';
    return 'long';
  }

  function isStyleEnabled(style, enabledStyles) {
    if (!enabledStyles) return true;
    return enabledStyles[style] !== false;
  }

  function filterByContext(pool, contexts, anyOnly) {
    const ctxSet = new Set(contexts);
    return pool.filter((entry) => {
      if (entry.contexts.includes('any')) return true;
      if (anyOnly) return false;
      return entry.contexts.some((c) => ctxSet.has(c));
    });
  }

  function filterByStyle(pool, enabledStyles) {
    return pool.filter((entry) => {
      if (!entry.styles.length) return true;
      return entry.styles.some((s) => isStyleEnabled(s, enabledStyles));
    });
  }

  function filterByTags(pool, selectedTags) {
    return pool.filter((entry) => {
      if (entry.excludes.length && entry.excludes.some((t) => selectedTags.has(t))) return false;
      if (entry.requires.length && !entry.requires.some((t) => selectedTags.has(t))) return false;
      return true;
    });
  }

  /**
   * Resolve a phrase category to candidates, progressively relaxing
   * constraints (tags -> context strictness -> styles -> everything)
   * so a small sample library never dead-ends generation.
   */
  function getCandidates(categoryName, categories, ctx, settings, selectedTags, forceAnyOnly) {
    const pool = categories[categoryName];
    if (!pool || !pool.length) return [];

    let candidates = filterByContext(pool, ctx.contexts, forceAnyOnly);
    candidates = filterByStyle(candidates, settings.enabledStyles);
    let withTags = filterByTags(candidates, selectedTags);
    if (withTags.length) return withTags;

    if (candidates.length) return candidates; // relax tags

    candidates = filterByContext(pool, ctx.contexts, false); // relax any-only
    candidates = filterByStyle(candidates, settings.enabledStyles);
    if (candidates.length) return candidates;

    candidates = filterByContext(pool, ctx.contexts, forceAnyOnly); // relax styles
    if (candidates.length) return candidates;

    return pool; // last resort: ignore every filter
  }

  function resolveComputedVar(name, ctx) {
    switch (name) {
      case 'CURRENT_TIME':
        return ctx.currentTime;
      case 'DAY_OF_WEEK':
        return ctx.dayOfWeek;
      case 'TIME_PERIOD':
        return ctx.timePeriodLabel;
      case 'HOUR':
        return String(ctx.hour);
      case 'MINUTE':
        return String(ctx.minute).padStart(2, '0');
      default:
        return null;
    }
  }

  function resolveString(str, state, depth) {
    if (depth > MAX_RESOLVE_DEPTH) return str;
    return str.replace(PLACEHOLDER_RE, (full, name) => {
      if (COMPUTED_VARS.has(name)) {
        return resolveComputedVar(name, state.ctx);
      }
      const categoryName = placeholderToCategory(name);
      const candidates = getCandidates(
        categoryName,
        state.dataset.categories,
        state.ctx,
        state.settings,
        state.selectedTags,
        state.forceAnyOnly
      );
      if (!candidates.length) {
        state.unresolved.push(name);
        return '';
      }
      const picked = weightedPick(candidates);
      state.usedPhrases.push({ category: categoryName, id: picked.id });
      (picked.tags || []).forEach((t) => state.selectedTags.add(t));
      return resolveString(picked.text, state, depth + 1);
    });
  }

  function normalizeText(text) {
    let t = text.replace(/\s+/g, ' ').trim();
    t = t.replace(/\s+([,.!?;:])/g, '$1');
    t = t.replace(/([.!?,;:])(?=[A-Za-z])/g, '$1 ');
    t = t.replace(/([.!?]){2,}/g, '$1');
    t = t.replace(/\s{2,}/g, ' ').trim();
    if (t.length) t = t.charAt(0).toUpperCase() + t.slice(1);
    if (t.length && !/[.!?]$/.test(t)) t += '.';
    return t;
  }

  function buildSignature(templateId, usedPhrases) {
    return `${templateId}|${usedPhrases.map((p) => `${p.category}:${p.id}`).join('|')}`;
  }

  function assembleAnnouncement(template, dataset, ctx, settings, forceAnyOnly) {
    const state = {
      dataset,
      ctx,
      settings,
      forceAnyOnly,
      selectedTags: new Set(),
      usedPhrases: [],
      unresolved: []
    };
    const rawText = resolveString(template.template, state, 0);
    const text = normalizeText(rawText);
    return {
      text,
      rawText,
      usedPhrases: state.usedPhrases,
      unresolved: state.unresolved,
      valid: state.unresolved.length === 0 && !/\{\{|undefined|null/.test(rawText) && text.length > 0
    };
  }

  function pickTemplatePool(templates, length, useTimeAware) {
    let pool = templates.filter((t) => t.length === length && (useTimeAware || !t.timeAware));
    if (!pool.length) pool = templates.filter((t) => t.length === length);
    if (!pool.length) pool = templates;
    return pool;
  }

  /**
   * Generate one announcement, honoring anti-repeat history.
   * @param {object} dataset - { templates, categories, styles }
   * @param {object} settings
   * @param {{has:Function, add:Function}} historyManager
   * @param {Date} [now]
   */
  function generate(dataset, settings, historyManager, now) {
    const ctx = global.WardogsTimeContext.getTimeContext(now);
    const maxAttempts = settings.maxRerollAttempts || 50;
    let rerollCount = 0;
    let lastAttempt = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const length = pickLength(settings.lengthProbabilities);
      const useTimeAware = !!settings.timeAwareEnabled && Math.random() < (settings.timeAwareProbability ?? 0.25);
      const forceAnyOnly = !useTimeAware;
      const templatePool = pickTemplatePool(dataset.templates, length, useTimeAware);
      if (!templatePool.length) {
        throw new Error('No templates available to generate an announcement.');
      }
      const template = weightedPick(templatePool);
      const result = assembleAnnouncement(template, dataset, ctx, settings, forceAnyOnly);
      const signature = buildSignature(template.id, result.usedPhrases);
      const attemptResult = { ...result, template, signature, length, useTimeAware, ctx };

      if (!historyManager.has(signature)) {
        historyManager.add(signature);
        return { ...attemptResult, rerollCount };
      }
      rerollCount++;
      lastAttempt = attemptResult;
    }

    // Graceful fallback: history/library too small to avoid a repeat.
    historyManager.add(lastAttempt.signature);
    return { ...lastAttempt, rerollCount };
  }

  /**
   * Rapidly generate `count` announcements without the UI/timer, and
   * report statistics useful for validating a large phrase library.
   * Does not touch the persistent (localStorage) history.
   */
  function testGenerator(count, dataset, settings) {
    const seen = new Set();
    const inMemoryHistory = {
      has: (sig) => seen.has(sig),
      add: (sig) => {
        seen.add(sig);
      }
    };
    // Emulate the configured history window during the test run.
    const historySize = settings.historySize || 30;
    const window_ = [];
    const boundedHistory = {
      has: (sig) => window_.includes(sig),
      add: (sig) => {
        window_.push(sig);
        while (window_.length > historySize) window_.shift();
        seen.add(sig);
      }
    };

    let duplicateRerolls = 0;
    let unresolvedVariables = 0;
    let invalidAnnouncements = 0;
    let malformedWhitespace = 0;
    let invalidPunctuation = 0;
    const lengthCounts = { short: 0, medium: 0, long: 0 };
    const templateCounts = {};

    const start = performance.now ? performance.now() : Date.now();

    for (let i = 0; i < count; i++) {
      const result = generate(dataset, settings, boundedHistory);
      duplicateRerolls += result.rerollCount;
      unresolvedVariables += result.unresolved.length;
      if (!result.valid) invalidAnnouncements++;
      if (/ {2,}/.test(result.rawText) || /\t/.test(result.rawText)) malformedWhitespace++;
      if (/\s[,.!?;:]/.test(result.rawText) || /[,.!?;:]{2,}/.test(result.text)) invalidPunctuation++;
      lengthCounts[result.length] = (lengthCounts[result.length] || 0) + 1;
      templateCounts[result.template.id] = (templateCounts[result.template.id] || 0) + 1;
    }

    const durationMs = (performance.now ? performance.now() : Date.now()) - start;

    const stats = {
      generated: count,
      uniqueCombinations: seen.size,
      duplicateRerolls,
      unresolvedVariables,
      invalidAnnouncements,
      malformedWhitespace,
      invalidPunctuation,
      lengthDistribution: lengthCounts,
      templateUsage: templateCounts,
      durationMs: Math.round(durationMs)
    };

    console.log(
      `%c[WARDOGS testGenerator] Generated: ${stats.generated.toLocaleString()} | ` +
        `Unique: ${stats.uniqueCombinations.toLocaleString()} | ` +
        `Duplicate rerolls: ${stats.duplicateRerolls} | ` +
        `Unresolved vars: ${stats.unresolvedVariables} | ` +
        `Invalid: ${stats.invalidAnnouncements} | ` +
        `Bad whitespace: ${stats.malformedWhitespace} | ` +
        `Bad punctuation: ${stats.invalidPunctuation} | ` +
        `Time: ${stats.durationMs}ms`,
      'font-weight:bold;'
    );
    console.table(stats.lengthDistribution);
    console.table(stats.templateUsage);

    return stats;
  }

  global.WardogsGenerator = {
    generate,
    testGenerator,
    normalizeText,
    buildSignature,
    placeholderToCategory
  };
})(typeof window !== 'undefined' ? window : globalThis);
