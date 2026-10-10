import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Pastel UI Redesign - Tokens, Assets & Layout Contracts', () => {
  const root = process.cwd();
  const tokensPath = path.resolve(root, 'electron', 'tokens.css');
  const launchHtmlPath = path.resolve(root, 'electron', 'launch.html');
  const launchCssPath = path.resolve(root, 'electron', 'launch.css');
  const coachHtmlPath = path.resolve(root, 'electron', 'coach.html');
  const coachCssPath = path.resolve(root, 'electron', 'coach.css');
  const noriAssetPath = path.resolve(root, 'electron', 'assets', 'nori.png');

  it('verifies all approved pastel colour and radius tokens exist in tokens.css', () => {
    assert.equal(fs.existsSync(tokensPath), true, 'tokens.css must exist');
    const css = fs.readFileSync(tokensPath, 'utf-8');

    // Color tokens
    assert.match(css, /--color-bg:\s*#FAF6EF/i, 'warm ivory application background token #FAF6EF');
    assert.match(css, /--color-surface:\s*#FFFCF7/i, 'warm-white surface token #FFFCF7');
    assert.match(css, /--color-lavender:\s*#DDD3FA/i, 'lavender mascot panel token #DDD3FA');
    assert.match(css, /--color-ink:\s*#24112F/i, 'deep plum text token #24112F');
    assert.match(css, /--color-ink-secondary:\s*#776980/i, 'secondary text token #776980');
    assert.match(css, /--color-coral:\s*#FF795F/i, 'coral primary action token #FF795F');
    assert.match(css, /--color-yellow:\s*#FFC443/i, 'yellow accent token #FFC443');

    // Radius tokens (32-40px for major panels, 18-24px for inputs, capsule for buttons)
    assert.match(css, /--radius-panel:\s*3[2-9]px|--radius-panel:\s*40px/i, 'panel radius in 32-40px range');
    assert.match(css, /--radius-input:\s*(1[89]|2[0-4])px/i, 'input radius in 18-24px range');
    assert.match(css, /--radius-pill:\s*9999px/i, 'capsule pill radius 9999px');
  });

  it('verifies the approved Nori asset exists with intact binary PNG signature', () => {
    assert.equal(fs.existsSync(noriAssetPath), true, 'approved Nori asset must exist in electron/assets/nori.png');
    const buf = fs.readFileSync(noriAssetPath);
    // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4E);
    assert.equal(buf[3], 0x47);
    assert.ok(buf.length > 50000, 'Nori asset must be high-resolution artwork');
  });

  it('verifies Welcome screen matches approved reference composition without dead buttons', () => {
    const html = fs.readFileSync(launchHtmlPath, 'utf-8');

    // Headline and copy
    assert.match(html, /Less stuck\./i, 'Headline Less stuck');
    assert.match(html, /More doing\./i, 'Headline More doing');
    assert.match(html, /Your screen\.\s*Your next step\./i, 'Supporting text');
    assert.match(html, /What are we working on\?/i, 'Goal field label');
    assert.match(html, /Describe what you want to do\.\.\./i, 'Goal placeholder');

    // Nori elements
    assert.match(html, /MEET NORI/i, 'Meet Nori badge');
    assert.match(html, /Let's<br>do this\./i, 'Speech bubble text');
    assert.match(html, /assets\/nori\.png/i, 'Nori asset reference');

    // Application selection
    assert.match(html, /Choose an application/i, 'Application selection section');
    assert.match(html, /id="app-selector"/i, 'Interactive application selector');
    assert.match(html, /id="target-title"/i, 'Target title element');

    // Primary action & disclosure
    assert.match(html, /Start with Nori/i, 'Coral action button text');
    assert.match(html, /Screenshots are shared only on Start or Check\./i, 'Transparent disclosure');

    // Exclusion checks
    assert.doesNotMatch(html, /tutorial-url/i, 'URL field must NOT be present on welcome screen');
    assert.doesNotMatch(html, />History</i, 'History button must be omitted when session persistence is absent');
  });

  it('verifies Coach screen has compact pastel layout, mini Nori avatar, and prominent guidance', () => {
    const html = fs.readFileSync(coachHtmlPath, 'utf-8');

    assert.match(html, /assets\/nori\.png/i, 'Mini Nori avatar in coach header');
    assert.match(html, /Unstuck Coach/i, 'Coach header title');
    assert.match(html, /id="status-badge"/i, 'Status badge element');
    assert.match(html, /id="goal-label"/i, 'Goal label element');
    assert.match(html, /id="instruction-text"/i, 'Dominant instruction text element');
    assert.match(html, /id="recovery-box"/i, 'Correction/recovery box');
    assert.match(html, /What I noticed/i, 'Observation section');
    assert.match(html, /Reading your screen…/i, 'Analysing indicator');
    assert.match(html, /Check my progress/i, 'Check progress button');
    assert.match(html, /id="btn-pause"/i, 'Pause button');
    assert.match(html, /id="btn-stop"/i, 'Stop button');
    assert.match(html, /id="budget-chip"/i, 'Budget telemetry chip');
  });

  it('verifies CSS files include prefers-reduced-motion accessibility fallbacks', () => {
    const launchCss = fs.readFileSync(launchCssPath, 'utf-8');
    const coachCss = fs.readFileSync(coachCssPath, 'utf-8');

    assert.match(launchCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'launch.css has reduced-motion rule');
    assert.match(coachCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'coach.css has reduced-motion rule');
  });
});
