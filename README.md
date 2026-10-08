# Unstuck — Interactive Desktop Software Coach

> **"Find your next move."**  
> A screen-aware desktop coach guiding beginners through complex desktop software tasks with visual observation, grounded overlays, progress verification, and mistake recovery.

---

## 1. Problem & Solution

Beginners often get stuck in multi-step desktop software (like spreadsheets, CAD, or graphic design tools) because:
1. Menus and toolbars have hundreds of dense controls.
2. Static online tutorials don't know where the user actually is or if they made a wrong turn.
3. Chatbots provide walls of text without seeing the screen or pointing to the right button.

**Unstuck** solves this by acting as a non-intrusive desktop pair programmer:
- **Observes on Demand:** Takes an instant snapshot of the active application when the user clicks **Check** or presses `Ctrl+Alt+U`.
- **Grounded Targeting:** Detects recognizable text controls locally with English OCR and highlights the exact target control on screen with a transparent pass-through overlay—**never** guessing or hallucinating coordinates.
- **Progress Verification:** Validates visible screen evidence before advancing.
- **Mistake Recovery:** If the user opens the wrong menu (e.g. *Format* instead of *Insert*) or picks the wrong chart type (*Pie* instead of *Bar*), Unstuck gently detects the deviation and explains how to get back on track while preserving the original goal.

---

## 2. Tested Scope & Environment Baseline

- **Operating System:** Windows 11 (tested on Windows 11 Home, 125% DPI scaling).
- **Target Application:** LibreOffice Calc (Desktop).
- **Demo Task:** Create a horizontal bar chart from tabular data `A1:B5` with headers (*Department*, *Requests*) and title *"Requests by department"*.
- **Supported Display:** Single primary display (`2560x1600` physical, `2048x1280` logical at 125% DPI scale measured dynamically at runtime).
- **Model Engine:** Multimodal Google Gemini via `gemini-3.1-flash-lite` (with `LOW` thinking level) for fast reasoning latency (~2.8s measured), with `gemini-3.5-flash-lite` and `gemini-3.8-flash` supported via configuration.

---

## 3. Architecture & Security Isolation

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

## 4. Prerequisites

1. **Node.js:** v20+ (tested on Node v24.13.0, npm 11.6.2).
2. **LibreOffice Calc:** Installed and accessible on Windows.
3. **Gemini API Key:** A valid Google Gemini API key from Google AI Studio.

---

## 5. Setup & Local Configuration

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
   *(Note: `.env` is ignored by Git and never committed.)*

4. **Compile TypeScript & Sync Assets:**
   ```bash
   npm run build
   ```

---

## 6. How to Run

### Option A: Standard Product Launch
```bash
npm start
```
Opens the **Launch Window** (*"Find your next move."*). Click **Start coaching** to begin the session.

### Option B: Developer Mock UI QA (All 9 States Offline)
```bash
npm run mock-ui
```
Opens the active coach panel with a dropdown selector to preview and inspect all 9 visual states (`ready`, `capturing`, `analysing`, `guidance`, `recovery`, `paused`, `complete`, `error`, `text-only`) offline without calling Gemini or consuming API quota.

### Option C: Direct Coaching Mode
```bash
npm run coach
```
Launches directly into active coach mode docked at the bottom-right corner of your desktop.

### Option D: Static OCR Label Proof
```bash
npm run proof -- --target=Insert
```
Diagnostic mode verifying local OCR candidate detection and transparent overlay placement.

---

## 7. Keyboard Shortcuts

| Shortcut | Action | Description |
|---|---|---|
| `Ctrl+Alt+U` | **Trigger Check** | Observes the active Calc window, evaluates progress, and provides the next move. |
| `Ctrl+Alt+D` or `Escape` | **Dismiss Outline** | Clears the active highlight outline and cancels pending analysis. |
| `Ctrl+Alt+R` | **Reset Session** | Clears history and resets the 12-request session budget. |

---

## 8. Test Data Fixture

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

## 9. Test Suites

### Unit Tests (Zero External Dependencies, Fast Offline Suite)
```bash
npm test
```
Runs 48 unit tests covering:
- Coordinate mapping and 125% DPI scaling mathematics
- Window crop calculation and offset translation
- Candidate ID contract validation
- Recovery payload schemas (wrong menu & wrong chart type)
- Request lifecycle and invalidation on Pause/Stop
- Persistent API budget tracker limits and 5-second rate pacing

### Integration Tests (Fixtures & Real Model Contract)
```bash
npm run test:integration
```
Runs 7 integration tests against the saved screenshot fixture `captures/calc-test.png` and verifies live multimodal reasoning with `gemini-3.1-flash-lite`.

---

## 10. Design System & Approved Tokens

Unstuck utilizes the approved organic cinematic token palette:
- **Canvas:** `#111B15` (Deep emerald dark)
- **Deep Ink:** `#17211B`
- **Warm Paper:** `#F4F1E8`
- **Moss Accent:** `#A6B68F` (Highlight outline and primary actions)
- **Clay Accent:** `#D58B64` (Mistake recovery badges and callouts)
- **Error Notice:** `#9F352D`
- **Typography:** Locally packaged *Manrope* (headings) and *DM Sans* (body/controls) under OFL-1.1 licence (combined font footprint < 120 KB).

---

## 11. Known Limitations & Error Resilience

- **Display Sleep / Session Lock:** Windows desktop capture requires an unlocked, active DWM desktop. If the session locks, Unstuck safely surfaces an *"observing window"* notice without crashing.
- **Budget Capping:** Default session budget is capped at 12 requests with a minimum 5-second pacing interval to prevent rate limit (`HTTP 429`) errors.
- **Single Window Preview:** Unstuck targets the primary display and actively verifies that LibreOffice Calc is foregrounded before generating highlights.