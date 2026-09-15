/**
 * app.js
 * Wires the UI: timer/rotation, buttons, settings panel, status bar,
 * share links, and the team picker. Contains no announcement content —
 * that all lives in data/announcements.txt.
 */
(function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    rotationSeconds: 240,
    historySize: 30
  };
  const SETTINGS_KEY = 'wardogs_settings_v1';
  const HISTORY_SIZE_OPTIONS = [30, 50, 100, 250, 500];
  const SHARE_PARAM = 'say';
  const TEAMS = ['green', 'blue', 'red'];

  const els = {};
  let lines = [];
  let settings = loadSettings();
  let historyManager = null;

  let sessionGenerated = 0;
  let currentAnnouncementText = ''; // whatever's currently on screen
  let remainingSeconds = settings.rotationSeconds;
  let totalSeconds = settings.rotationSeconds;
  let timerId = null;
  let paused = false;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
      console.warn('[WARDOGS] Could not load settings, using defaults.', e);
      return { ...DEFAULT_SETTINGS };
    }
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
      'announcementText', 'countdown', 'progressFill', 'teamBadge',
      'btnNext', 'btnPause', 'btnResume', 'btnRestart', 'btnShare',
      'statusGenerated', 'statusHistory', 'statusLibrary', 'statusNext',
      'btnSettingsToggle', 'btnDebugToggle', 'settingsPanel', 'debugInfo', 'debugLine',
      'settingRotationMinutes', 'settingHistorySize',
      'btnResetSettings', 'btnCloseSettings',
      'loadError',
      'shareToast', 'shareLinkInput', 'shareStatus', 'btnCopyShareLink', 'btnCloseShareToast'
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function showNextAnnouncement() {
    const text = window.WardogsLines.pickNext(lines, historyManager);
    display(text);
  }

  function display(text) {
    currentAnnouncementText = text;
    sessionGenerated++;

    els.announcementText.classList.remove('fade-in');
    // Force reflow so the transition re-triggers on repeated generations.
    void els.announcementText.offsetWidth;
    els.announcementText.textContent = text;
    els.announcementText.classList.add('fade-in');
    rollTeam();

    els.statusGenerated.textContent = `Generated this session: ${sessionGenerated}`;
    els.statusHistory.textContent = `Recent history: ${historyManager.size}/${historyManager.maxSize}`;
    const index = lines.indexOf(text);
    els.debugLine.textContent = index >= 0 ? `Announcement #${index + 1} of ${lines.length}` : 'Shared announcement (not in the current list)';
  }

  /** Randomly (re-)assign a team, in sync with every new announcement shown. */
  function rollTeam() {
    const team = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    els.teamBadge.textContent = `TEAM: ${team.toUpperCase()}`;
    els.teamBadge.className = `team-badge team-${team}`;
    els.teamBadge.hidden = false;
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
      showNextAnnouncement();
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
    showNextAnnouncement();
    resetTimer();
    if (!paused) startTimer();
  }

  // ---------- Share links ----------

  function buildShareUrl(text) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set(SHARE_PARAM, text);
    return url.toString();
  }

  async function shareCurrentAnnouncement() {
    if (!currentAnnouncementText) return;
    const url = buildShareUrl(currentAnnouncementText);

    // Show + select the link first so the execCommand fallback below has a
    // visible, focused field to copy from if the async Clipboard API fails.
    els.shareLinkInput.value = url;
    els.shareStatus.textContent = '';
    els.shareToast.hidden = false;
    els.shareLinkInput.focus();
    els.shareLinkInput.select();

    const copied = await tryCopyToClipboard(url);
    setShareStatus(copied);
  }

  function setShareStatus(copied) {
    els.shareStatus.textContent = copied
      ? 'Link copied to clipboard!'
      : 'Could not copy automatically — the link is selected, press Ctrl+C.';
  }

  async function tryCopyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      // fall through to the legacy fallback below
    }
    try {
      els.shareLinkInput.select();
      return document.execCommand('copy');
    } catch (e) {
      return false;
    }
  }

  function hideShareToast() {
    els.shareToast.hidden = true;
  }

  // ---------- Settings panel ----------

  function populateSettingsForm() {
    els.settingRotationMinutes.value = (settings.rotationSeconds / 60).toString();
    els.settingHistorySize.innerHTML = HISTORY_SIZE_OPTIONS.map(
      (n) => `<option value="${n}" ${n === settings.historySize ? 'selected' : ''}>${n}</option>`
    ).join('');
  }

  function applySettingsFromForm() {
    const previousRotationSeconds = settings.rotationSeconds;
    const minutes = parseFloat(els.settingRotationMinutes.value);
    settings.rotationSeconds = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : DEFAULT_SETTINGS.rotationSeconds;

    settings.historySize = parseInt(els.settingHistorySize.value, 10) || DEFAULT_SETTINGS.historySize;
    historyManager.setMaxSize(settings.historySize);

    saveSettings();
    els.statusHistory.textContent = `Recent history: ${historyManager.size}/${historyManager.maxSize}`;

    // Apply a changed rotation interval immediately instead of waiting for
    // the current countdown to finish on its own.
    if (settings.rotationSeconds !== previousRotationSeconds) {
      resetTimer();
    }
  }

  function resetSettings() {
    settings = { ...DEFAULT_SETTINGS };
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
    els.btnShare.addEventListener('click', shareCurrentAnnouncement);
    els.btnCopyShareLink.addEventListener('click', async () => {
      els.shareLinkInput.select();
      const copied = await tryCopyToClipboard(els.shareLinkInput.value);
      setShareStatus(copied);
      els.shareLinkInput.select();
    });
    els.btnCloseShareToast.addEventListener('click', hideShareToast);

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

    [els.settingRotationMinutes, els.settingHistorySize].forEach((el) =>
      el.addEventListener('change', applySettingsFromForm)
    );
  }

  /** Quick console diagnostic: simulate N draws and report repeat behavior. */
  function testAntiRepeat(count) {
    const windowArr = [];
    const boundedHistory = {
      has: (s) => windowArr.includes(s),
      add: (s) => {
        windowArr.push(s);
        while (windowArr.length > settings.historySize) windowArr.shift();
      }
    };
    const seen = new Set();
    let immediateRepeats = 0;
    let last = null;
    for (let i = 0; i < count; i++) {
      const line = window.WardogsLines.pickNext(lines, boundedHistory);
      if (line === last) immediateRepeats++;
      seen.add(line);
      last = line;
    }
    const stats = { draws: count, totalLines: lines.length, uniqueSeen: seen.size, immediateRepeats };
    console.log('[WARDOGS testAntiRepeat]', stats);
    return stats;
  }

  async function init() {
    cacheEls();
    try {
      lines = await window.WardogsLines.load();
    } catch (e) {
      console.error('[WARDOGS] Failed to load announcements:', e);
      els.loadError.hidden = false;
      els.loadError.textContent =
        'Could not load the announcement list. If you opened this file directly (file://), ' +
        'make sure data/bundle.js exists (run build.js) or serve the folder with a local static server.';
      return;
    }

    historyManager = new window.WardogsHistory.HistoryManager(settings.historySize);
    els.statusLibrary.textContent = `Library size: ${lines.length}`;

    populateSettingsForm();
    wireEvents();

    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get(SHARE_PARAM);

    resetTimer();
    if (sharedText) {
      // Strip the param immediately so a reload later starts a normal
      // rotation instead of re-showing the same shared line forever.
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      display(sharedText);
      pause(); // keep the shared line on screen until the user moves on
    } else {
      showNextAnnouncement();
      startTimer();
    }

    window.testAntiRepeat = (count) => testAntiRepeat(count || 1000);
    window.WARDOGS_APP = { get lines() { return lines; }, get settings() { return settings; }, get historyManager() { return historyManager; } };
    console.info('[WARDOGS] Ready. Try testAntiRepeat(1000) in the console to sanity-check repeat behavior.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
