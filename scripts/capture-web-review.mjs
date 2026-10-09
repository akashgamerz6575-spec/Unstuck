/**
 * Unstuck - Web Review & Screen Capture Harness
 * 
 * Captures actual website screenshots at desktop (1440x960) and mobile (390x844) widths
 * using Electron's native webContents.capturePage().
 * 
 * Saves pristine screenshots into git-ignored captures/web-review/
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const outDir = path.resolve(projectRoot, 'captures', 'web-review');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.whenReady().then(async () => {
  console.log('[Web Review] Starting browser capture on http://localhost:8080...');
  const { session } = await import('electron');
  await session.defaultSession.clearCache();

  // 1. Desktop Viewport (1440 x 1300) to capture hero and interactive workspace
  const desktopWin = new BrowserWindow({
    width: 1440,
    height: 1300,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await desktopWin.loadURL('http://localhost:8080');
  await new Promise((res) => setTimeout(res, 800)); // Wait for fonts and CSS

  // Capture 1: Desktop Hero & Ribbon
  const img1 = await desktopWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '01-web-desktop-hero.png'), img1.toPNG());
  console.log('  ✔ Saved 01-web-desktop-hero.png');

  // Capture 2: Desktop Workspace with Loaded Capture
  await desktopWin.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const btn = document.getElementById('btn-load-calc-example');
      if (btn) btn.click();
      setTimeout(() => {
        const ws = document.getElementById('workspace');
        if (ws) {
          const top = ws.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo(0, top - 40);
        }
        setTimeout(resolve, 500);
      }, 500);
    })
  `);
  await new Promise((res) => setTimeout(res, 600));

  const img2 = await desktopWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '02-web-desktop-workspace.png'), img2.toPNG());
  console.log('  ✔ Saved 02-web-desktop-workspace.png');

  // Simulate Guidance Step state on desktop with grounded highlight
  await desktopWin.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const tag = document.getElementById('instruction-step-tag');
      const text = document.getElementById('instruction-text');
      const obs = document.getElementById('observation-text');
      const badge = document.getElementById('status-badge');
      const overlay = document.getElementById('highlight-overlay');
      const actionBtn = document.getElementById('btn-action-label');

      if (tag) tag.textContent = 'Step 2';
      if (text) text.textContent = 'Click "Insert" on the top menu bar to open chart options.';
      if (obs) obs.textContent = 'Cells A1:B5 are selected. Top menu bar is clearly visible.';
      if (actionBtn) actionBtn.textContent = 'Check my progress';
      if (badge) {
        badge.textContent = 'Step 2';
        badge.className = 'status-badge step';
      }

      // Draw grounded highlight on Insert menu
      if (overlay) {
        overlay.innerHTML = \`
          <div class="target-bracket" style="top: 7.2%; left: 11.5%; width: 4.8%; height: 2.6%;">
            <div class="target-bracket-label">Click 'Insert'</div>
          </div>
        \`;
      }

      const ws = document.getElementById('workspace');
      if (ws) {
        const top = ws.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo(0, top - 40);
      }
      setTimeout(resolve, 400);
    })
  `);

  const img3 = await desktopWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '03-web-desktop-guidance-highlight.png'), img3.toPNG());
  console.log('  ✔ Saved 03-web-desktop-guidance-highlight.png');

  // Simulate Recovery state
  await desktopWin.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const tag = document.getElementById('instruction-step-tag');
      const text = document.getElementById('instruction-text');
      const obs = document.getElementById('observation-text');
      const badge = document.getElementById('status-badge');
      const recBox = document.getElementById('recovery-box');
      const recText = document.getElementById('recovery-text');
      const overlay = document.getElementById('highlight-overlay');

      if (tag) tag.textContent = 'Correction';
      if (text) text.textContent = 'Close the "Format" menu and click "Insert" on the top menu bar.';
      if (recBox) recBox.style.display = 'block';
      if (recText) recText.textContent = 'You opened the "Format" menu instead of "Insert". Let us get back to the chart creation path.';
      if (obs) obs.textContent = 'The Format dropdown menu is currently open, obscuring chart options.';
      if (badge) {
        badge.textContent = 'Correction';
        badge.className = 'status-badge recovery';
      }

      if (overlay) {
        overlay.innerHTML = \`
          <div class="target-bracket" style="top: 7.2%; left: 11.5%; width: 4.8%; height: 2.6%;">
            <div class="target-bracket-label">Return to 'Insert'</div>
          </div>
        \`;
      }

      const ws = document.getElementById('workspace');
      if (ws) {
        const top = ws.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo(0, top - 40);
      }
      setTimeout(resolve, 400);
    })
  `);

  const img4 = await desktopWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '04-web-desktop-recovery-state.png'), img4.toPNG());
  console.log('  ✔ Saved 04-web-desktop-recovery-state.png');

  desktopWin.destroy();

  // 2. Mobile Viewport (390 x 1400 - iPhone / Modern Mobile tall view)
  const mobileWin = new BrowserWindow({
    width: 390,
    height: 1400,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mobileWin.loadURL('http://localhost:8080');
  await new Promise((res) => setTimeout(res, 800));

  // Capture 5: Mobile Hero View
  const img5 = await mobileWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '05-web-mobile-hero.png'), img5.toPNG());
  console.log('  ✔ Saved 05-web-mobile-hero.png');

  // Load example and scroll to workspace on mobile
  await mobileWin.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const btn = document.getElementById('btn-load-calc-example');
      if (btn) btn.click();
      setTimeout(() => {
        const ws = document.getElementById('workspace');
        if (ws) {
          const top = ws.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo(0, top - 20);
        }
        setTimeout(resolve, 600);
      }, 500);
    })
  `);
  await new Promise((res) => setTimeout(res, 800));

  // Capture 6: Mobile Workspace
  const img6 = await mobileWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '06-web-mobile-workspace.png'), img6.toPNG());
  console.log('  ✔ Saved 06-web-mobile-workspace.png');

  mobileWin.destroy();

  console.log('[Web Review] All 6 web captures saved successfully to captures/web-review/');
  app.exit(0);
});
