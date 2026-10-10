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

  // Key Management DOM Elements
  const btnKeyStatus = document.getElementById('btn-key-status');
  const keyChipDot = document.getElementById('key-chip-dot');
  const keyChipLabel = document.getElementById('key-chip-label');
  const keyModalBackdrop = document.getElementById('key-modal-backdrop');
  const btnCloseKeyModal = document.getElementById('btn-close-key-modal');
  const keyCurrentStatusBanner = document.getElementById('key-current-status-banner');
  const keyStatusBannerText = document.getElementById('key-status-banner-text');
  const btnRemoveKey = document.getElementById('btn-remove-key');
  const inputApiKey = document.getElementById('input-api-key');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const keyFeedback = document.getElementById('key-feedback');
  const linkGetKey = document.getElementById('link-get-key');
  const btnTestKey = document.getElementById('btn-test-key');
  const btnSaveKey = document.getElementById('btn-save-key');

  const DEFAULT_GOAL = 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.';

  const DEFAULT_START_HTML = `
    <span>Start with Nori</span>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.75 9h10.5M10.5 5.25L14.25 9l-3.75 3.75" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  let currentKeyStatus = {
    configured: false,
    source: 'none',
    maskedKey: null
  };

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

  // Key Modal Feedback Display
  function showKeyFeedback(type, message) {
    if (!keyFeedback) return;
    keyFeedback.className = `key-feedback-box ${type}`;
    keyFeedback.textContent = message;
    keyFeedback.style.display = 'block';
  }

  function clearKeyFeedback() {
    if (!keyFeedback) return;
    keyFeedback.style.display = 'none';
    keyFeedback.textContent = '';
    keyFeedback.className = 'key-feedback-box';
  }

  // Open / Close Key Setup Modal
  function openKeyModal(initialFeedback = null) {
    if (!keyModalBackdrop) return;
    keyModalBackdrop.style.display = 'flex';
    keyModalBackdrop.setAttribute('aria-hidden', 'false');
    clearKeyFeedback();
    if (initialFeedback) {
      showKeyFeedback('info', initialFeedback);
    }
    if (inputApiKey) {
      inputApiKey.value = '';
      inputApiKey.focus();
    }
  }

  function closeKeyModal() {
    if (!keyModalBackdrop) return;
    keyModalBackdrop.style.display = 'none';
    keyModalBackdrop.setAttribute('aria-hidden', 'true');
    clearKeyFeedback();
    if (inputApiKey) {
      inputApiKey.value = '';
    }
  }

  if (btnCloseKeyModal) {
    btnCloseKeyModal.addEventListener('click', closeKeyModal);
  }

  if (keyModalBackdrop) {
    keyModalBackdrop.addEventListener('click', (e) => {
      if (e.target === keyModalBackdrop) {
        closeKeyModal();
      }
    });
  }

  if (btnKeyStatus) {
    btnKeyStatus.addEventListener('click', () => {
      openKeyModal();
    });
  }

  // Toggle Password Masking in Input
  if (btnToggleKeyVisibility && inputApiKey) {
    btnToggleKeyVisibility.addEventListener('click', () => {
      const isPassword = inputApiKey.type === 'password';
      inputApiKey.type = isPassword ? 'text' : 'password';
      btnToggleKeyVisibility.textContent = isPassword ? '🔒' : '👁️';
    });
  }

  // External Link to Google AI Studio
  if (linkGetKey) {
    linkGetKey.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal('https://aistudio.google.com/app/apikey');
      }
    });
  }

  // Refresh & Apply Key Status UI
  async function refreshKeyStatus(suppressAutoModal = false) {
    if (!window.electronAPI || typeof window.electronAPI.getKeyStatus !== 'function') return;

    try {
      const status = await window.electronAPI.getKeyStatus();
      currentKeyStatus = status || { configured: false, source: 'none', maskedKey: null };

      if (currentKeyStatus.configured) {
        if (keyChipDot) keyChipDot.classList.add('configured');
        if (keyChipLabel) {
          keyChipLabel.textContent = currentKeyStatus.maskedKey ? `Key: ${currentKeyStatus.maskedKey.slice(-8)}` : 'Key Active';
        }
        if (keyCurrentStatusBanner) {
          keyCurrentStatusBanner.style.display = 'flex';
        }
        if (keyStatusBannerText) {
          const srcLabel = currentKeyStatus.source === 'env' ? ' (from .env)' : '';
          keyStatusBannerText.textContent = `Configured: ${currentKeyStatus.maskedKey || 'Active'}${srcLabel}`;
        }
      } else {
        if (keyChipDot) keyChipDot.classList.remove('configured');
        if (keyChipLabel) keyChipLabel.textContent = 'Setup API Key';
        if (keyCurrentStatusBanner) keyCurrentStatusBanner.style.display = 'none';

        // First run: automatically show setup modal if key is missing and not suppressed
        if (!suppressAutoModal) {
          openKeyModal('Welcome! To begin using Nori, please enter your personal Google Gemini API key.');
        }
      }
    } catch (err) {
      console.warn('[Launch] Error refreshing key status:', err);
    }
  }

  // Test Key Action
  if (btnTestKey) {
    btnTestKey.addEventListener('click', async () => {
      const candidate = inputApiKey ? inputApiKey.value.trim() : '';
      if (!candidate && !currentKeyStatus.configured) {
        showKeyFeedback('error', 'Please enter a Gemini API key to test.');
        return;
      }

      btnTestKey.disabled = true;
      btnTestKey.textContent = 'Testing…';
      showKeyFeedback('info', 'Connecting to Google Gemini API…');

      try {
        const result = await window.electronAPI.testApiKey(candidate);
        if (result && result.success) {
          showKeyFeedback('success', '✓ Connection successful! Your Gemini API key is valid.');
        } else {
          showKeyFeedback('error', result?.error || 'Connection failed. Please verify your API key.');
        }
      } catch (err) {
        showKeyFeedback('error', 'Network test failed. Please check your internet connection.');
      } finally {
        btnTestKey.disabled = false;
        btnTestKey.textContent = 'Test connection';
      }
    });
  }

  // Save Key Action
  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', async () => {
      const candidate = inputApiKey ? inputApiKey.value.trim() : '';
      if (!candidate) {
        showKeyFeedback('error', 'Please paste your Gemini API key before saving.');
        return;
      }

      btnSaveKey.disabled = true;
      btnSaveKey.textContent = 'Saving…';

      try {
        const result = await window.electronAPI.saveApiKey(candidate);
        if (result && result.success) {
          showKeyFeedback('success', '✓ Key encrypted and saved securely!');
          if (inputApiKey) {
            inputApiKey.value = '';
          }
          await refreshKeyStatus(true);
          setTimeout(() => {
            closeKeyModal();
          }, 1200);
        } else {
          showKeyFeedback('error', result?.error || 'Failed to save key.');
        }
      } catch (err) {
        showKeyFeedback('error', 'Error saving key. Please try again.');
      } finally {
        btnSaveKey.disabled = false;
        btnSaveKey.textContent = 'Save key';
      }
    });
  }

  // Remove Key Action
  if (btnRemoveKey) {
    btnRemoveKey.addEventListener('click', async () => {
      try {
        await window.electronAPI.removeApiKey();
        showKeyFeedback('info', 'API key removed. Enter a new key to continue.');
        await refreshKeyStatus(true);
      } catch (err) {
        showKeyFeedback('error', 'Error removing key.');
      }
    });
  }

  // Start Coaching Button
  if (btnStart) {
    btnStart.addEventListener('click', async () => {
      // Gate check: verify Gemini API key is configured before launching
      if (!currentKeyStatus.configured) {
        await refreshKeyStatus(true);
        if (!currentKeyStatus.configured) {
          openKeyModal('A Google Gemini API key is required to start coaching with Nori.');
          return;
        }
      }

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

  // Initial target & key status fetch
  fetchTarget();
  refreshKeyStatus();

  // Listen for reset events from Main Process when session stops or finishes
  if (window.electronAPI && typeof window.electronAPI.onLaunchReset === 'function') {
    window.electronAPI.onLaunchReset(() => {
      resetStartState();
      fetchTarget();
      refreshKeyStatus(true);
    });
  }

  // Window visibility & focus listeners to ensure start button is always responsive
  window.addEventListener('focus', () => {
    resetStartState();
    fetchTarget();
    refreshKeyStatus(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resetStartState();
      fetchTarget();
      refreshKeyStatus(true);
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
