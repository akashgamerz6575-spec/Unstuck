const { contextBridge, ipcRenderer } = require('electron');

// Signal to main process that preload has executed
try {
  ipcRenderer.send('renderer-preload-ready');
} catch (e) {
  // Preload startup guard
}

/**
 * Narrow isolated IPC bridge for transparent overlay.
 * Keeps context isolation and sandboxing strictly enabled.
 * Zero Node APIs, filesystem access, network, or secrets exposed to renderer.
 */
contextBridge.exposeInMainWorld('unstuckOverlay', {
  onShowOutline: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('show-outline', (_event, data) => callback(data));
    }
  },
  onClearOutline: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('clear-outline', () => callback());
    }
  },
  sendAck: (metrics) => {
    ipcRenderer.send('outline-applied-ack', metrics);
  },
  sendReady: () => {
    ipcRenderer.send('renderer-dom-ready');
  },
  reportError: (err) => {
    ipcRenderer.send('renderer-error', err);
  }
});

/**
 * Narrow isolated IPC bridge for Unstuck Launch and Coach Windows.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  startCoaching: (goal, tutorialUrl) => {
    if (goal && typeof goal === 'object') {
      ipcRenderer.send('start-coaching', goal);
    } else {
      ipcRenderer.send('start-coaching', {
        goal: String(goal || ''),
        tutorialUrl: tutorialUrl ? String(tutorialUrl) : undefined
      });
    }
  },
  getTargetInfo: async () => {
    return ipcRenderer.invoke('get-target-info');
  },
  triggerCheck: () => {
    ipcRenderer.send('trigger-check');
  },
  pauseSession: () => {
    ipcRenderer.send('pause-session');
  },
  resumeSession: () => {
    ipcRenderer.send('resume-session');
  },
  stopSession: () => {
    ipcRenderer.send('stop-session');
  },
  resetSession: () => {
    ipcRenderer.send('reset-session');
  },
  minimizeWindow: () => {
    ipcRenderer.send('window-minimize');
  },
  closeWindow: () => {
    ipcRenderer.send('window-close');
  },
  onCoachUpdate: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('coach-state-update', (_event, data) => callback(data));
    }
  },
  onLaunchReset: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('launch-state-reset', (_event, data) => callback(data));
    }
  }
});
