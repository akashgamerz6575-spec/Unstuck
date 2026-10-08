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

  const DEFAULT_GOAL = 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.';

  // Preset button
  btnPreset.addEventListener('click', () => {
    goalInput.value = DEFAULT_GOAL;
    goalInput.focus();
  });

  // Start Coaching
  btnStart.addEventListener('click', () => {
    const goal = goalInput.value.trim() || DEFAULT_GOAL;
    btnStart.disabled = true;
    btnStart.innerHTML = `<span>Starting…</span>`;

    if (window.electronAPI && typeof window.electronAPI.startCoaching === 'function') {
      window.electronAPI.startCoaching(goal);
    } else {
      console.log('[Launch] electronAPI.startCoaching triggered with goal:', goal);
    }
  });

  // Refresh Target Window
  function updateTargetInfo(info) {
    if (!info) return;
    if (info.isCalc) {
      targetTitle.textContent = info.title || 'LibreOffice Calc detected';
      targetDot.style.backgroundColor = 'var(--color-moss)';
    } else if (info.title) {
      targetTitle.textContent = `${info.title} (Switch to Calc)`;
      targetDot.style.backgroundColor = 'var(--color-clay)';
    } else {
      targetTitle.textContent = 'LibreOffice Calc (Ready)';
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
