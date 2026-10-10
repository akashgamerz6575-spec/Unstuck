/**
 * Unstuck - Launch Window Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const goalInput = document.getElementById('goal-input');
  const btnPreset = document.getElementById('btn-preset');
  const btnStart = document.getElementById('btn-start');
  const btnRefreshTarget = document.getElementById('btn-refresh-target');
  const appSelector = document.getElementById('app-selector');
  const targetTitle = document.getElementById('target-title');
  const targetDot = document.getElementById('target-dot');
  const btnMin = document.getElementById('btn-min');
  const btnClose = document.getElementById('btn-close');

  const DEFAULT_GOAL = 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.';

  const DEFAULT_START_HTML = `
    <span>Start with Nori</span>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.75 9h10.5M10.5 5.25L14.25 9l-3.75 3.75" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  function resetStartState() {
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = DEFAULT_START_HTML;
    }
  }

  // Preset button
  if (btnPreset && goalInput) {
    btnPreset.addEventListener('click', () => {
      goalInput.value = DEFAULT_GOAL;
      goalInput.focus();
    });
  }

  // Start Coaching
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      const goal = (goalInput && goalInput.value.trim()) || DEFAULT_GOAL;
      btnStart.disabled = true;
      btnStart.innerHTML = `<span>Starting with Nori…</span>`;

      // Safety fallback to restore button if window stays visible
      setTimeout(() => {
        if (!document.hidden && btnStart.disabled) {
          resetStartState();
        }
      }, 4000);

      if (window.electronAPI && typeof window.electronAPI.startCoaching === 'function') {
        window.electronAPI.startCoaching(goal);
      } else {
        console.log('[Launch] electronAPI.startCoaching triggered with goal:', goal);
      }
    });
  }

  // Refresh Target Window
  function updateTargetInfo(info) {
    if (!info) return;
    const p = (info.process || '').toLowerCase();
    const t = (info.title || '').toLowerCase();
    const isSelf = p === 'electron' || p === 'unstuck' || t === 'unstuck' || t.startsWith('unstuck -') || t.startsWith('unstuck —');
    const isDesktop = info.hWnd === 0 || (p === 'explorer' && (!t || t === 'program manager'));

    if (info.isCalc) {
      targetTitle.textContent = info.title || 'LibreOffice Calc (Preset Benchmark)';
      targetDot.style.backgroundColor = 'var(--color-success)';
      targetDot.title = 'LibreOffice Calc active';
    } else if (!isSelf && !isDesktop && (info.title || info.process)) {
      targetTitle.textContent = `${info.title || info.process} (${info.process || 'App'})`;
      targetDot.style.backgroundColor = 'var(--color-success)';
      targetDot.title = 'Active window target detected';
    } else {
      targetTitle.textContent = 'Focus your application to check';
      targetDot.style.backgroundColor = 'var(--color-warning)';
      targetDot.title = 'No active application window detected. Bring your app to foreground.';
    }
  }

  function fetchTarget() {
    if (window.electronAPI && typeof window.electronAPI.getTargetInfo === 'function') {
      window.electronAPI.getTargetInfo().then(updateTargetInfo).catch((err) => {
        console.warn('[Launch] Target info error:', err);
      });
    }
  }

  if (btnRefreshTarget) {
    btnRefreshTarget.addEventListener('click', (e) => {
      e.stopPropagation();
      fetchTarget();
    });
  }

  if (appSelector) {
    appSelector.addEventListener('click', () => {
      fetchTarget();
    });
    appSelector.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fetchTarget();
      }
    });
  }

  // Initial target fetch
  fetchTarget();

  // Listen for reset events from Main Process when session stops or finishes
  if (window.electronAPI && typeof window.electronAPI.onLaunchReset === 'function') {
    window.electronAPI.onLaunchReset(() => {
      resetStartState();
      fetchTarget();
    });
  }

  // Window visibility & focus listeners to ensure start button is always responsive
  window.addEventListener('focus', () => {
    resetStartState();
    fetchTarget();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resetStartState();
      fetchTarget();
    }
  });

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
