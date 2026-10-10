/**
 * Unstuck - Launch Window Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const goalInput = document.getElementById('goal-input');
  const btnPreset = document.getElementById('btn-preset');
  const btnStart = document.getElementById('btn-start');
  const btnRefreshTarget = document.getElementById('btn-refresh-target');
  const targetTitle = document.getElementById('target-title');
  const targetDot = document.getElementById('target-dot');
  const btnMin = document.getElementById('btn-min');
  const btnClose = document.getElementById('btn-close');

  const tutorialUrlInput = document.getElementById('tutorial-url-input');

  const DEFAULT_GOAL = 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.';

  // Preset button
  btnPreset.addEventListener('click', () => {
    goalInput.value = DEFAULT_GOAL;
    goalInput.focus();
  });

  // Start Coaching
  btnStart.addEventListener('click', () => {
    const goal = goalInput.value.trim() || DEFAULT_GOAL;
    const tutorialUrl = tutorialUrlInput ? tutorialUrlInput.value.trim() : '';
    btnStart.disabled = true;
    btnStart.innerHTML = `<span>Starting…</span>`;

    if (window.electronAPI && typeof window.electronAPI.startCoaching === 'function') {
      window.electronAPI.startCoaching(goal, tutorialUrl);
    } else {
      console.log('[Launch] electronAPI.startCoaching triggered with goal:', goal, 'tutorialUrl:', tutorialUrl);
    }
  });

  // Refresh Target Window
  function updateTargetInfo(info) {
    if (!info) return;
    const p = (info.process || '').toLowerCase();
    const t = (info.title || '').toLowerCase();
    const isSelf = p === 'electron' || p === 'unstuck' || t.includes('unstuck');
    const isDesktop = info.hWnd === 0 || (p === 'explorer' && (!t || t === 'program manager'));

    if (info.isCalc) {
      targetTitle.textContent = info.title || 'LibreOffice Calc (Preset Benchmark)';
      targetDot.style.backgroundColor = 'var(--color-moss)';
    } else if (!isSelf && !isDesktop && (info.title || info.process)) {
      targetTitle.textContent = `Target: ${info.title || info.process} (${info.process || 'App'})`;
      targetDot.style.backgroundColor = 'var(--color-moss)';
    } else {
      targetTitle.textContent = 'Active software target (focus app to check)';
      targetDot.style.backgroundColor = 'var(--color-moss)';
    }
  }

  btnRefreshTarget.addEventListener('click', () => {
    if (window.electronAPI && typeof window.electronAPI.getTargetInfo === 'function') {
      window.electronAPI.getTargetInfo().then(updateTargetInfo);
    }
  });

  // Initial target fetch
  if (window.electronAPI && typeof window.electronAPI.getTargetInfo === 'function') {
    window.electronAPI.getTargetInfo().then(updateTargetInfo);
  }

  // Window titlebar controls
  if (btnMin) {
    btnMin.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.minimizeWindow) {
        window.electronAPI.minimizeWindow();
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.closeWindow) {
        window.electronAPI.closeWindow();
      }
    });
  }
});
