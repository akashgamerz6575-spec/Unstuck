# Unstuck — Interactive Desktop Software Coach

> **"Your screen. One clear next move."**  
> Meet **Nori**, an interactive desktop coach guiding beginners through complex desktop software tasks with visual observation, grounded overlays, progress verification, and mistake recovery.

---

## 1. Problem & Solution

Beginners often get stuck in multi-step desktop software (like spreadsheets, CAD, or graphic design tools) because:
1. Menus and toolbars have hundreds of dense controls.
2. Static online tutorials don't know where the user actually is or if they made a wrong turn.
3. Chatbots provide walls of text without seeing the screen or pointing to the right button.

**Unstuck** solves this with **Nori**, acting as a non-intrusive desktop pair coach:
- **Observes on Demand:** Takes an instant snapshot of the active application when the user clicks **Check** or presses `Ctrl+Alt+U`.
- **Grounded Targeting:** Detects recognizable text controls locally with English OCR and highlights the exact target control on screen with a transparent pass-through overlay—**never** guessing or hallucinating coordinates.
- **Progress Verification:** Validates visible screen evidence before advancing.
- **Mistake Recovery:** If the user opens the wrong menu (e.g. *Format* instead of *Insert*) or picks the wrong chart type (*Pie* instead of *Bar*), Unstuck gently detects the deviation and explains how to get back on track while preserving the original goal.

---

## 2. Visual Verification Walkthrough (Live Gemini Run)

Manual test sessions captured from the live Windows 11 desktop coach demonstrate Unstuck's screen observation, grounding, progress verification, and mistake recovery in real time:

### Step 1: Selection Recognition
![Selection Recognition](docs/images/01-selection-recognition.png)
*Figure 1: **Selection Recognition.** When the user triggers Check with only an unrelated cell (`C10`) focused, Gemini observes that the required data range `A1:B5` is unselected. Rather than advancing prematurely, the coach highlights `A1:B5` and directs the user to select the tabular range first.*

### Step 2: Progress Advancement
![Progress Advancement](docs/images/02-progress-advancement.png)
*Figure 2: **Progress Advancement.** Once the user highlights `A1:B5`, Gemini verifies the visible selection evidence on screen and advances to Step 2 (*Open Chart Wizard*), drawing a grounded highlight box targeting the `Insert` menu / Chart icon.*

### Step 3: Wrong-Chart Mistake Recovery
![Wrong-Chart Mistake Recovery](docs/images/03-wrong-chart-recovery.png)
*Figure 3: **Wrong-Chart Mistake Recovery.** When the user deviates and creates a Pie chart instead of the requested horizontal bar chart, Gemini detects the discrepancy from visible screen evidence. It refrains from false progress, displays the warm amber `CORRECTION` badge, and gives step-by-step instructions to enter edit mode and change the chart type to Bar.*

### Step 4: Verified Completion
![Task Completion](docs/images/04-task-completion.png)
*Figure 4: **Task Completion.** Once the user switches to a horizontal bar chart with the correct data range (`A1:B5`) and title (*"Requests by department"*), Gemini visually validates the finished chart against all goal criteria and displays the soft sage `COMPLETE` badge.*

> **Important Fixture Provenance Disclosure:** For web companion analysis examples, clean Calc-only screenshots are provided in `fixtures/` (`calc-clean-unselected.png`, `calc-clean-selected.png`, `calc-clean-pie-chart.png`, `calc-clean-bar-chart.png`). These are **processed fixtures derived from real Windows 11 captures**: the bottom-right coach card area was replaced with reconstructed spreadsheet grid lines to eliminate prior coaching text and answer hints from the image, ensuring multimodal vision models evaluate the software interface directly. For full technical audit and reliability records, see [docs/judging_readiness.md](docs/judging_readiness.md).

---
---

## 3. Tested Scope & Environment Baseline

- **Operating System:** Windows 11 (tested on Windows 11 Home, 125% DPI scaling).
- **Target Application:** LibreOffice Calc (Desktop).
- **Demo Task:** Create a horizontal bar chart from tabular data `A1:B5` with headers (*Department*, *Requests*) and title *"Requests by department"*.
- **Supported Display:** Single primary display (`2560x1600` physical, `2048x1280` logical at 125% DPI scale measured dynamically at runtime).
- **Model Engine:** Multimodal Google Gemini via `gemini-3.1-flash-lite` (with `LOW` thinking level) for fast reasoning latency (~2.8s measured), with `gemini-3.5-flash-lite` and `gemini-3.8-flash` supported via configuration.
- **Repository Size Budget:** Tracked source and assets remain strictly at **~2.7 MB**, well within the 5 MB target and 10 MB maximum repository budget.

---

## 4. Architecture & Security Isolation

Unstuck enforces strict process and credential boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN PROCESS                           │
│  - Reads GEMINI_API_KEY from local .env (Never exposed to renderer)    │
│  - Win32 HWND & Process Scoping (guards against background windows)    │
│  - Target Region Cropping & Coordinate Offset Mapping                  │
│  - Local Tesseract OCR Candidate Extractor (Reusable worker)           │
│  - Gemini Multimodal API Client with 12-Request Persistent Budget      │
│  - Coordinate Conversion: Normalized/Capture Pixels -> Logical Display │
└──────────────┬──────────────────────────┬──────────────────────────────┘
               │ Narrow Sandboxed IPC     │ Click-Through IPC
               ▼                          ▼
┌───────────────────────────────┐ ┌──────────────────────────────────────┐
│     ACTIVE COACH PANEL        │ │    TRANSPARENT OVERLAY WINDOW        │
│  - Compact 380px paper panel  │ │  - Fullscreen transparent window     │
│  - Dominant 18-20px directive │ │  - Passes mouse clicks through to    │
│  - "What I noticed" rationale │ │    target app (setIgnoreMouseEvents) │
│  - State Machine (9 states)   │ │  - High-contrast Moss (#A6B68F)      │
│  - Developer QA (--mock-ui)   │ │    outline with dark boundary stroke │
└───────────────────────────────┘ └──────────────────────────────────────┘
```

### Security & Privacy Disclosures:
- **No Continuous Recording:** Screen capture occurs **only** when triggered by the user (`Start`, `Check`, or `Ctrl+Alt+U`).
- **No Remote Credential Storage:** `GEMINI_API_KEY` stays strictly in the local Electron main process. A public clone requires the reviewer's own Gemini API key.
- **Untrusted Observations:** Screen text and OCR candidates are treated as untrusted observations, never executable code or shell instructions.
- **Pass-Through Overlay:** Mouse and keyboard interactions are performed by the user; Unstuck does not hijack your cursor or type synthetic keystrokes into your system.

---

## 5. Prerequisites

1. **Node.js:** v20+ (tested on Node v24.13.0, npm 11.6.2).
2. **LibreOffice Calc:** Installed and accessible on Windows.
3. **Gemini API Key:** A valid Google Gemini API key from Google AI Studio.

---

## 6. Setup & Local Configuration

1. **Clone repository:**
   ```bash
   git clone https://github.com/akashgamerz6575-spec/Unstuck.git
   cd Unstuck
   ```

2. **Install dependencies:**
   ```bash
   npm ci
   ```

3. **Configure API Key:**
   Copy `.env.example` to `.env` and insert your Gemini API key:
   ```bash
   copy .env.example .env
   ```
   Edit `.env`:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   GEMINI_MODEL=gemini-3.1-flash-lite
   ```
   *(Note: `.env` is ignored by Git and never committed or exposed to the client.)*

4. **Compile TypeScript & Sync Assets:**
   ```bash
   npm run build
   ```

---

## 7. How to Run

### Option A: Unstuck Web Companion (Browser on Any OS)
```bash
npm run start:web
```
- Starts the lightweight Node HTTP server on `http://localhost:8080`.
- Health check available at `http://localhost:8080/healthz`.
- Features:
  - **Instant Reviewer Exploration:** Click **"Explore an example"** to test with the verified LibreOffice Calc screenshot fixture without installing LibreOffice.
  - **Clean Test Fixtures:** Quick-load clean Calc captures for Step 1 (Start), Step 2 (Progress), Step 3 (Mistake Recovery), and Step 4 (Completed) without coach overlays.
  - **Upload or Paste:** Drag-and-drop any PNG or JPEG screenshot, or paste directly with `Ctrl+V`.
  - **Real Multimodal Guidance:** Click **"Find my next move"** to run live Gemini vision analysis with local OCR text candidate grounding.
  - **Grounded Visual Highlight:** Draws a high-contrast Moss outline bracket directly on the screenshot over the target control.
  - **Progress Check & Recovery:** Upload a fresh screenshot and click **"Check my progress"** to verify visible completion or receive corrective guidance.
  - **Cloud Run Ready:** Built for containerized deployment listening on `0.0.0.0` and `process.env.PORT`.

### Option B: Windows Desktop Application (Live Desktop Overlay)
```bash
npm start
```
Opens the **Launch Window** (*"Find your next move."*). Click **Start coaching** to begin the live desktop coaching session with transparent pass-through click overlays over LibreOffice Calc.

### Option C: Developer Mock UI QA (All 9 States Offline)
```bash
npm run mock-ui
```
Opens the active coach panel with a dropdown selector to preview and inspect all 9 visual states (`ready`, `capturing`, `analysing`, `guidance`, `recovery`, `paused`, `complete`, `error`, `text-only`) offline without calling Gemini or consuming API quota.

### Option D: Direct Desktop Coaching Mode
```bash
npm run coach
```
Launches directly into active desktop coach mode docked at the bottom-right corner of your desktop.

### Option E: Static OCR Label Proof
```bash
npm run proof -- --target=Insert
```
Diagnostic mode verifying local OCR candidate detection and transparent overlay placement.

---

## 8. Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `Ctrl+Alt+U` | **Trigger Check** | Observes the active Calc window, evaluates progress, and provides the next move. |
| `Ctrl+Alt+D` or `Escape` | **Dismiss Outline** | Clears the active highlight outline and cancels pending analysis. |
| `Ctrl+Alt+R` | **Reset Session** | Clears history and resets the 12-request session budget. |

---

## 9. Test Data Fixture

A reproducible sample spreadsheet fixture is provided in `fixtures/department_requests.csv`:

```csv
Department,Requests
Library,42
IT Desk,68
Accounts,31
Admissions,55
```

Open LibreOffice Calc and open or paste this table into cells `A1:B5`.

---

## 10. Test Suites

### Unit Tests (Zero External Dependencies, Fast Offline Suite)
```bash
npm test
```
Runs 76 unit tests across 22 suites covering:
- Coordinate mapping and 125% DPI scaling mathematics
- Window crop calculation and offset translation
- Candidate ID contract validation
- Recovery payload schemas (wrong menu & wrong chart type)
- Request lifecycle and invalidation on Pause/Stop
- Web server HTTP routes, rate pacing, session management, and clean scenario fixtures
- Persistent API budget tracker limits and 5-second rate pacing

### Integration Tests (Fixtures & Real Model Contract)
```bash
npm run test:integration
```
Runs integration tests against the clean screenshot fixture `fixtures/calc-test.png` and verifies live multimodal reasoning with `gemini-3.1-flash-lite`.

---

## 11. Design System & Approved Tokens

Unstuck utilizes a curated cinematic token palette balancing stage depth with readable paper surfaces:
- **Web Stage / Midnight Canvas:** `#080F24` (Deep navy stage)
- **Secondary Surface:** `#111C35` (Deep slate cards)
- **Primary Text:** `#F5F7FC` (Bright pearl)
- **Secondary Text:** `#B7C4D9` (Soft slate)
- **Blue Accent:** `#69C8FF` (Interactive primary highlights & CTAs)
- **Amber Accent:** `#FFC447` (Mistake recovery & Nori eye warmth)
- **Coach Paper:** `#F5F2EA` (Readable warm paper surface for guidance steps)
- **Coach Ink:** `#172033` (High-contrast text on paper cards)
- **Desktop Overlay Outline:** High-contrast Moss outline bracket with subtle boundary stroke.
- **Typography:** Locally packaged *Manrope* (expressive headings) and *DM Sans* (body/controls) under OFL-1.1 licence (combined font footprint < 120 KB).

---

## 12. Known Limitations & Error Resilience

- **Display Sleep / Session Lock:** Windows desktop capture requires an unlocked, active DWM desktop. If the session locks, Unstuck safely surfaces an *"observing window"* notice without crashing.
- **Budget Capping:** Default session budget is capped at 12 requests with a minimum 5-second pacing interval to prevent rate limit (`HTTP 429`) errors.
- **Single Window Preview:** Unstuck targets the primary display and actively verifies that LibreOffice Calc is foregrounded before generating highlights.