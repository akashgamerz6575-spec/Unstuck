/**
 * Unstuck - AI Desktop Coach Desktop Application
 * 
 * Main Electron process managing:
 * - Launch Window (Product entry, task selection, knot-to-clear centerpiece)
 * - Active Coach Window (Draggable compact 360px paper panel)
 * - Transparent Pass-Through Overlay (Grounded Moss outlines with dark contrast stroke)
 * - Target Scoping & Calc Geometry Guard (HWND & process identity)
 * - Window Cropping & Coordinate Offset Mapping
 * - Persistent 12-Request API Budget & 5s Pacing (.api_budget.json)
 * - Secret Isolation (GEMINI_API_KEY handled exclusively in main process)
 * - Deterministic Mock UI Developer Mode (--mock-ui)
 */

import { app, BrowserWindow, desktopCapturer, globalShortcut, screen, ipcMain, nativeImage } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertCapturePixelRect, DisplayBounds } from '../shared/coordinates.js';
import { resolveTargetInCapture, terminateTesseractWorker } from './target-resolver.js';
import { getForegroundWindowInfo } from './window-scoping.js';
import { extractOcrCandidates } from './candidate-extractor.js';
import { queryGeminiCoach, CoachingTurnHistory } from './gemini-coach.js';
import { calculateWindowCrop } from '../shared/crop-geometry.js';
import { defaultApiBudget, defaultSessionBudget } from '../shared/api-budget.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliOptions {
  target: string;
  debugCapture: boolean;
  runOnce: boolean;
  testOverlay: boolean;
  coach: boolean;
  mockUi: boolean;
}

function parseCliArgs(): CliOptions {
  let target = 'Insert';
  let debugCapture = false;
  let runOnce = false;
  let testOverlay = false;
  let coach = false;
  let mockUi = false;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length).trim();
    } else if (arg === '--debug-capture') {
      debugCapture = true;
    } else if (arg === '--run-once') {
      runOnce = true;
    } else if (arg === '--test-overlay') {
      testOverlay = true;
    } else if (arg === '--coach') {
      coach = true;
    } else if (arg === '--mock-ui') {
      mockUi = true;
    }
  }

  return { target, debugCapture, runOnce, testOverlay, coach, mockUi };
}

const cliOptions = parseCliArgs();

// Load local .env safely in main process
function loadApiKey(): string | null {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return null;

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key === 'GEMINI_API_KEY' && val.length > 10 && !val.includes('placeholder') && !val.includes('your_')) {
          return val;
        }
      }
    }
  } catch {
    // Read failure fallback
  }
  return null;
}

const GEMINI_API_KEY = loadApiKey();

// Safe Asset Path Resolver
const projectRoot = process.cwd();
function resolveAsset(relativePath: string): string {
  const rootPath = path.resolve(projectRoot, 'electron', relativePath);
  if (fs.existsSync(rootPath)) return rootPath;
  const distPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(distPath)) return distPath;
  return rootPath;
}

const preloadPath = resolveAsset('preload.cjs');
const overlayHtmlPath = resolveAsset('overlay.html');
const launchHtmlPath = resolveAsset('launch.html');
const coachHtmlPath = resolveAsset('coach.html');

// Windows references
let launchWindow: BrowserWindow | null = null;
let coachWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

// Operational State
let isInFlight = false;
let currentRequestId = 0;
let isPaused = false;
let currentStepNumber = 1;
let coachingGoal = 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.';
let coachingHistory: CoachingTurnHistory[] = [];
let previousInstruction: string | null = null;

/**
 * Creates the Launch Window (1040x700 resizable)
 */
function createLaunchWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: scrW, height: scrH } = primaryDisplay.workAreaSize;

  const winW = Math.min(1040, scrW - 40);
  const winH = Math.min(700, scrH - 40);

  const win = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    backgroundColor: '#111B15',
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  win.loadFile(launchHtmlPath);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { launchWindow = null; });
  return win;
}

/**
 * Creates the Active Coach Window (compact ~380px paper panel)
 */
function createCoachWindow(isMockMode = false): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const margin = 20;
  const panelW = 380;
  const maxAvailableH = Math.max(360, workArea.height - margin * 2);
  const panelH = Math.min(480, maxAvailableH);

  const x = Math.max(workArea.x + margin, Math.min(workArea.x + workArea.width - panelW - margin, Math.round(workArea.x + workArea.width - panelW - margin)));
  const y = Math.max(workArea.y + margin, Math.min(workArea.y + workArea.height - panelH - margin, Math.round(workArea.y + workArea.height - panelH - margin)));

  const win = new BrowserWindow({
    x,
    y,
    width: panelW,
    height: panelH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  win.loadFile(coachHtmlPath);

  win.once('ready-to-show', () => {
    win.show();
    sendCoachUpdate({
      state: 'ready',
      goal: coachingGoal,
      budget: defaultSessionBudget.getRemaining(),
      isMockMode
    });
  });

  win.on('closed', () => { coachWindow = null; });
  return win;
}

/**
 * Creates the transparent click-through overlay window.
 */
function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const fullBounds = primaryDisplay.bounds;

  const win = new BrowserWindow({
    x: fullBounds.x,
    y: fullBounds.y,
    width: fullBounds.width,
    height: fullBounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(overlayHtmlPath);
  win.on('closed', () => { overlayWindow = null; });
  return win;
}

/**
 * Helper to dispatch structured state updates to the Coach Window
 */
function sendCoachUpdate(data: {
  state: 'ready' | 'capturing' | 'analysing' | 'guidance' | 'recovery' | 'paused' | 'complete' | 'error' | 'text-only';
  instruction?: string;
  observation?: string;
  recovery?: string | null;
  badge?: string;
  goal?: string;
  budget?: number;
  isMockMode?: boolean;
}): void {
  if (coachWindow && !coachWindow.isDestroyed()) {
    coachWindow.webContents.send('coach-state-update', {
      ...data,
      budget: data.budget !== undefined ? data.budget : defaultSessionBudget.getRemaining()
    });
  }
}

/**
 * Dismisses active outline and cancels pending operations.
 */
function handleDismiss(): void {
  currentRequestId++;
  console.log('[Lifecycle] Dismissal triggered: pending operations invalidated, overlay cleared.');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }
}

/**
 * Resets coaching session state and in-memory session budget counter.
 * Note: Never resets or overwrites the persistent automated build budget in .api_budget.json.
 */
function handleSessionReset(): void {
  currentRequestId++;
  defaultSessionBudget.resetSession();
  coachingHistory = [];
  previousInstruction = null;
  currentStepNumber = 1;
  isPaused = false;
  console.log(`[SESSION RESET] Coaching session and in-memory budget reset.`);

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }

  sendCoachUpdate({
    state: 'ready',
    instruction: 'Session reset. Focus LibreOffice Calc and click Check to begin.',
    observation: 'Ready for initial check.',
    budget: defaultSessionBudget.getRemaining()
  });
}

/**
 * Executes a single AI coaching turn on demand.
 */
async function executeCoachingTurn(): Promise<boolean> {
  if (isInFlight) {
    console.log('[AI Coach] Check already in flight; duplicate trigger blocked.');
    return false;
  }

  if (isPaused) {
    console.log('[AI Coach] Session is paused; click Resume to continue.');
    return false;
  }

  // Session budget allowance check
  const allowance = defaultSessionBudget.checkAllowance();
  if (!allowance.allowed) {
    console.warn(`[Budget Enforcement] ${allowance.reason}`);
    sendCoachUpdate({
      state: 'error',
      instruction: allowance.reason || 'Session check limit reached.',
      observation: 'Please wait or reset session (Ctrl+Alt+R).'
    });
    return false;
  }

  if (!GEMINI_API_KEY) {
    console.error('[AI Coach Error] No GEMINI_API_KEY configured in .env.');
    sendCoachUpdate({
      state: 'error',
      instruction: 'API Key missing. Please configure GEMINI_API_KEY in your local .env file.',
      observation: 'Secret isolation preserved.'
    });
    return false;
  }

  isInFlight = true;
  const requestId = ++currentRequestId;
  const turnIndex = coachingHistory.length + 1;
  const totalStartTime = performance.now();

  try {
    sendCoachUpdate({ state: 'capturing' });

    // 1. Clear previous outline and hide overlay & coach window before capture
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('clear-outline');
      overlayWindow.hide();
    }
    if (coachWindow && !coachWindow.isDestroyed()) {
      coachWindow.hide();
    }

    // 2. Allow DWM redraw
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (requestId !== currentRequestId) {
      if (coachWindow && !coachWindow.isDestroyed()) coachWindow.show();
      return false;
    }

    // 3. Target Scoping: verify active foreground window is Calc
    const windowInfo = getForegroundWindowInfo();
    console.log(`[Target Scoping] Active window: "${windowInfo.title}" (Process: ${windowInfo.process})`);

    if (!windowInfo.isCalc) {
      console.warn(`[Target Scoping Guard] Active window is not LibreOffice Calc!`);
      if (coachWindow && !coachWindow.isDestroyed()) coachWindow.show();
      sendCoachUpdate({
        state: 'error',
        instruction: 'Please switch to LibreOffice Calc and click Check again.',
        observation: `Current active window is "${windowInfo.title || 'Desktop'}" (${windowInfo.process || 'Unknown'}).`
      });
      return false;
    }

    // 4. Capture screen while coach and overlay windows remain strictly hidden
    const primaryDisplay = screen.getPrimaryDisplay();
    const runtimeBounds = primaryDisplay.bounds;
    const scaleFactor = primaryDisplay.scaleFactor;

    const captureStartTime = performance.now();
    const capturePhysicalWidth = Math.round(runtimeBounds.width * scaleFactor);
    const capturePhysicalHeight = Math.round(runtimeBounds.height * scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: capturePhysicalWidth,
        height: capturePhysicalHeight
      }
    });

    const targetDisplayId = primaryDisplay.id.toString();
    const matchedSource = sources.find((s) => s.display_id === targetDisplayId) || sources[0];

    if (!matchedSource) {
      if (coachWindow && !coachWindow.isDestroyed()) coachWindow.show();
      sendCoachUpdate({
        state: 'error',
        instruction: 'Screen capture failed: Display surface detached.',
        observation: 'Session context preserved.'
      });
      return false;
    }

    const thumbnail = matchedSource.thumbnail;
    const captureDims = thumbnail.getSize();
    const fullImageBuffer = thumbnail.toPNG();
    const captureLatencyMs = performance.now() - captureStartTime;

    // 5. Restore coach & overlay windows NOW that screen capture buffer is safely in memory
    if (coachWindow && !coachWindow.isDestroyed()) coachWindow.show();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }

    if (captureDims.width === 0 || captureDims.height === 0 || fullImageBuffer.length === 0) {
      sendCoachUpdate({
        state: 'error',
        instruction: 'Display appears locked or asleep.',
        observation: 'Desktop capture surface returned zero bytes.'
      });
      return false;
    }

    if (requestId !== currentRequestId) return false;

    // 6. Target Region Cropping & Offset Calculation
    const cropCalc = calculateWindowCrop(windowInfo.bounds, captureDims, scaleFactor);
    let targetImageBuffer = fullImageBuffer;
    let cropOffset = { x: 0, y: 0 };

    if (cropCalc.isCropped) {
      const croppedNative = nativeImage.createFromBuffer(fullImageBuffer).crop(cropCalc.cropRect);
      targetImageBuffer = croppedNative.toPNG();
      cropOffset = { x: cropCalc.offsetX, y: cropCalc.offsetY };
      console.log(`[Target Cropping] Cropped capture to Calc window [${cropCalc.cropRect.width}x${cropCalc.cropRect.height}] with offset (+${cropOffset.x}, +${cropOffset.y})`);
    }

    sendCoachUpdate({ state: 'analysing' });

    // 7. Extract OCR Candidates within active window
    const extraction = await extractOcrCandidates(targetImageBuffer, windowInfo.bounds, scaleFactor);

    // Map candidate pixel bounding boxes back to full capture pixel space
    if (cropCalc.isCropped) {
      for (const cand of extraction.candidates) {
        cand.pixelBbox.x += cropOffset.x;
        cand.pixelBbox.y += cropOffset.y;
      }
    }

    if (requestId !== currentRequestId || isPaused) return false;

    // 8. Query Gemini Coach with fresh screenshot & candidates
    const result = await queryGeminiCoach({
      apiKey: GEMINI_API_KEY,
      imageBuffer: targetImageBuffer,
      goal: coachingGoal,
      previousInstruction,
      history: coachingHistory,
      candidates: extraction.candidates
    });

    // Record request in session budget
    defaultSessionBudget.recordRequest();

    if (requestId !== currentRequestId || isPaused) return false;

    const totalDurationMs = performance.now() - totalStartTime;

    if (!result.success || !result.guidance) {
      console.error(`[AI Coach Error] ${result.error}`);
      // Clear any stale highlight on error
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('clear-outline');
      }
      sendCoachUpdate({
        state: 'error',
        instruction: result.error || 'Temporary reasoning error.',
        observation: 'Session context preserved. Click Check to try again.'
      });
      return false;
    }

    const g = result.guidance;

    // 8. Grounded Overlay Highlight
    if (result.selectedCandidate && (g.status === 'guide' || g.status === 'recover')) {
      const cand = result.selectedCandidate;
      const mappingResult = convertCapturePixelRect(
        cand.pixelBbox,
        captureDims,
        runtimeBounds,
        { x: runtimeBounds.x, y: runtimeBounds.y }
      );

      if (mappingResult.valid && overlayWindow && !overlayWindow.isDestroyed()) {
        const { overlayLocal } = mappingResult.value;
        overlayWindow.webContents.send('show-outline', {
          rect: overlayLocal,
          label: cand.text,
          isTest: false,
          autoExpireMs: 12000
        });
      }
    } else {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('clear-outline');
      }
    }

    // 9. Update Step Progression (do not advance on repeated/unperformed actions)
    if (g.status === 'guide') {
      if (previousInstruction && g.instruction !== previousInstruction && g.assessment === 'expected') {
        currentStepNumber += 1;
      }
    }

    let badgeText = `Step ${currentStepNumber}`;
    if (g.status === 'recover') {
      badgeText = 'Correction';
    } else if (g.status === 'complete') {
      badgeText = 'Complete';
    } else if (g.status === 'uncertain') {
      badgeText = 'Uncertain';
    }

    // 10. Update Coach Window
    let mappedUiState: 'guidance' | 'recovery' | 'complete' | 'text-only' = 'guidance';
    if (g.status === 'recover') {
      mappedUiState = 'recovery';
    } else if (g.status === 'complete') {
      mappedUiState = 'complete';
    } else if (g.status === 'uncertain' || !result.selectedCandidate) {
      mappedUiState = 'text-only';
    }

    sendCoachUpdate({
      state: mappedUiState,
      instruction: g.instruction,
      observation: g.observation,
      recovery: g.reason,
      badge: badgeText
    });

    // Update session tracking
    previousInstruction = g.instruction;
    coachingHistory.push({
      turnNumber: currentStepNumber,
      instruction: g.instruction,
      assessment: g.assessment,
      status: g.status,
      selectedCandidateText: result.selectedCandidate?.text || null
    });

    return true;
  } catch (err) {
    console.error('[AI Coach Fatal Error]', err);
    sendCoachUpdate({
      state: 'error',
      instruction: 'An unexpected error occurred during analysis.',
      observation: String(err)
    });
    return false;
  } finally {
    isInFlight = false;
  }
}

/**
 * Registers global keyboard shortcuts
 */
function registerShortcuts(): void {
  globalShortcut.register('CommandOrControl+Alt+U', () => {
    executeCoachingTurn();
  });

  globalShortcut.register('CommandOrControl+Alt+D', handleDismiss);
  globalShortcut.register('CommandOrControl+Alt+R', handleSessionReset);
  globalShortcut.register('Escape', handleDismiss);
}

// IPC Handlers
ipcMain.on('start-coaching', (_event, data) => {
  if (data?.goal) {
    coachingGoal = data.goal;
  }
  // Invalidate previous session history, instructions, and outlines on start/restart
  currentRequestId++;
  coachingHistory = [];
  previousInstruction = null;
  currentStepNumber = 1;
  isPaused = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }

  if (launchWindow && !launchWindow.isDestroyed()) {
    launchWindow.hide();
  }
  if (!coachWindow) {
    coachWindow = createCoachWindow(cliOptions.mockUi);
  } else {
    coachWindow.show();
    sendCoachUpdate({
      state: 'ready',
      instruction: `Goal: "${coachingGoal.slice(0, 80)}". Focus LibreOffice Calc and click Check to begin.`,
      observation: 'Ready for initial check.',
      budget: defaultSessionBudget.getRemaining()
    });
  }
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
  } else {
    overlayWindow.showInactive();
  }
});

ipcMain.handle('get-target-info', async () => {
  return getForegroundWindowInfo();
});

ipcMain.on('trigger-check', () => {
  executeCoachingTurn();
});

ipcMain.on('pause-session', () => {
  isPaused = true;
  handleDismiss();
  sendCoachUpdate({ state: 'paused' });
});

ipcMain.on('resume-session', () => {
  isPaused = false;
  sendCoachUpdate({ state: 'ready' });
});

ipcMain.on('stop-session', () => {
  isPaused = false;
  handleDismiss();
  if (coachWindow && !coachWindow.isDestroyed()) coachWindow.hide();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  if (launchWindow && !launchWindow.isDestroyed()) launchWindow.show();
});

ipcMain.on('reset-session', () => {
  handleSessionReset();
});

ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// App Lifecycle
app.whenReady().then(async () => {
  registerShortcuts();

  screen.on('display-metrics-changed', () => {
    handleDismiss();
  });

  if (cliOptions.mockUi) {
    // Launch directly into Coach Window with Mock QA Bar
    coachWindow = createCoachWindow(true);
    overlayWindow = createOverlayWindow();
  } else if (cliOptions.coach) {
    // Launch directly into Coach mode
    coachWindow = createCoachWindow(false);
    overlayWindow = createOverlayWindow();
  } else {
    // Standard product launch
    launchWindow = createLaunchWindow();
  }
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  await terminateTesseractWorker();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
