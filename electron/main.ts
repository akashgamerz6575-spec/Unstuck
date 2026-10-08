/**
 * Unstuck - Native Capture-to-Highlight & AI Coaching Diagnostic
 * 
 * Demonstrates:
 * 1. Overlay-Only Visibility Mode (--test-overlay)
 * 2. Static Label OCR Targeting Mode (--target=<label>)
 * 3. AI Coaching Loop Integration (--coach)
 * 
 * Invariants:
 * - Single English Tesseract worker reused in memory.
 * - Dynamic runtime coordinate mapping; never hardcoded coordinates.
 * - Context isolation & sandboxing strictly enabled.
 * - Secret isolation: GEMINI_API_KEY handled exclusively in main process.
 * - Strictly bounded: 12-request session budget, 25s timeout, zero retries.
 * - Grounded target candidate selection (no model-guessed coordinates).
 */

import { app, BrowserWindow, desktopCapturer, globalShortcut, screen, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertCapturePixelRect, DisplayBounds } from '../shared/coordinates.js';
import { resolveTargetInCapture, terminateTesseractWorker } from './target-resolver.js';
import { getForegroundWindowInfo } from './window-scoping.js';
import { extractOcrCandidates } from './candidate-extractor.js';
import { queryGeminiCoach, CoachingTurnHistory } from './gemini-coach.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliOptions {
  target: string;
  debugCapture: boolean;
  runOnce: boolean;
  testOverlay: boolean;
  coach: boolean;
}

function parseCliArgs(): CliOptions {
  let target = 'Insert';
  let debugCapture = false;
  let runOnce = false;
  let testOverlay = false;
  let coach = false;

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
    }
  }

  return { target, debugCapture, runOnce, testOverlay, coach };
}

const cliOptions = parseCliArgs();

// Load local .env safely in main process
function loadApiKey(): string | null {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return null;

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
  return null;
}

const GEMINI_API_KEY = loadApiKey();

// Runtime asset path resolution
const projectRoot = process.cwd();
const candidatePreloadPaths = [
  path.resolve(projectRoot, 'electron', 'preload.cjs'),
  path.resolve(__dirname, 'preload.cjs')
];
const preloadPath = candidatePreloadPaths.find(p => fs.existsSync(p)) || candidatePreloadPaths[0];

const candidateHtmlPaths = [
  path.resolve(projectRoot, 'electron', 'overlay.html'),
  path.resolve(__dirname, 'overlay.html')
];
const htmlPath = candidateHtmlPaths.find(p => fs.existsSync(p)) || candidateHtmlPaths[0];

// Ensure dist colocation
try {
  const distDir = path.resolve(projectRoot, 'dist', 'electron');
  if (fs.existsSync(distDir)) {
    const distPreload = path.join(distDir, 'preload.cjs');
    const distHtml = path.join(distDir, 'overlay.html');
    if (!fs.existsSync(distPreload) && fs.existsSync(candidatePreloadPaths[0])) {
      fs.copyFileSync(candidatePreloadPaths[0], distPreload);
    }
    if (!fs.existsSync(distHtml) && fs.existsSync(candidateHtmlPaths[0])) {
      fs.copyFileSync(candidateHtmlPaths[0], distHtml);
    }
  }
} catch {
  // Colocation fallback
}

let overlayWindow: BrowserWindow | null = null;
let isInFlight = false;
let currentRequestId = 0;
let initialDisplayBounds: DisplayBounds | null = null;

// Coaching session state
const MAX_SESSION_REQUESTS = 12;
let sessionRequestCount = 0;
let coachingHistory: CoachingTurnHistory[] = [];
let previousInstruction: string | null = null;
let previousCandidateSig: string | null = null;

const COACHING_GOAL = 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.';

/**
 * Creates the transparent click-through overlay window.
 */
function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const fullBounds = primaryDisplay.bounds; // FULL monitor bounds

  initialDisplayBounds = {
    x: fullBounds.x,
    y: fullBounds.y,
    width: fullBounds.width,
    height: fullBounds.height
  };

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

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Load Error] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console L${level}] ${message} (${sourceId}:${line})`);
  });

  win.loadFile(htmlPath);

  win.on('closed', () => {
    overlayWindow = null;
  });

  return win;
}

/**
 * Dismisses active outline and cancels pending in-flight operations.
 */
function handleDismiss(): void {
  currentRequestId++;
  console.log('[Diagnostic Lifecycle] Dismissal triggered: pending operations invalidated, overlay cleared.');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }
}

/**
 * Resets coaching session state and budget counter.
 */
function handleSessionReset(): void {
  currentRequestId++;
  sessionRequestCount = 0;
  coachingHistory = [];
  previousInstruction = null;
  previousCandidateSig = null;
  console.log(`\n======================================================`);
  console.log(`[SESSION RESET] Coaching history cleared.`);
  console.log(`[SESSION RESET] 12-request session budget reset.`);
  console.log(`======================================================\n`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }
}

/**
 * Diagnostic Mode: Explicit Overlay-Only Test
 */
function executeTestOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.error('[Diagnostic Error] Overlay window not available for test');
    return;
  }

  const primary = screen.getPrimaryDisplay();
  const bounds = primary.bounds;

  const testWidth = 320;
  const testHeight = 160;
  const testRect = {
    x: Math.round(bounds.width / 2 - testWidth / 2),
    y: Math.round(bounds.height / 2 - testHeight / 2),
    width: testWidth,
    height: testHeight
  };

  console.log(`\n======================================================`);
  console.log(`[OVERLAY-ONLY RENDERING DIAGNOSTIC MODE]`);
  console.log(`[NOTICE: Synthetic test rectangle only. Never used as live target fallback.]`);
  console.log(`  - Target Display: ${primary.id} (${bounds.width}x${bounds.height} logical)`);
  console.log(`  - Test Rect (Logical): [x: ${testRect.x}, y: ${testRect.y}, w: ${testRect.width}, h: ${testRect.height}]`);

  overlayWindow.showInactive();
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const winBounds = overlayWindow.getBounds();
  console.log(`[Overlay Window State] isVisible=${overlayWindow.isVisible()}, bounds=${winBounds.x},${winBounds.y} ${winBounds.width}x${winBounds.height}`);

  overlayWindow.webContents.send('show-outline', {
    rect: testRect,
    label: 'OVERLAY VISIBILITY TEST',
    isTest: true,
    autoExpireMs: 30000
  });

  console.log(`[Diagnostic] Dispatched test rectangle. Active for 30s. Press Ctrl+Alt+D or Escape to dismiss.`);
  console.log(`======================================================\n`);
}

/**
 * Executes a single AI coaching turn on demand.
 */
async function executeCoachingTurn(): Promise<boolean> {
  if (isInFlight) {
    console.log('[AI Coach] Check already in flight; duplicate trigger blocked.');
    return false;
  }

  if (sessionRequestCount >= MAX_SESSION_REQUESTS) {
    console.log(`\n[Session Budget Reached] Enforced ${MAX_SESSION_REQUESTS}-request session limit reached.`);
    console.log(`Press Ctrl+Alt+R to reset session and budget.\n`);
    return false;
  }

  if (!GEMINI_API_KEY) {
    console.error('[AI Coach Error] No GEMINI_API_KEY configured in .env. Cannot query coaching model.');
    return false;
  }

  isInFlight = true;
  const requestId = ++currentRequestId;
  const turnIndex = coachingHistory.length + 1;
  const totalStartTime = performance.now();

  try {
    console.log(`\n======================================================`);
    console.log(`[AI COACH TURN #${turnIndex}] Starting observation check...`);
    console.log(`[Session Budget] Request ${sessionRequestCount + 1} of ${MAX_SESSION_REQUESTS}`);

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      console.error('[AI Coach Error] Overlay window not available');
      return false;
    }

    // 1. Clear previous outline and hide overlay
    overlayWindow.webContents.send('clear-outline');
    overlayWindow.hide();

    // 2. Allow DWM redraw
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (requestId !== currentRequestId) {
      console.log(`[AI Coach Turn #${turnIndex}] Cancelled during DWM redraw.`);
      return false;
    }

    // 3. Target Scoping: verify active foreground window is Calc
    const windowInfo = getForegroundWindowInfo();
    console.log(`[Target Scoping] Active window: "${windowInfo.title}" (Process: ${windowInfo.process})`);

    if (!windowInfo.isCalc) {
      console.warn(`[Target Scoping Guard] Foreground window is not LibreOffice Calc!`);
      console.warn(`  - Detected: "${windowInfo.title}" (${windowInfo.process})`);
      console.warn(`  - Action: Please switch to LibreOffice Calc and press Ctrl+Alt+U.`);
      overlayWindow.showInactive();
      return false;
    }

    // 4. Capture screen
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
      console.error(`[AI Coach Error] No desktopCapturer source matched display ID ${targetDisplayId}`);
      return false;
    }

    const thumbnail = matchedSource.thumbnail;
    const captureDims = thumbnail.getSize();
    const imageBuffer = thumbnail.toPNG();
    const captureLatencyMs = performance.now() - captureStartTime;

    console.log(`[AI Coach Capture] Captured ${captureDims.width}x${captureDims.height} px in ${captureLatencyMs.toFixed(1)} ms`);

    overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    if (captureDims.width === 0 || captureDims.height === 0 || imageBuffer.length === 0) {
      console.warn(`[AI Coach Capture Warning] Empty capture received (display locked/asleep).`);
      return false;
    }

    if (requestId !== currentRequestId) {
      console.log(`[AI Coach Turn #${turnIndex}] Cancelled after capture.`);
      return false;
    }

    // 5. Extract OCR candidates filtered to Calc window bounds
    console.log(`[AI Coach OCR] Extracting candidate text controls inside Calc bounds...`);
    const extraction = await extractOcrCandidates(imageBuffer, windowInfo.bounds, scaleFactor);
    console.log(`[AI Coach OCR] Found ${extraction.candidates.length} grounded candidates in ${extraction.durationMs.toFixed(1)} ms.`);

    if (requestId !== currentRequestId) {
      console.log(`[AI Coach Turn #${turnIndex}] Cancelled during OCR candidate extraction.`);
      return false;
    }

    // 6. Detect unchanged screen state
    const currentCandidateSig = extraction.candidates.map(c => c.text).sort().join('|');
    const isScreenUnchanged = previousCandidateSig !== null && currentCandidateSig === previousCandidateSig;

    if (isScreenUnchanged) {
      console.log(`[Observer Note] Screen state appears identical to previous check.`);
    }

    // 7. Query Gemini Coach
    sessionRequestCount++;
    console.log(`[AI Coach Gemini] Querying gemini-3.1-flash-lite (Turn #${turnIndex})...`);
    const result = await queryGeminiCoach({
      apiKey: GEMINI_API_KEY,
      imageBuffer,
      goal: COACHING_GOAL,
      previousInstruction,
      history: coachingHistory,
      candidates: extraction.candidates,
      isScreenUnchanged
    });

    if (requestId !== currentRequestId) {
      console.log(`[AI Coach Turn #${turnIndex}] Invalidate late response: session was dismissed or reset.`);
      return false;
    }

    const totalDurationMs = performance.now() - totalStartTime;

    if (!result.success || !result.guidance) {
      console.error(`\n[AI Coach Error] ${result.error || 'Failed to obtain valid guidance'}`);
      console.log(`[Diagnostic Timings] Capture: ${captureLatencyMs.toFixed(1)} ms | OCR: ${extraction.durationMs.toFixed(1)} ms | Model Latency: ${result.durationMs.toFixed(1)} ms | Total: ${totalDurationMs.toFixed(1)} ms`);
      console.log(`Session context preserved. Press Ctrl+Alt+U to try again.\n`);
      return false;
    }

    const g = result.guidance;

    console.log(`\n======================================================`);
    console.log(`[AI COACH GUIDANCE - Turn #${turnIndex}]`);
    console.log(`  - Assessment: ${g.assessment.toUpperCase()}`);
    console.log(`  - Status:     ${g.status.toUpperCase()}`);
    console.log(`  - Observation: "${g.observation}"`);
    console.log(`  >>> INSTRUCTION: "${g.instruction}"`);
    console.log(`  - Expected Outcome: "${g.expectedOutcome}"`);
    if (g.reason) console.log(`  - Note: "${g.reason}"`);

    // 8. Grounded Overlay Highlight
    if (result.selectedCandidate && (g.status === 'guide' || g.status === 'recover')) {
      const cand = result.selectedCandidate;
      console.log(`  - Target Control: "${cand.text}" (Candidate ID: ${cand.id}, Confidence: ${cand.confidence.toFixed(1)}%)`);

      const mappingResult = convertCapturePixelRect(
        cand.pixelBbox,
        captureDims,
        runtimeBounds,
        { x: runtimeBounds.x, y: runtimeBounds.y }
      );

      if (mappingResult.valid) {
        const { overlayLocal } = mappingResult.value;
        overlayWindow.webContents.send('show-outline', {
          rect: overlayLocal,
          label: cand.text,
          isTest: false,
          autoExpireMs: 8000
        });
        console.log(`  - Highlight placed at logical [x: ${overlayLocal.x.toFixed(1)}, y: ${overlayLocal.y.toFixed(1)}, w: ${overlayLocal.width.toFixed(1)}, h: ${overlayLocal.height.toFixed(1)}]`);
      }
    } else {
      console.log(`  - Highlight: None (Text-only guidance)`);
      overlayWindow.webContents.send('clear-outline');
    }

    console.log(`[Telemetry] Latencies: Capture=${captureLatencyMs.toFixed(1)}ms | OCR=${extraction.durationMs.toFixed(1)}ms | Gemini=${result.durationMs.toFixed(1)}ms | Total=${totalDurationMs.toFixed(1)}ms`);
    if (result.tokens) {
      console.log(`[Token Usage] Prompt: ${result.tokens.prompt} | Candidate: ${result.tokens.candidate} | Thoughts: ${result.tokens.thoughts || 0} | Total: ${result.tokens.total}`);
    }
    console.log(`[Budget] Used ${sessionRequestCount} of ${MAX_SESSION_REQUESTS} requests`);
    console.log(`======================================================\n`);

    // Update session tracking
    previousInstruction = g.instruction;
    previousCandidateSig = currentCandidateSig;
    coachingHistory.push({
      turnNumber: turnIndex,
      instruction: g.instruction,
      assessment: g.assessment,
      status: g.status,
      selectedCandidateText: result.selectedCandidate?.text || null
    });

    if (g.status === 'complete') {
      console.log(`*** [GOAL COMPLETE] Horizontal bar chart titled "Requests by department" verified! ***\n`);
    }

    return true;
  } catch (err) {
    console.error('[AI Coach Fatal Error]', err);
    return false;
  } finally {
    isInFlight = false;
  }
}

/**
 * Standard OCR static label proof mode
 */
async function executeCaptureToHighlight(targetLabel: string, debugCapture: boolean): Promise<boolean> {
  if (isInFlight) {
    console.log('[Diagnostic Lifecycle] Capture/OCR already in flight; duplicate trigger blocked.');
    return false;
  }

  isInFlight = true;
  const requestId = ++currentRequestId;
  const totalStartTime = performance.now();

  try {
    console.log(`\n======================================================`);
    console.log(`[Diagnostic Run #${requestId}] Target: "${targetLabel}"`);

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      console.error('[Diagnostic Error] Overlay window not available');
      return false;
    }

    overlayWindow.webContents.send('clear-outline');
    overlayWindow.hide();

    await new Promise((resolve) => setTimeout(resolve, 150));

    if (requestId !== currentRequestId) {
      console.log(`[Diagnostic Run #${requestId}] Cancelled during DWM redraw delay.`);
      return false;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const runtimeBounds = primaryDisplay.bounds;
    const scaleFactor = primaryDisplay.scaleFactor;

    console.log(`[Diagnostic Environment] Display ID: ${primaryDisplay.id} | Logical: ${runtimeBounds.width}x${runtimeBounds.height} | Scale: ${scaleFactor * 100}%`);

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
      console.error(`[Diagnostic Error] No desktopCapturer source matched display ID ${targetDisplayId}`);
      return false;
    }

    const thumbnail = matchedSource.thumbnail;
    const captureDims = thumbnail.getSize();
    const imageBuffer = thumbnail.toPNG();
    const captureLatencyMs = performance.now() - captureStartTime;

    console.log(`[Diagnostic Capture] Captured ${captureDims.width}x${captureDims.height} px in ${captureLatencyMs.toFixed(1)} ms`);

    overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    if (captureDims.width === 0 || captureDims.height === 0 || imageBuffer.length === 0) {
      console.warn(`[Diagnostic Capture Warning] Empty capture received (display locked/asleep).`);
      return false;
    }

    if (debugCapture) {
      const debugDir = path.resolve(process.cwd(), 'captures');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      const debugPath = path.join(debugDir, `diagnostic-capture-${Date.now()}.png`);
      fs.writeFileSync(debugPath, imageBuffer);
      console.log(`[Diagnostic Debug] Capture written to ${debugPath}`);
    }

    if (requestId !== currentRequestId) {
      console.log(`[Diagnostic Run #${requestId}] Cancelled after capture.`);
      return false;
    }

    console.log(`[Diagnostic OCR] Running local English Tesseract recognition for "${targetLabel}"...`);
    const ocrResult = await resolveTargetInCapture(imageBuffer, targetLabel);
    const ocrLatencyMs = ocrResult.durationMs;

    if (requestId !== currentRequestId) {
      console.log(`[Diagnostic Run #${requestId}] Cancelled during OCR processing.`);
      return false;
    }

    const totalLatencyMs = performance.now() - totalStartTime;

    if (ocrResult.status === 'unresolved') {
      console.log(`[Diagnostic Result] Target "${targetLabel}" UNRESOLVED.`);
      console.log(`  - Reason: ${ocrResult.reason}`);
      console.log(`[Diagnostic Timings] Capture: ${captureLatencyMs.toFixed(1)} ms | OCR: ${ocrLatencyMs.toFixed(1)} ms | Total: ${totalLatencyMs.toFixed(1)} ms`);
      console.log(`======================================================\n`);
      overlayWindow.webContents.send('clear-outline');
      return false;
    }

    const mappingResult = convertCapturePixelRect(
      ocrResult.pixelBbox,
      captureDims,
      runtimeBounds,
      { x: runtimeBounds.x, y: runtimeBounds.y }
    );

    if (!mappingResult.valid) {
      console.error(`[Diagnostic Coordinate Error] ${mappingResult.error}`);
      return false;
    }

    const { overlayLocal } = mappingResult.value;

    console.log(`[Diagnostic Result] Target "${targetLabel}" RESOLVED!`);
    console.log(`  - Detected Text: "${ocrResult.detectedText}" (Confidence: ${ocrResult.confidence.toFixed(1)}%)`);
    console.log(`  - Overlay Local: [x: ${overlayLocal.x.toFixed(1)}, y: ${overlayLocal.y.toFixed(1)}, w: ${overlayLocal.width.toFixed(1)}, h: ${overlayLocal.height.toFixed(1)}]`);
    console.log(`[Diagnostic Timings] Capture: ${captureLatencyMs.toFixed(1)} ms | OCR: ${ocrLatencyMs.toFixed(1)} ms | Total: ${totalLatencyMs.toFixed(1)} ms`);

    overlayWindow.webContents.send('show-outline', {
      rect: overlayLocal,
      label: ocrResult.detectedText,
      isTest: false,
      autoExpireMs: 8000
    });

    console.log(`[Diagnostic Overlay] Highlight outline dispatched to overlay. Auto-expires in 8s. Press Ctrl+Alt+D or Escape to dismiss.`);
    console.log(`======================================================\n`);
    return true;
  } catch (err) {
    console.error('[Diagnostic Fatal Error]', err);
    return false;
  } finally {
    isInFlight = false;
  }
}

/**
 * Registers global keyboard shortcuts
 */
function registerShortcuts(targetLabel: string, debugCapture: boolean, testOverlay: boolean, coach: boolean): void {
  // Capture on demand: Ctrl+Alt+U
  const captureSuccess = globalShortcut.register('CommandOrControl+Alt+U', () => {
    if (testOverlay) {
      executeTestOverlay();
    } else if (coach) {
      executeCoachingTurn();
    } else {
      executeCaptureToHighlight(targetLabel, debugCapture);
    }
  });

  if (!captureSuccess) {
    console.error('[Shortcut Conflict] Failed to register Ctrl+Alt+U: shortcut already registered by another application.');
  } else {
    console.log('[Shortcut Registered] Ctrl+Alt+U (Trigger Turn / Capture on demand)');
  }

  // Dismiss on demand: Ctrl+Alt+D
  const dismissSuccess = globalShortcut.register('CommandOrControl+Alt+D', handleDismiss);
  if (!dismissSuccess) {
    console.error('[Shortcut Conflict] Failed to register Ctrl+Alt+D: shortcut conflict.');
  } else {
    console.log('[Shortcut Registered] Ctrl+Alt+D (Dismiss outline & Invalidate pending)');
  }

  // Reset coaching session: Ctrl+Alt+R
  const resetSuccess = globalShortcut.register('CommandOrControl+Alt+R', handleSessionReset);
  if (resetSuccess) {
    console.log('[Shortcut Registered] Ctrl+Alt+R (Reset coaching session & 12-request budget)');
  }

  // Escape to dismiss
  globalShortcut.register('Escape', handleDismiss);
}

// IPC Telemetry Handlers
ipcMain.on('renderer-preload-ready', () => {
  console.log('[Renderer Telemetry] Preload script executed and contextBridge initialized successfully.');
});

ipcMain.on('renderer-dom-ready', () => {
  console.log('[Renderer Telemetry] DOM loaded and overlay event listeners attached.');
});

ipcMain.on('renderer-error', (_event, err) => {
  console.error('[Renderer Telemetry Error]', err);
});

ipcMain.on('outline-applied-ack', (_event, data) => {
  console.log(`[Renderer Telemetry Ack] Outline applied to DOM:`);
  console.log(`  - Style Dimensions: left=${data.appliedLeft}, top=${data.appliedTop}, width=${data.appliedWidth}, height=${data.appliedHeight}`);
  console.log(`  - Computed DOM Rect: x=${data.computedBounds.x}, y=${data.computedBounds.y}, width=${data.computedBounds.width}, height=${data.computedBounds.height}`);
  console.log(`  - Computed Styles: display=${data.display}, visibility=${data.visibility}, opacity=${data.opacity}, zIndex=${data.zIndex}`);
  console.log(`  [Notice: DOM acknowledgement confirms CSS styling; physical display visibility requires visual verification.]`);
});

// App lifecycle
app.whenReady().then(async () => {
  console.log(`\n======================================================`);
  console.log(`Unstuck - AI Desktop Coach Engineering Diagnostic`);
  let modeName = `LIVE TARGET PROOF ("${cliOptions.target}")`;
  if (cliOptions.testOverlay) modeName = 'OVERLAY-ONLY VISIBILITY DIAGNOSTIC';
  if (cliOptions.coach) modeName = 'AI COACHING LOOP (gemini-3.1-flash-lite)';
  console.log(`Mode: ${modeName}`);
  console.log(`Goal: "${COACHING_GOAL}"`);
  console.log(`API Key: ${GEMINI_API_KEY ? 'Configured locally' : 'MISSING (Check .env)'}`);
  console.log(`======================================================`);

  overlayWindow = createOverlayWindow();

  registerShortcuts(cliOptions.target, cliOptions.debugCapture, cliOptions.testOverlay, cliOptions.coach);

  screen.on('display-metrics-changed', () => {
    console.log('[Diagnostic Lifecycle] Display metrics changed; invalidating active outline.');
    handleDismiss();
  });

  overlayWindow.webContents.once('did-finish-load', async () => {
    setTimeout(async () => {
      if (cliOptions.testOverlay) {
        executeTestOverlay();
      } else if (cliOptions.coach) {
        console.log(`\n[Coach Ready] Focus LibreOffice Calc and press Ctrl+Alt+U to trigger initial guidance.\n`);
      } else {
        const success = await executeCaptureToHighlight(cliOptions.target, cliOptions.debugCapture);
        if (cliOptions.runOnce) {
          console.log(`[Diagnostic Run-Once] Exiting in 3 seconds (result: ${success ? 'RESOLVED' : 'UNRESOLVED'})...`);
          setTimeout(() => app.quit(), 3000);
        }
      }
    }, 1000);
  });
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
