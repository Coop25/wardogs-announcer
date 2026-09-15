/**
 * app.js
 * Wires the UI: timer/rotation, buttons, settings panel, status bar,
 * and the debug/test entry point. Contains no announcement content.
 */
(function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    rotationSeconds: 240,
    historySize: 30,
    lengthProbabilities: { short: 0.25, medium: 0.55, long: 0.2 },
    timeAwareEnabled: true,
    timeAwareProbability: 0.25,
    enabledStyles: {},
    maxRerollAttempts: 50
  };
  const SETTINGS_KEY = 'wardogs_settings_v1';
  const HISTORY_SIZE_OPTIONS = [30, 50, 100, 250, 500];

  const els = {};
  let dataset = null;
  let settings = loadSettings();
  let historyManager = null;

  let sessionGenerated = 0;
  let current = null; // last generate() result
  let remainingSeconds = settings.rotationSeconds;
  let totalSeconds = settings.rotationSeconds;
  let timerId = null;
  let paused = false;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return structuredCloneSettings(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      return {
        ...structuredCloneSettings(DEFAULT_SETTINGS),
        ...parsed,
        lengthProbabilities: {
          ...DEFAULT_SETTINGS.lengthProbabilities,
          ...(parsed.lengthProbabilities || {})
        },
        enabledStyles: { ...(parsed.enabledStyles || {}) }
      };
    } catch (e) {
      console.warn('[WARDOGS] Could not load settings, using defaults.', e);
      return structuredCloneSettings(DEFAULT_SETTINGS);
    }
  }

  function structuredCloneSettings(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('[WARDOGS] Could not persist settings.', e);
    }
  }

  function fmtClock(totalSecs) {
    const s = Math.max(0, Math.round(totalSecs));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function cacheEls() {
    [
      'announcementText', 'countdown', 'progressFill',
      'btnNext', 'btnPause', 'btnResume', 'btnRestart',
      'statusGenerated', 'statusHistory', 'statusContext', 'statusNext',
      'btnSettingsToggle', 'btnDebugToggle', 'settingsPanel', 'debugInfo',
      'debugTemplate', 'debugLength', 'debugTimeAware', 'debugSignature',
      'settingRotationMinutes', 'settingHistorySize',
      'settingLengthShort', 'settingLengthMedium', 'settingLengthLong',
      'settingTimeAwareEnabled', 'settingTimeAwareProbability',
      'settingStylesContainer', 'btnResetSettings', 'btnCloseSettings',
      'loadError'
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function generateAndDisplay(reason) {
    try {
      current = window.WardogsGenerator.generate(dataset, settings, historyManager);
    } catch (e) {
      console.error('[WARDOGS] Generation failed:', e);
      els.announcementText.textContent = 'Announcement generator error — see console.';
      return;
    }
    sessionGenerated++;

    els.announcementText.classList.remove('fade-in');
    // Force reflow so the transition re-triggers on repeated generations.
    void els.announcementText.offsetWidth;
    els.announcementText.textContent = current.text;
    els.announcementText.classList.add('fade-in');

    els.statusGenerated.textContent = `Generated this session: ${sessionGenerated}`;
    els.statusHistory.textContent = `Recent history: ${historyManager.size}/${historyManager.maxSize}`;
    els.statusContext.textContent = `Current context: ${current.ctx.dayOfWeek} ${current.ctx.timePeriodLabel}`;

    els.debugTemplate.textContent = `Template: ${current.template.id}`;
    els.debugLength.textContent = `Length: ${current.length}`;
    els.debugTimeAware.textContent = `Time-aware: ${current.useTimeAware ? 'yes' : 'no'}`;
    els.debugSignature.textContent = `Signature: ${current.signature}`;

    if (current.rerollCount > 0) {
      console.info(`[WARDOGS] Rerolled ${current.rerollCount} time(s) to avoid repeating recent history.`);
    }
    if (current.unresolved.length) {
      console.warn(`[WARDOGS] Unresolved placeholders in generated announcement:`, current.unresolved);
    }
  }

  function resetTimer() {
    totalSeconds = settings.rotationSeconds;
    remainingSeconds = totalSeconds;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    els.countdown.textContent = fmtClock(remainingSeconds);
    els.statusNext.textContent = `Next announcement: ${fmtClock(remainingSeconds)}`;
    const pct = totalSeconds > 0 ? Math.min(100, Math.max(0, ((totalSeconds - remainingSeconds) / totalSeconds) * 100)) : 0;
    els.progressFill.style.width = `${pct}%`;
  }

  function tick() {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      generateAndDisplay('rotation');
      resetTimer();
    } else {
      updateTimerDisplay();
    }
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(tick, 1000);
    paused = false;
    els.btnPause.disabled = false;
    els.btnResume.disabled = true;
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function pause() {
    if (paused) return;
    stopTimer();
    paused = true;
    els.btnPause.disabled = true;
    els.btnResume.disabled = false;
  }

  function resume() {
    if (!paused) return;
    startTimer();
  }

  function restart() {
    resetTimer();
    if (!paused) startTimer();
  }

  function nextAnnouncement() {
    generateAndDisplay('manual');
    resetTimer();
    if (!paused) startTimer();
  }

  // ---------- Settings panel ----------

  function populateSettingsForm() {
    els.settingRotationMinutes.value = (settings.rotationSeconds / 60).toString();
    els.settingHistorySize.innerHTML = HISTORY_SIZE_OPTIONS.map(
      (n) => `<option value="${n}" ${n === settings.historySize ? 'selected' : ''}>${n}</option>`
    ).join('');
    els.settingLengthShort.value = Math.round(settings.lengthProbabilities.short * 100);
    els.settingLengthMedium.value = Math.round(settings.lengthProbabilities.medium * 100);
    els.settingLengthLong.value = Math.round(settings.lengthProbabilities.long * 100);
    els.settingTimeAwareEnabled.checked = !!settings.timeAwareEnabled;
    els.settingTimeAwareProbability.value = Math.round(settings.timeAwareProbability * 100);

    const styles = Array.from(dataset.styles).sort();
    els.settingStylesContainer.innerHTML = styles
      .map((style) => {
        const enabled = settings.enabledStyles[style] !== false;
        return `<label class="style-toggle">
          <input type="checkbox" data-style="${style}" ${enabled ? 'checked' : ''} />
          ${style}
        </label>`;
      })
      .join('');
  }

  function applySettingsFromForm() {
    const minutes = parseFloat(els.settingRotationMinutes.value);
    settings.rotationSeconds = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : DEFAULT_SETTINGS.rotationSeconds;

    settings.historySize = parseInt(els.settingHistorySize.value, 10) || DEFAULT_SETTINGS.historySize;
    historyManager.setMaxSize(settings.historySize);

    const s = parseFloat(els.settingLengthShort.value) || 0;
    const m = parseFloat(els.settingLengthMedium.value) || 0;
    const l = parseFloat(els.settingLengthLong.value) || 0;
    const total = s + m + l || 1;
    settings.lengthProbabilities = { short: s / total, medium: m / total, long: l / total };

    settings.timeAwareEnabled = els.settingTimeAwareEnabled.checked;
    settings.timeAwareProbability = Math.min(100, Math.max(0, parseFloat(els.settingTimeAwareProbability.value) || 0)) / 100;

    els.settingStylesContainer.querySelectorAll('input[data-style]').forEach((cb) => {
      settings.enabledStyles[cb.dataset.style] = cb.checked;
    });

    saveSettings();
    els.statusHistory.textContent = `Recent history: ${historyManager.size}/${historyManager.maxSize}`;
  }

  function resetSettings() {
    settings = structuredCloneSettings(DEFAULT_SETTINGS);
    saveSettings();
    historyManager.setMaxSize(settings.historySize);
    populateSettingsForm();
  }

  // ---------- Wiring ----------

  function wireEvents() {
    els.btnNext.addEventListener('click', nextAnnouncement);
    els.btnPause.addEventListener('click', pause);
    els.btnResume.addEventListener('click', resume);
    els.btnRestart.addEventListener('click', restart);

    els.btnSettingsToggle.addEventListener('click', () => {
      els.settingsPanel.hidden = !els.settingsPanel.hidden;
    });
    els.btnCloseSettings.addEventListener('click', () => {
      els.settingsPanel.hidden = true;
    });
    els.btnDebugToggle.addEventListener('click', () => {
      els.debugInfo.hidden = !els.debugInfo.hidden;
    });
    els.btnResetSettings.addEventListener('click', resetSettings);

    const formInputs = [
      els.settingRotationMinutes, els.settingHistorySize,
      els.settingLengthShort, els.settingLengthMedium, els.settingLengthLong,
      els.settingTimeAwareEnabled, els.settingTimeAwareProbability
    ];
    formInputs.forEach((el) => el.addEventListener('change', applySettingsFromForm));
    els.settingStylesContainer.addEventListener('change', applySettingsFromForm);
  }

  async function init() {
    cacheEls();
    try {
      dataset = await window.WardogsDataLoader.load();
    } catch (e) {
      console.error('[WARDOGS] Failed to load phrase library:', e);
      els.loadError.hidden = false;
      els.loadError.textContent =
        'Could not load the phrase library. If you opened this file directly (file://), ' +
        'make sure data/bundle.js exists (run build.js) or serve the folder with a local static server.';
      return;
    }

    historyManager = new window.WardogsHistory.HistoryManager(settings.historySize);

    populateSettingsForm();
    wireEvents();

    generateAndDisplay('init');
    resetTimer();
    startTimer();

    window.testGenerator = (count) => window.WardogsGenerator.testGenerator(count || 1000, dataset, settings);
    window.WARDOGS_APP = { get dataset() { return dataset; }, get settings() { return settings; }, get historyManager() { return historyManager; } };
    console.info('[WARDOGS] Ready. Try testGenerator(10000) in the console for a stress test.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
