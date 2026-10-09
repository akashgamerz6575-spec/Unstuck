# Unstuck — Judging Readiness & Technical Audit

> **Target Platform:** Windows 11 Desktop (Electron) + Portable Web Companion (Node / Render / Railway)  
> **Model Candidate:** `gemini-3.1-flash-lite` (default, low-thinking latency ~2.8s) / `gemini-3.5-flash-lite` / `gemini-3.8-flash`  
> **Target Application Baseline:** LibreOffice Calc (creating a labelled horizontal bar chart from tabular data `A1:B5`)  
> **Repository Budget:** Strict < 10 MB limit (Tracked source/assets: **~3.75 MB** across 98 files; Git database: **~2.93 MB**; Total: **~6.68 MB**)  
> **Public Repository:** [https://github.com/akashgamerz6575-spec/Unstuck](https://github.com/akashgamerz6575-spec/Unstuck)  
> **Submission Deadline:** 9 October, 4:30 PM IST  

---

## 1. Executive Summary & Product Role

**Unstuck** is an interactive desktop coach guiding beginners through multi-step desktop software tasks using on-demand screen observation, local OCR grounding, pass-through visual overlays, progress verification, and mistake recovery.

### What Unstuck Is:
- A non-intrusive pair coach for beginners.
- Screen-aware: observes the active application window upon user demand (`Check` button or `Ctrl+Alt+U`).
- Grounded: identifies UI buttons using local OCR candidates and highlights target controls with a high-contrast boundary overlay.
- Patient: verifies actual visible screen progress before advancing.
- Resilient: detects wrong turns (e.g. creating a Pie chart instead of a Bar chart, or opening the wrong menu) and guides the user back to the target path without losing the original goal.

### What Unstuck Is Not (Deliberate Out-of-Scope Boundaries):
- **Not an autonomous agent:** Unstuck does not hijack the cursor, simulate mouse clicks, or type keystrokes into user applications. The user retains complete physical control.
- **Not continuous screen streaming:** No continuous video recording or battery-draining background polling. Capture occurs solely when the user clicks **Check** or presses the keyboard shortcut.
- **Not universal automation:** Unstuck specializes in step-by-step guidance for structured desktop tasks (LibreOffice Calc demo benchmark).

---

## 2. Milestone Focus: Changed-Goal Root Cause & Resolution

### Observed Failure Mode
When the user restarted the application or entered a custom goal (e.g., *"Simplify all three columns and highlight the highest number"*), Unstuck prematurely responded that the horizontal bar chart goal was already achieved.

### Root Cause Analysis (Evidence-Based Trace)
1. **Hardcoded System Prompt:** In both `server/gemini-service.ts` and `electron/gemini-coach.ts`, a static `const SYSTEM_PROMPT` had baked-in instructions declaring that the user's tested goal was *always* to create a horizontal bar chart and that `status="complete"` must be declared whenever a horizontal bar chart was visible.
2. **Missing Session & Stale State Invalidation:** Electron's coaching history (`coachingHistory`) and the web client's session state were not cleared on user goal modifications or session restarts, allowing previous chart completion assessments to leak into the prompt payload.
3. **Ambiguous Goal Handling:** Vague prompts like *"simplify all three columns"* had no explicit instruction for Gemini to request clarification, leading to unpredictable classification.

### Implemented Fix
1. **Dynamic Goal-Aware System Prompt (`buildSystemPrompt(goal)`):**
   - **Preset Chart Mode:** Follows standard 4-step Chart Wizard guidance and validates horizontal bar chart completion.
   - **Custom Goal Mode:** Explicitly restricts chart completion rules: *"An existing chart, plot, or graphic on the spreadsheet MUST NEVER cause status='complete' for this goal unless the user explicitly requested a chart."*
   - **Ambiguous Clarification:** Instructs Gemini to return `status: "uncertain"` with an explicit clarification request whenever phrasing is underspecified or conflicts with visible sheet geometry.
   - **Spreadsheet Formatting Tasks:** Instructs Gemini to inspect visible cell contents and guide cell selection followed by toolbar formatting actions. Explicitly notes that individual grid cells lack OCR candidate tokens, so Gemini emits `selectedCandidateId: null` to prevent coordinate hallucinations while providing clear textual guidance.
2. **Strict State Invalidation:**
   - Electron `ipcMain.on('start-coaching')` now resets `coachingHistory = []`, `previousInstruction = null`, `currentStepNumber = 1`, and clears all visible overlay brackets.
   - Web companion `app.ts` clears guidance cards, target highlights, previous instructions, and resets the backend session via `/api/session/reset` immediately when the user alters the goal text or uploads a new screenshot.
3. **Automated Regression Coverage:**
   - Added `tests/goal-invalidation.unit.test.ts` (7 tests covering prompt construction, chart isolation, ambiguous clarification contracts, null-candidate formatting, and session reset invalidation). All 83 unit tests passing across 23 suites.

### Live Verification Results (Google Gemini API — 2 Calls Used)
- **Test 1 (Ambiguous Goal: *"Simplify all three columns and highlight the highest number"*):**
  - **Status:** `uncertain`
  - **Assessment:** `uncertain`
  - **Instruction:** *"Please clarify what you mean by 'simplify all three columns', as only columns A and B contain data. Additionally, specify if you want to highlight the highest number in a specific column or across the whole table."*
  - **Target Candidate:** `null` (no guessed highlight).
- **Test 2 (Unambiguous Goal: *"Highlight the largest numeric value in B2:C5 with a yellow background."* against a sheet with an existing completed bar chart):**
  - **Status:** `guide`
  - **Assessment:** `not_started`
  - **Instruction:** *"Click cell C3 (which contains the largest value, 68) to select it, then click the 'Background Color' tool on the toolbar to apply a yellow highlight."*
  - **Target Candidate:** `null` (safe grid cell guidance without hallucinated bounding box).
  - **Completion Check:** The presence of the existing horizontal bar chart did **not** trigger premature completion.

---

## 3. Character & Visual Identity: Nori

- **Companion Name:** **Nori**
- **Approved Source Asset:** `captures/design/nori.png` (High-resolution 3D robot character with orange warm eyes, blue accents, holding a gift parcel, waving hello).
- **Web Production Assets:**
  - `web/assets/nori.webp` (**191 KB**, 1254x1254, **lossy WebP encoded at quality=90 with alpha transparency**, delivering 78% reduction vs 989 KB PNG while preserving clean silhouette edges; never described as lossless).
  - `web/assets/nori.png` (989 KB, PNG fallback).
  - `web/assets/nori-portrait.webp` (**83 KB**, 840x630 crop centered on Nori's head and welcoming expression for coach panel badge).
  - `web/assets/nori-portrait.png` (459 KB, PNG fallback).
- **Hero Staging & Unified Palette:**
  - Deep midnight navy canvas (`#080F24`), enormous pearl HTML `UNSTUCK` lettering (`#F5F7FC`) positioned directly behind Nori, warm welcome bubble, and immediate CTA visibility.
  - Eliminated all residual forest-green card backgrounds, unifying the application around midnight navy `#080F24` and sky blue `#69C8FF` accents.
  - Added `#workflow-demo` visual walkthrough section showing an illustrative *Observe → Guide → Check* progression with Calc snippet, grounded outline, and Nori guidance card (explicitly labelled as a documented example).
  - Dedicated standalone example bar (`Try an example: [Start] [Data selected] [Wrong chart] [Finished chart]`) placed outside the dropzone so examples remain discoverable after loading an image.
  - Full `prefers-reduced-motion` compliance: all transforms and entrance sequences are disabled when requested, displaying an instant static layout with zero functionality loss.

---

## 4. Fixture Provenance & Evidence Disclosures

To adhere strictly to truthfulness and avoid deceptive evaluation claims, we disclose the exact provenance of all evaluation fixtures and screenshots:

### A. Model Input Fixtures (`fixtures/`)
For the web companion example selector and automated integration testing, four Calc fixtures are provided:
1. `fixtures/calc-clean-unselected.png` (97 KB): Step 1 — Table `A1:B5` visible in Calc with an unrelated cell (`C10`) focused.
2. `fixtures/calc-clean-selected.png` (79 KB): Step 2 — Table `A1:B5` visibly highlighted/selected.
3. `fixtures/calc-clean-pie-chart.png` (91 KB): Step 3 — User made an intentional deviation: generated a Pie chart instead of a horizontal Bar chart.
4. `fixtures/calc-clean-bar-chart.png` (71 KB): Step 4 — Finished horizontal bar chart titled *"Requests by department"*.

**Important Provenance Disclosure:**
- These files are **processed fixtures derived from real Windows 11 Calc desktop captures**.
- During the live desktop recording, the desktop coach panel occupied the bottom-right corner of the screen.
- To prevent multimodal vision models (Gemini) from reading prior coaching text or answer hints directly from the image, the bottom-right coach region was replaced with reconstructed empty spreadsheet grid lines matching the surrounding Calc canvas.
- These fixtures are strictly model-input test assets. They are **not** presented as untouched raw desktop captures.

### B. Documentation Evidence Captures (`docs/images/`)
Four live desktop execution screenshots are retained in `docs/images/` showing Unstuck in active Windows 11 coaching mode:
- `docs/images/01-selection-recognition.png` (159 KB): Shows coach detecting unselected table data.
- `docs/images/02-progress-advancement.png` (159 KB): Shows coach advancing to Chart Wizard and highlighting the `Insert` menu.
- `docs/images/03-wrong-chart-recovery.png` (197 KB): Shows coach detecting wrong Pie chart type and presenting recovery badge.
- `docs/images/04-task-completion.png` (158 KB): Shows coach validating horizontal bar chart completion.

---

## 5. Reliability & Error Resilience History

During real-world end-to-end testing against Google Gemini APIs, several failure modes were observed and engineered for:

| Failure Mode Observed | Root Cause | Implemented Mitigation | Verification Status |
|---|---|---|---|
| **HTTP 429 (Rate Limit Exhaustion)** | Rapid repeated user clicks triggering burst requests to Gemini. | **Session Budget & Rate Pacing:** Web and Desktop enforce a strict 15-request persistent session cap and a 5-second minimum interval between checks. Buttons show active cooldown. | **Verified:** Unit tests `tests/web-server.unit.test.ts` and `tests/budget-tracker.unit.test.ts` pass; live server rejects rapid bursts with friendly HTTP 429 messages. |
| **Client Timeout (Network stalls)** | Indefinite fetch hangs during network latency spikes. | **25-Second AbortSignal:** Model requests enforce an explicit 25-second timeout (`REQUEST_TIMEOUT_MS = 25000`) with friendly retry notices, preserving user session state without losing context. | **Verified:** Unit tests verify timeout rejection handling; client displays retry button without resetting goal. |
| **Malformed Structured JSON** | Multimodal model output returning unescaped Markdown or trailing text outside JSON schema. | **Safe Uncertainty Rejection:** Multi-tier JSON sanitizer strips markdown fences and validates candidates against local OCR sets. If JSON remains corrupt or schema validation fails, the system returns an explicit safe error/uncertain result (`status: "uncertain"`), **never** fabricating successful guidance or completion through fallback defaults. | **Verified:** 83 unit tests pass across 23 suites, validating candidate contract and schema boundaries. |
| **Provider Overload (503 / 500)** | Upstream Google AI Studio temporary capacity spikes during peak hours. | **Truthful Status & Graceful Fallback:** Status bar displays `Ready (Key Configured)` rather than falsely claiming guaranteed upstream uptime. Real errors display friendly retry dialogs. | **Verified:** Verified during local testing runs; error state provides clean retry action. |

---

## 6. Judging Criteria Audit

### 1. Code Quality
- **Architecture:** Clean process separation between Electron Main (security, secret management, Win32 window management, native screen capture), Preload (strictly typed context-isolated IPC), and Renderer / Web frontend.
- **Strict Typing:** All TypeScript configurations run under `strict: true`. No untyped `any` leaks in core IPC contracts or model schemas.
- **Build Reproducibility:** Single command `npm run build` compiles TypeScript (`tsc`) and synchronizes static assets via `scripts/copy-assets.mjs` and `scripts/copy-web-assets.mjs`.

### 2. Security Boundaries
- **Server-Side Credentials:** `GEMINI_API_KEY` is loaded exclusively into Node / Electron backend processes from `.env`. It is **never** injected into HTML, bundled JavaScript, renderer processes, or git commits.
- **Narrow IPC Surface:** Renderer only accesses sandboxed IPC channels (`onStatusUpdate`, `sendStart`, `sendCheck`, etc.).
- **Untrusted Observations:** Screen text and OCR candidates are treated as untrusted data; never rendered via `innerHTML` or executed as code.
- **Pass-through Overlay:** Electron transparent overlay uses `setIgnoreMouseEvents(true, { forward: true })`, ensuring mouse events pass through directly to native applications.

### 3. Efficiency & Resource Footprint
- **Repository Size Separation:**
  - Tracked source and assets: **3,753,547 bytes (~3.75 MB across 98 files)**, well within the 5 MB target.
  - Git database objects (`.git`): **2,931,485 bytes (~2.93 MB)**.
  - Combined tracked files + git repository: **~6.68 MB**, strictly adhering to the < 10 MB budget.
- **OCR Worker Reuse:** Tesseract OCR worker is initialized once and reused across capture cycles, avoiding memory leaks and spin-up delays.
- **Lightweight Assets:** Typography hosted locally (*Manrope* and *DM Sans*, < 120 KB total); Nori character encoded as WebP at 191 KB (78% smaller than original PNG).

### 4. Testing
- **Automated Test Results:** **83 passing unit tests** across 23 test suites (`npm test`, 0 failures).
  - Goal invalidation, chart isolation, and clarification contracts (`tests/goal-invalidation.unit.test.ts`).
  - Coordinate transformations and 125% DPI scaling math.
  - Candidate ID contract validation.
  - Recovery payload schemas (wrong menu, wrong chart type).
  - Session budget tracker and rate pacing.
  - Web server endpoints (`/healthz`, `/api/example`, `/api/examples`, `/api/check`, `/api/session/reset`).

### 5. Render / Railway Deployment Configuration

The web companion is completely containerized and portable for Cloud Run, Render, or Railway:

```dockerfile
# Stage 1: Build TypeScript and copy static assets
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY server/ server/
COPY electron/ electron/
COPY web/ web/
COPY fixtures/ fixtures/
COPY scripts/ scripts/
RUN npm run build

# Stage 2: Production runner
FROM node:20-slim AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist dist/
COPY --from=builder /app/web web/
COPY --from=builder /app/fixtures fixtures/
EXPOSE 8080
ENV PORT=8080
ENV HOST=0.0.0.0
CMD ["node", "dist/server/server.js"]
```

#### Render / Railway Web Service Settings:
- **Environment:** Node / Docker
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start:web`
- **Health Check Endpoint:** `/healthz`
- **Port:** `8080` (or dynamic `$PORT`)
- **Required Secrets:** `GEMINI_API_KEY` (configured securely in Render/Railway dashboard environment variables)
- **Optional Model Override:** `GEMINI_MODEL=gemini-3.1-flash-lite`

---

## 7. Submission Checklist & Repository Status

- [x] **Repository Budget:** Tracked source is ~3.75 MB, Git objects are ~2.93 MB (Total ~6.68 MB < 10 MB).
- [x] **Single Branch Integrity:** All commits made directly on `main`. No auxiliary branches created.
- [x] **Secret Isolation:** Zero credentials committed to git; `.env` is git-ignored and validated.
- [x] **Changed Goal Regression:** Verified live with Google Gemini; covered by 7 unit tests.
- [x] **Nori Character Asset:** Preserved approved character asset and visual features.
- [x] **GitHub Source Navigation:** Direct link to [https://github.com/akashgamerz6575-spec/Unstuck](https://github.com/akashgamerz6575-spec/Unstuck) added to desktop header, mobile header, and footer with no fabricated metrics.
- [!] **Public Repository Notice:** The remote repository on GitHub does not yet contain this local correction milestone. Pushing remains deferred until Akash initiates submission.
