/**
 * Unstuck Web - Client Application Controller & State Machine
 * 
 * Manages full interactive web companion experience:
 * - Image upload (drag & drop, file picker, clipboard paste).
 * - "Explore an example" loading from server.
 * - Goal entry and preset selection.
 * - Monotonic request identity & stale-response rejection.
 * - Progress checks with fresh screenshots across session turns.
 * - Grounded bounding box rendering relative to displayed image.
 * - Error states, rate limit pacing feedback, and clean session reset.
 */

interface NormalizedBox {
  0: number; // ymin
  1: number; // xmin
  2: number; // ymax
  3: number; // xmax
}

interface ValidatedGuidance {
  assessment: 'not_started' | 'expected' | 'unexpected' | 'uncertain';
  status: 'guide' | 'recover' | 'uncertain' | 'complete';
  observation: string;
  instruction: string;
  targetLabel: string | null;
  targetBox: [number, number, number, number] | null;
  selectedCandidateId: string | null;
  expectedOutcome: string;
  reason: string | null;
  hasTargetHighlight: boolean;
}

interface CheckResponse {
  success: boolean;
  guidance?: ValidatedGuidance;
  stepNumber?: number;
  checkCount?: number;
  maxChecks?: number;
  durationMs?: number;
  candidatesFound?: number;
  imageDimensions?: { width: number; height: number };
  error?: string;
  retryAfterSec?: number;
}

interface SessionTurnRecord {
  turnNumber: number;
  instruction: string;
  assessment: string;
  status: string;
  selectedCandidateText: string | null;
}

type AppState = 'ready' | 'preview' | 'analysing' | 'guidance' | 'recovery' | 'uncertain' | 'complete' | 'error';

class UnstuckWebApp {
  private state: AppState = 'ready';
  private sessionId: string;
  private currentStepNumber = 1;
  private checkCount = 0;
  private maxChecks = 15;
  private inFlightRequestId = 0;
  private abortController: AbortController | null = null;

  private imageBase64: string | null = null;
  private imageMime: 'image/png' | 'image/jpeg' = 'image/png';
  private lastGuidance: ValidatedGuidance | null = null;
  private history: SessionTurnRecord[] = [];

  // DOM Elements
  private dropzone = document.getElementById('dropzone') as HTMLElement;
  private fileInput = document.getElementById('file-input') as HTMLInputElement;
  private previewContainer = document.getElementById('preview-container') as HTMLElement;
  private previewImg = document.getElementById('preview-img') as HTMLImageElement;
  private highlightOverlay = document.getElementById('highlight-overlay') as HTMLElement;
  private imageMetaBadge = document.getElementById('image-meta-badge') as HTMLElement;
  private candidateCountBadge = document.getElementById('candidate-count-badge') as HTMLElement;
  private canvasStepNum = document.getElementById('canvas-step-num') as HTMLElement;
  private canvasFooterTip = document.getElementById('canvas-footer-tip') as HTMLElement;

  private btnFreshScreenshot = document.getElementById('btn-fresh-screenshot') as HTMLButtonElement;
  private btnClearImage = document.getElementById('btn-clear-image') as HTMLButtonElement;
  private btnLoadCalcExample = document.getElementById('btn-load-calc-example') as HTMLButtonElement;
  private btnHeroExample = document.getElementById('btn-hero-example') as HTMLButtonElement;
  private btnPresetChart = document.getElementById('btn-preset-chart') as HTMLButtonElement;
  private btnAction = document.getElementById('btn-action') as HTMLButtonElement;
  private btnActionLabel = document.getElementById('btn-action-label') as HTMLElement;
  private btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement;
  private btnResetSession = document.getElementById('btn-reset-session') as HTMLButtonElement;

  private goalInput = document.getElementById('goal-input') as HTMLTextAreaElement;
  private statusBadge = document.getElementById('status-badge') as HTMLElement;
  private busyBox = document.getElementById('busy-box') as HTMLElement;
  private busyLabel = document.getElementById('busy-label') as HTMLElement;
  private instructionStepTag = document.getElementById('instruction-step-tag') as HTMLElement;
  private instructionText = document.getElementById('instruction-text') as HTMLElement;
  private recoveryBox = document.getElementById('recovery-box') as HTMLElement;
  private recoveryText = document.getElementById('recovery-text') as HTMLElement;
  private uncertainBox = document.getElementById('uncertain-box') as HTMLElement;
  private uncertainText = document.getElementById('uncertain-text') as HTMLElement;
  private observationText = document.getElementById('observation-text') as HTMLElement;
  private budgetChip = document.getElementById('budget-chip') as HTMLElement;
  private toastNotice = document.getElementById('toast-notice') as HTMLElement;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.initEvents();
    this.updateBudgetDisplay();
    this.checkServerHealth();
  }

  private getOrCreateSessionId(): string {
    let id = sessionStorage.getItem('unstuck_web_session');
    if (!id) {
      id = 'ses_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
      sessionStorage.setItem('unstuck_web_session', id);
    }
    return id;
  }

  private initEvents(): void {
    // Dropzone click & drag events
    this.dropzone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    ['dragenter', 'dragover'].forEach(name => {
      this.dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      this.dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-active');
      });
    });

    this.dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        this.loadImageFile(dt.files[0]);
      }
    });

    // Clipboard paste support (Ctrl+V)
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            this.loadImageFile(file);
            this.showToast('Screenshot pasted from clipboard.');
            break;
          }
        }
      }
    });

    // Preset & Example buttons
    this.btnPresetChart.addEventListener('click', () => {
      this.goalInput.value = "Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.";
      this.showToast('Tested LibreOffice Calc task preset loaded.');
    });

    this.btnLoadCalcExample.addEventListener('click', () => this.loadCalcExample());
    this.btnHeroExample.addEventListener('click', () => {
      this.loadCalcExample();
      const ws = document.getElementById('workspace');
      if (ws) ws.scrollIntoView({ behavior: 'smooth' });
    });

    // Toolbar buttons
    this.btnFreshScreenshot.addEventListener('click', () => this.fileInput.click());
    this.btnClearImage.addEventListener('click', () => this.clearImage());

    // Main action button
    this.btnAction.addEventListener('click', () => this.handleActionClick());
    this.btnCancel.addEventListener('click', () => this.cancelAnalysis());
    this.btnResetSession.addEventListener('click', () => this.resetSession());
  }

  private async checkServerHealth(): Promise<void> {
    try {
      const res = await fetch('/healthz');
      if (res.ok) {
        const data = await res.json();
        const statusEl = document.getElementById('system-status-text');
        if (statusEl) {
          statusEl.textContent = data.hasKeyConfigured ? 'Ready (Gemini Active)' : 'API Key Pending';
        }
      }
    } catch {
      const statusEl = document.getElementById('system-status-text');
      if (statusEl) statusEl.textContent = 'Server Offline';
    }
  }

  private handleFileSelect(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.loadImageFile(target.files[0]);
    }
  }

  private loadImageFile(file: File): void {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.showToast('Please select a PNG or JPEG screenshot.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      this.showToast('Screenshot exceeds 8 MiB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.setImageData(result, file.type as 'image/png' | 'image/jpeg', `${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
    };
    reader.readAsDataURL(file);
  }

  private async loadCalcExample(): Promise<void> {
    this.showToast('Loading verified LibreOffice Calc capture…');
    try {
      const res = await fetch('/api/example');
      const data = await res.json();
      if (!data.hasExample) {
        this.showToast(data.message || 'Example screenshot not found on server.');
        return;
      }

      const dataUri = `data:${data.mimeType};base64,${data.imageBase64}`;
      this.setImageData(dataUri, data.mimeType, 'Example: Calc Bar Chart Fixture');
      if (data.goal) {
        this.goalInput.value = data.goal;
      }
      this.showToast('Verified Calc fixture loaded. Ready for real AI guidance.');
    } catch (err) {
      this.showToast('Failed to fetch example screenshot.');
    }
  }

  private setImageData(dataUri: string, mime: 'image/png' | 'image/jpeg', metaLabel: string): void {
    this.imageBase64 = dataUri;
    this.imageMime = mime;
    this.previewImg.src = dataUri;

    this.dropzone.style.display = 'none';
    this.previewContainer.style.display = 'flex';
    this.btnFreshScreenshot.style.display = 'inline-block';
    this.btnClearImage.style.display = 'inline-block';
    this.imageMetaBadge.textContent = metaLabel;

    // Clear previous highlight on new image load
    this.clearHighlight();

    if (this.state === 'ready' || this.state === 'complete' || this.state === 'error') {
      this.setState('preview');
      this.instructionStepTag.textContent = `Step ${this.currentStepNumber}`;
      this.instructionText.textContent = 'Screenshot loaded. Click "Find my next move" to inspect the spreadsheet.';
      this.observationText.textContent = 'Image loaded and ready for OCR grounding and vision analysis.';
      this.canvasFooterTip.textContent = 'Click "Find my next move" to request real-time guidance.';
    } else {
      this.canvasFooterTip.textContent = 'Fresh screenshot loaded. Click "Check my progress" to verify your step.';
    }
  }

  private clearImage(): void {
    this.imageBase64 = null;
    this.previewImg.src = '';
    this.clearHighlight();

    this.dropzone.style.display = 'flex';
    this.previewContainer.style.display = 'none';
    this.btnFreshScreenshot.style.display = 'none';
    this.btnClearImage.style.display = 'none';
    this.imageMetaBadge.textContent = 'No image loaded';
    this.candidateCountBadge.style.display = 'none';
    this.canvasFooterTip.textContent = 'Upload a screenshot of your active application to begin.';

    this.setState('ready');
    this.instructionStepTag.textContent = 'Step 1';
    this.instructionText.textContent = 'Upload a screenshot and click "Find my next move" to begin.';
    this.observationText.textContent = 'Awaiting your screenshot upload to inspect the spreadsheet state.';
  }

  private clearHighlight(): void {
    this.highlightOverlay.innerHTML = '';
  }

  private renderGroundedHighlight(targetBox: [number, number, number, number], labelText: string): void {
    this.clearHighlight();

    const [ymin, xmin, ymax, xmax] = targetBox;
    const topPct = (ymin / 10).toFixed(2);
    const leftPct = (xmin / 10).toFixed(2);
    const widthPct = Math.max(1, (xmax - xmin) / 10).toFixed(2);
    const heightPct = Math.max(1, (ymax - ymin) / 10).toFixed(2);

    const bracket = document.createElement('div');
    bracket.className = 'target-bracket';
    bracket.style.top = `${topPct}%`;
    bracket.style.left = `${leftPct}%`;
    bracket.style.width = `${widthPct}%`;
    bracket.style.height = `${heightPct}%`;

    const label = document.createElement('div');
    label.className = 'target-bracket-label';
    label.textContent = labelText || 'Target';
    bracket.appendChild(label);

    this.highlightOverlay.appendChild(bracket);
  }

  private async handleActionClick(): Promise<void> {
    if (this.state === 'complete') {
      this.resetSession();
      return;
    }

    if (!this.imageBase64) {
      this.showToast('Please upload a screenshot first.');
      return;
    }

    const goal = this.goalInput.value.trim();
    if (goal.length < 3) {
      this.showToast('Please describe your goal before checking.');
      return;
    }

    await this.runAnalysis();
  }

  private async runAnalysis(): Promise<void> {
    if (this.state === 'analysing') return;

    this.setState('analysing');
    const requestId = ++this.inFlightRequestId;
    this.abortController = new AbortController();

    const previousInstruction = this.lastGuidance ? this.lastGuidance.instruction : null;

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          goal: this.goalInput.value.trim(),
          imageBase64: this.imageBase64,
          previousInstruction,
          history: this.history
        }),
        signal: this.abortController.signal
      });

      // Stale response guard
      if (requestId !== this.inFlightRequestId) {
        return;
      }

      const data: CheckResponse = await response.json();

      if (!response.ok || !data.success || !data.guidance) {
        if (response.status === 429) {
          this.setState('error');
          this.showToast(data.error || 'Rate limit reached. Please wait a moment.');
          this.instructionText.textContent = data.error || 'Request pacing limit reached. Context preserved.';
          return;
        }

        this.setState('error');
        this.instructionText.textContent = data.error || 'Failed to analyze screenshot.';
        this.showToast(data.error || 'Analysis failed.');
        return;
      }

      const guidance = data.guidance;
      this.lastGuidance = guidance;
      if (typeof data.stepNumber === 'number') {
        this.currentStepNumber = data.stepNumber;
      }
      if (typeof data.checkCount === 'number') {
        this.checkCount = data.checkCount;
      }
      if (typeof data.maxChecks === 'number') {
        this.maxChecks = data.maxChecks;
      }

      this.updateBudgetDisplay();

      // Show candidate count badge
      if (typeof data.candidatesFound === 'number') {
        this.candidateCountBadge.style.display = 'inline-block';
        this.candidateCountBadge.textContent = `${data.candidatesFound} OCR targets`;
      }

      // Record to history
      this.history.push({
        turnNumber: this.checkCount,
        instruction: guidance.instruction,
        assessment: guidance.assessment,
        status: guidance.status,
        selectedCandidateText: guidance.targetLabel
      });

      // Dispatch state based on model response status
      if (guidance.status === 'complete') {
        this.setState('complete');
        this.clearHighlight();
        this.instructionStepTag.textContent = 'Complete';
        this.instructionText.textContent = guidance.instruction;
        this.observationText.textContent = guidance.observation;
        this.canvasFooterTip.textContent = 'Workflow verified! Your chart is visibly inserted in the spreadsheet.';
      } else if (guidance.status === 'recover') {
        this.setState('recovery');
        this.instructionStepTag.textContent = `Correction`;
        this.instructionText.textContent = guidance.instruction;
        this.recoveryText.textContent = guidance.reason || 'Observed deviation from expected chart path. Let us correct it.';
        this.observationText.textContent = guidance.observation;

        if (guidance.hasTargetHighlight && guidance.targetBox) {
          this.renderGroundedHighlight(guidance.targetBox, guidance.targetLabel || 'Target');
        } else {
          this.clearHighlight();
        }
        this.canvasFooterTip.textContent = 'Correct the step in your software, then upload a fresh screenshot and check.';
      } else if (guidance.status === 'uncertain') {
        this.setState('uncertain');
        this.clearHighlight();
        this.instructionStepTag.textContent = 'Uncertain';
        this.instructionText.textContent = guidance.instruction;
        this.uncertainText.textContent = 'Screen observation is ambiguous. Please bring LibreOffice Calc forward and ensure menus are visible.';
        this.observationText.textContent = guidance.observation;
        this.canvasFooterTip.textContent = 'Adjust your window view and check again.';
      } else {
        // Normal guidance step
        this.setState('guidance');
        this.instructionStepTag.textContent = `Step ${this.currentStepNumber}`;
        this.instructionText.textContent = guidance.instruction;
        this.observationText.textContent = guidance.observation;

        if (guidance.hasTargetHighlight && guidance.targetBox) {
          this.renderGroundedHighlight(guidance.targetBox, guidance.targetLabel || 'Click here');
        } else {
          this.clearHighlight();
        }
        this.canvasFooterTip.textContent = 'Execute this step, then upload a fresh screenshot to verify progress.';
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.setState('preview');
        this.showToast('Analysis cancelled.');
        return;
      }
      this.setState('error');
      this.instructionText.textContent = 'Connection error. Please check your network and try again.';
      this.showToast('Network connection failed.');
    } finally {
      this.abortController = null;
    }
  }

  private cancelAnalysis(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async resetSession(): Promise<void> {
    try {
      await fetch('/api/session/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      });
    } catch {
      // Ignore network reset errors
    }

    this.checkCount = 0;
    this.currentStepNumber = 1;
    this.history = [];
    this.lastGuidance = null;
    this.clearHighlight();
    this.updateBudgetDisplay();

    if (this.imageBase64) {
      this.setState('preview');
      this.instructionStepTag.textContent = 'Step 1';
      this.instructionText.textContent = 'Session reset. Click "Find my next move" to begin coaching.';
      this.observationText.textContent = 'Ready for initial screen evaluation.';
    } else {
      this.setState('ready');
    }

    this.showToast('Session reset cleanly.');
  }

  private setState(newState: AppState): void {
    this.state = newState;
    this.statusBadge.className = `status-badge ${newState}`;

    // Update status badge copy
    switch (newState) {
      case 'ready':
        this.statusBadge.textContent = 'Ready';
        this.btnActionLabel.textContent = 'Find my next move';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'preview':
        this.statusBadge.textContent = 'Image Ready';
        this.btnActionLabel.textContent = this.history.length === 0 ? 'Find my next move' : 'Check my progress';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'analysing':
        this.statusBadge.textContent = 'Analysing';
        this.busyBox.style.display = 'flex';
        this.busyLabel.textContent = 'Reading your screen…';
        this.btnAction.disabled = true;
        this.btnCancel.style.display = 'inline-block';
        break;
      case 'guidance':
        this.statusBadge.textContent = `Step ${this.currentStepNumber}`;
        this.btnActionLabel.textContent = 'Check my progress';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'recovery':
        this.statusBadge.textContent = 'Correction';
        this.btnActionLabel.textContent = 'Check my progress';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'block';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'uncertain':
        this.statusBadge.textContent = 'Uncertain';
        this.btnActionLabel.textContent = 'Check again';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'block';
        this.btnCancel.style.display = 'none';
        break;
      case 'complete':
        this.statusBadge.textContent = 'Complete';
        this.btnActionLabel.textContent = 'Start new task';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'error':
        this.statusBadge.textContent = 'Error';
        this.btnActionLabel.textContent = 'Retry check';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
    }

    this.canvasStepNum.textContent = String(this.currentStepNumber);
  }

  private updateBudgetDisplay(): void {
    const remaining = Math.max(0, this.maxChecks - this.checkCount);
    this.budgetChip.textContent = `${remaining} checks left`;
  }

  private showToast(message: string): void {
    this.toastNotice.textContent = message;
    this.toastNotice.style.display = 'block';
    setTimeout(() => {
      this.toastNotice.style.display = 'none';
    }, 3800);
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new UnstuckWebApp();
});
