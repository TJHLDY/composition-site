const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');
const utilities = require('../essay-utils.js');
const read = name => fs.readFileSync(path.join(siteRoot, name), 'utf8');

test('mobile word action prefers an existing explanation and does not request one again', () => {
  assert.equal(typeof utilities.getMobileWordActionState, 'function');
  assert.deepEqual(
    utilities.getMobileWordActionState({ hasSavedNote: true, hasExplanation: true, preloadPaused: false }),
    {
      actionLabel: '编辑摘录',
      helperText: '已加载本篇语境释义。',
      shouldRequestExplanation: false
    }
  );
});

test('mobile word action explains the paused preload state without making a futile request', () => {
  assert.deepEqual(
    utilities.getMobileWordActionState({ hasSavedNote: false, hasExplanation: false, preloadPaused: true }),
    {
      actionLabel: '收录单词',
      helperText: '此词尚未预加载；你仍可手动收录并填写释义。',
      shouldRequestExplanation: false
    }
  );
});

test('incremental essay chunks preserve the original content and never split an English word', () => {
  assert.equal(typeof utilities.splitEssayIntoRenderChunks, 'function');
  const content = 'Opening paragraph. exceptionalWord continues here.\nA second paragraph follows.';
  const chunks = utilities.splitEssayIntoRenderChunks(content, 28);
  assert.equal(chunks.map(chunk => chunk.text).join(''), content);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks[0].start, 0);
  assert.deepEqual(chunks.at(-1).end, content.length);
  assert.ok(chunks.every((chunk, index) => index === 0 || chunks[index - 1].end === chunk.start));
  assert.ok(chunks.slice(0, -1).every(chunk => !(/[A-Za-z'’-]/.test(content[chunk.end - 1]) && /[A-Za-z'’-]/.test(content[chunk.end]))));
});

test('mobile markup provides a compact word card and a dedicated account menu', () => {
  const html = read('index.html');
  assert.match(html, /id="mobile-word-action"[^>]*role="dialog"/);
  assert.match(html, /id="mobile-word-record"/);
  assert.match(html, /id="mobile-menu-button"/);
  assert.match(html, /id="mobile-menu-dialog"/);
  assert.match(html, /id="notes-toggle-button"/);
});

test('mobile styles reserve large touch targets and stack the verification-code controls on narrow displays', () => {
  const styles = read('styles.css');
  const wordbookStyles = read('wordbook.css');
  assert.match(styles, /\.mobile-word-action\s*\{/);
  assert.match(styles, /\.mobile-menu-button\s*\{/);
  assert.match(styles, /\.notes-section\.is-collapsed\s+\.notes-groups/);
  assert.match(styles, /\.auth-submit\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /@media\s*\(max-width:\s*390px\)[\s\S]*\.auth-code-row\s*\{[\s\S]*grid-template-columns:\s*1fr/s);
  assert.match(wordbookStyles, /@media\s*\(max-width:\s*720px\)[\s\S]*\.wb-search\s*\{[\s\S]*position:\s*sticky/s);
  assert.match(wordbookStyles, /@media\s*\(max-width:\s*480px\)\s*\{\s*\.site-nav button span\s*\{\s*display:\s*none/s);
});

test('mobile onboarding uses one safe-area-aware spotlight layer with five visible milestones', () => {
  const onboarding = read('onboarding.js');
  const onboardingStyles = read('onboarding.css');
  const html = read('index.html');

  assert.match(onboarding, /id="onboarding-layer"/);
  assert.match(onboarding, /data-onboarding-action="skip"/);
  assert.equal((onboarding.match(/data-onboarding-progress/g) || []).length, 5);
  assert.match(onboarding, /onboarding-target-ring/);
  assert.match(onboarding, /blockOutsideGuide/);
  assert.match(onboarding, /document\.addEventListener\('click', blockOutsideGuide, true\)/);
  assert.match(onboardingStyles, /bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(onboardingStyles, /z-index:\s*(?:[4-9]\d|[1-9]\d{2,})/);
  assert.match(onboardingStyles, /min-width:\s*44px/);
  assert.match(onboardingStyles, /min-height:\s*44px/);
  assert.match(html, /id="mobile-learning-guide-button"/);
  assert.match(html, /id="mobile-ai-guide-button"/);
  assert.match(html, /id="learning-guide-button"/);
});
