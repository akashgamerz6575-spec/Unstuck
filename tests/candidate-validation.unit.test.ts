/**
 * [AUTOMATED UNIT TEST SUITE]
 * Unit tests for Candidate ID Validation, Target Scoping & Unchanged Screen Handling
 * 
 * Verifies:
 * 1. Selected candidate ID exists in the capture's OCR candidate set.
 * 2. Non-existent candidate IDs are rejected by the contract validator.
 * 3. Highlights are strictly suppressed on 'uncertain' and 'complete' statuses.
 * 4. Window scoping filters out candidates outside the active Calc window.
 * 5. LibreOffice Calc window title and process identification logic.
 * 
 * NOTE: These tests do NOT require captures/calc-test.png.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateModelResponse } from '../shared/contracts.js';
import { isCalcWindow, isBoxWithinWindow, WindowBounds } from '../electron/window-scoping.js';

describe('AI Coaching Loop - Candidate ID Contract Validation', () => {
  const availableCandidates = new Set(['c_1', 'c_2', 'c_3', 'c_4']);

  it('accepts valid response with an existing candidate ID', () => {
    const raw = {
      assessment: 'expected',
      status: 'guide',
      observation: 'Cells A1:B5 are highlighted',
      instruction: 'Click the Insert menu',
      selectedCandidateId: 'c_2',
      expectedOutcome: 'Insert menu opens'
    };

    const res = validateModelResponse(raw, availableCandidates);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.selectedCandidateId, 'c_2');
      assert.equal(res.guidance.hasTargetHighlight, true);
    }
  });

  it('rejects candidate ID that does not exist in the capture candidate list', () => {
    const raw = {
      assessment: 'expected',
      status: 'guide',
      observation: 'Cells A1:B5 are highlighted',
      instruction: 'Click Insert',
      selectedCandidateId: 'c_999', // Hallucinated / missing candidate
      expectedOutcome: 'Insert menu opens'
    };

    const res = validateModelResponse(raw, availableCandidates);
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.match(res.errors[0], /does not exist in the OCR candidate list/i);
    }
  });

  it('accepts null candidate ID for text-only guidance', () => {
    const raw = {
      assessment: 'not_started',
      status: 'guide',
      observation: 'No cells selected',
      instruction: 'Drag your mouse from cell A1 to B5 to select the table data',
      selectedCandidateId: null,
      expectedOutcome: 'Range A1:B5 highlighted'
    };

    const res = validateModelResponse(raw, availableCandidates);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.selectedCandidateId, null);
      assert.equal(res.guidance.hasTargetHighlight, false);
    }
  });

  it('suppresses candidate highlight strictly when status is uncertain', () => {
    const raw = {
      assessment: 'uncertain',
      status: 'uncertain',
      observation: 'Screen is partially obscured',
      instruction: 'Move foreground window to make Calc visible',
      selectedCandidateId: 'c_1', // Model tried to pick a candidate
      expectedOutcome: 'Calc visible'
    };

    const res = validateModelResponse(raw, availableCandidates);
    assert.equal(res.valid, true);
    if (res.valid) {
      // Must be stripped to null on uncertain
      assert.equal(res.guidance.selectedCandidateId, null);
      assert.equal(res.guidance.hasTargetHighlight, false);
    }
  });

  it('suppresses candidate highlight strictly when status is complete', () => {
    const raw = {
      assessment: 'expected',
      status: 'complete',
      observation: 'Bar chart titled Requests by department is visible',
      instruction: 'Great job! Your chart is complete.',
      selectedCandidateId: 'c_3',
      expectedOutcome: 'Finished task'
    };

    const res = validateModelResponse(raw, availableCandidates);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.selectedCandidateId, null);
      assert.equal(res.guidance.hasTargetHighlight, false);
    }
  });
});

describe('Target Scoping - Calc Window Identity & Geometry Filter', () => {
  it('correctly identifies LibreOffice Calc process and titles', () => {
    assert.equal(isCalcWindow('soffice.bin', 'Untitled 1 - LibreOffice Calc'), true);
    assert.equal(isCalcWindow('soffice', 'Requests.ods - LibreOffice Calc'), true);
    assert.equal(isCalcWindow('soffice.bin', 'Chart Wizard'), true);
    assert.equal(isCalcWindow('soffice.bin', 'Insert Chart'), true);
    assert.equal(isCalcWindow('code', 'Visual Studio Code'), false);
    assert.equal(isCalcWindow('chrome', 'Google Chrome'), false);
    assert.equal(isCalcWindow('explorer', 'File Explorer'), false);
  });

  it('correctly verifies if bounding boxes lie inside window bounds', () => {
    const windowBounds: WindowBounds = {
      left: 100,
      top: 50,
      right: 1500,
      bottom: 900,
      width: 1400,
      height: 850
    };

    // Candidate at x: 200, y: 100 (in 125% physical px: x: 250, y: 125)
    const insideBox = { x: 250, y: 125, width: 50, height: 20 };
    assert.equal(isBoxWithinWindow(insideBox, windowBounds, 1.25), true);

    // Candidate outside window to the right (x: 1800 logical => 2250 physical px)
    const outsideBox = { x: 2250, y: 200, width: 100, height: 20 };
    assert.equal(isBoxWithinWindow(outsideBox, windowBounds, 1.25, 50), false);
  });
});
