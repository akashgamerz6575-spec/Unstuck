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
