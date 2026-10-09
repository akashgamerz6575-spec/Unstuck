# Unstuck — Judging Readiness & Technical Audit

> **Target Platform:** Windows 11 Desktop (Electron) + Portable Web Companion (Node / Render / Railway)  
> **Model Candidate:** `gemini-3.1-flash-lite` (default, low-thinking latency ~2.8s) / `gemini-3.5-flash-lite` / `gemini-3.8-flash`  
> **Target Application Baseline:** LibreOffice Calc (creating a labelled horizontal bar chart from tabular data `A1:B5`)  
> **Repository Budget:** Strict < 10 MB (Current tracked total: ~3.0 MB)  
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

## 2. Character & Visual Identity: Nori

- **Companion Name:** **Nori**
- **Approved Source Asset:** `captures/design/nori.png` (High-resolution 3D robot character with orange warm eyes, blue accents, holding a gift parcel, waving hello).
- **Web Production Assets:**
  - `web/assets/nori.webp` (**191 KB**, 1254x1254, lossless WebP with alpha transparency, primary web asset).
  - `web/assets/nori.png` (989 KB, PNG fallback).
  - `web/assets/nori-portrait.webp` (**83 KB**, 840x630 crop centered on Nori's head and welcoming expression for coach panel badge).
  - `web/assets/nori-portrait.png` (459 KB, PNG fallback).
- **Hero Staging:**
  - Inspired by the Mona Sans hero composition: deep midnight navy canvas (`#080F24`), enormous pearl HTML `UNSTUCK` lettering (`#F5F7FC`) behind the character, curved horizon lighting, speech bubble greeting (*"Hi, I'm Nori. Let's find your next move."*), and clear CTA controls (*"Try Unstuck"* and *"Explore an example"*).
  - Four-stage entrance sequence:
    1. `0–400ms`: Backdrop lettering mask reveal.
    2. `250–1100ms`: Nori rises 40px, fades in, and scales from 0.94 to 1.
    3. `1000–1600ms`: Gentle welcoming sway settles into neutral.
    4. `1300–1900ms`: Speech bubble and supporting copy reveal.
  - Idle motion: subtle 6-second floating loop (`±5px`) and gentle pointer parallax on desktop (disabled on touch devices and paused when offscreen or in background tabs).
  - Full `prefers-reduced-motion` compliance: all transforms and entrance sequences are disabled, displaying an instant, perfectly composed static hero with complete functionality intact.

---

## 3. Fixture Provenance & Evidence Disclosures

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

## 4. Reliability & Error Resilience History

During real-world end-to-end testing against Google Gemini APIs, several failure modes were observed and engineered for:

| Failure Mode Observed | Root Cause | Implemented Mitigation | Verification Status |
|---|---|---|---|
| **HTTP 429 (Rate Limit Exhaustion)** | Rapid repeated user clicks triggering burst requests to Gemini. | **Session Budget & Rate Pacing:** Web and Desktop enforce a strict 15-request persistent session cap and a 5-second minimum interval between checks. Buttons show active cooldown. | **Verified:** Unit tests `tests/web-server.unit.test.ts` and `tests/budget-tracker.unit.test.ts` pass; live server rejects rapid bursts with friendly HTTP 429 messages. |
| **Client Timeout (Network stalls)** | Indefinite fetch hangs during network latency spikes. | **15-Second AbortSignal:** Model requests enforce a 15-second timeout with friendly retry notices, preserving user session state without losing context. | **Verified:** Unit tests verify timeout rejection handling; client displays retry button without resetting goal. |
| **Malformed Structured JSON** | Multimodal model output returning unescaped Markdown or trailing text outside JSON schema. | **Multi-tier JSON Sanitizer:** Strips triple-backtick markdown fences, balances braces, validates candidate IDs against local OCR sets, and falls back to safe schema defaults if corrupt. | **Verified:** 76 unit tests pass, validating candidate contract and schema boundaries. |
| **Provider Overload (503 / 500)** | Upstream Google AI Studio temporary capacity spikes during peak hours. | **Truthful Status & Graceful Fallback:** Status bar displays `Ready (Key Configured)` rather than falsely claiming guaranteed upstream uptime. Real errors display friendly retry dialogs. | **Verified:** Verified during local testing runs; error state provides clean retry action. |

*Disclaimer: The five selected test screenshots demonstrate successful end-to-end task completion under normal conditions; they do not establish 100% zero-error operation under severe upstream network congestion.*

---

## 5. Judging Criteria Audit

### 1. Code Quality
- **Architecture:** Clean process separation between Electron Main (security, secret management, Win32 window management, native screen capture), Preload (strictly typed context-isolated IPC), and Renderer / Web frontend.
- **Strict Typing:** All TypeScript configurations run under `strict: true`. No untyped `any` leaks in core IPC contracts or model schemas.
- **Build Reproducibility:** Single command `npm run build` compiles TypeScript (`tsc`) and synchronizes static assets via `scripts/copy-web-assets.mjs`.

### 2. Security Boundaries
- **Server-Side Credentials:** `GEMINI_API_KEY` is loaded exclusively into Node / Electron backend processes from `.env`. It is **never** injected into HTML, bundled JavaScript, renderer processes, or git commits.
- **Narrow IPC Surface:** Renderer only accesses sandboxed IPC channels (`onStatusUpdate`, `sendStart`, `sendCheck`, etc.).
- **Untrusted Observations:** Screen text and OCR candidates are treated as untrusted data; never rendered via `innerHTML` or executed as code.
- **Pass-through Overlay:** Electron transparent overlay uses `setIgnoreMouseEvents(true, { forward: true })`, ensuring mouse events pass through directly to native applications.

### 3. Efficiency & Resource Footprint
- **OCR Worker Reuse:** Tesseract OCR worker is initialized once and reused across capture cycles, avoiding memory leaks and spin-up delays.
- **Lightweight Assets:** Total tracked source and assets are **~3.0 MB** (well below the 10 MB competition limit).
  - Typography: Locally hosted *Manrope* and *DM Sans* fonts (< 120 KB total).
  - Nori character: Optimized WebP at 191 KB (78% smaller than original PNG).
- **Zero-Poll Idling:** Animations pause when the tab is hidden or the hero is scrolled out of view.

### 4. Testing
- **Automated Test Results:** **76 passing unit tests** across 22 test suites (`npm test`).
  - Coordinate transformations and 125% DPI scaling math.
  - Candidate ID contract validation.
  - Recovery payload schemas (wrong menu, wrong chart type).
  - Session budget tracker and rate pacing.
  - Web server endpoints (`/api/guidance`, `/api/examples`, `/api/example`).
- **Integration Tests:** Bounded integration test suite available in `tests/integration/` targeting real model responses against clean fixtures.

### 5. Accessibility
- **Keyboard Navigation:** Full tab order across all interactive elements, visible high-contrast focus rings (`outline: 2px solid var(--color-blue-accent)`).
- **Reduced Motion Support:** `@media (prefers-reduced-motion: reduce)` removes all entrance animations, floating loops, and parallax, rendering a clean static layout with zero functionality loss.
- **Color Contrast:** Deep navy background (`#080F24`) paired with pearl white headings (`#F5F7FC`, contrast > 14:1) and secondary slate (`#B7C4D9`, contrast > 7:1) satisfies WCAG AAA standards.

### 6. Problem Alignment
- Built specifically as a **screen-aware desktop software coach**.
- Solves beginner frustration with complex desktop interfaces by observing real UI states and highlighting exactly where to click next.
- Emphasizes user agency and learning: the user performs every action, while Unstuck provides visual guidance, verification, and mistake recovery.

### 7. Google Services Integration
- Employs **Google Gemini Multimodal Vision API** (`gemini-3.1-flash-lite`, configurable to `gemini-3.5-flash-lite` or `gemini-3.8-flash`) for real-time visual reasoning.
- Combines Gemini visual scene interpretation with local OCR candidate validation to eliminate hallucinated coordinates and guarantee grounded highlights.
- Solves model uncertainty honestly: if a button is not visible or occluded, the coach returns an explicit `uncertain` state asking the user to reposition windows rather than guessing.

---

## 6. Render / Railway Deployment Configuration

The web companion is completely containerized and portable for Cloud Run, Render, or Railway:

### Dockerfile
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ dist/
COPY web/ web/
COPY fixtures/ fixtures/
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/server/server.js"]
```

### Environment Variables Required on Render/Railway:
- `PORT`: Set automatically by Render/Railway (default: `8080`).
- `GEMINI_API_KEY`: Google Gemini API key from Google AI Studio.
- `GEMINI_MODEL`: `gemini-3.1-flash-lite` (default).

### Deployment Settings:
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start:web`
- **Health Check Path:** `/healthz`
- **Port:** `8080` (or dynamic `$PORT`)
