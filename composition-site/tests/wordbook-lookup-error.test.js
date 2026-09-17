const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lookupFailureMarkup, aiFailureMessage } = require('../wordbook.js');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'wordbook.js'), 'utf8');

test('dictionary outage retains its cause instead of becoming an AI settings error', () => {
  const message = '词典连接暂时失败，请稍后重试。';
  assert.equal(aiFailureMessage({status: 503, message}), message);
  assert.match(aiFailureMessage({status: 428}), /AI 设置/);
  assert.match(aiFailureMessage({status: 429}), /频繁/);
  assert.ok(aiFailureMessage(new Error('Failed to fetch')));
  assert.doesNotMatch(lookupFailureMarkup('<script>alert(1)</script>'), /<script>/);
});

test('lookup failure view contains one actionable error location', () => {
  const markup = lookupFailureMarkup('AI 暂时无法完成查询，请重试。你仍可以手动填写并收录。');
  assert.equal((markup.match(/class="wb-status"/g) || []).length, 1);
  assert.match(markup, /重新查询/);
  assert.match(markup, /手动收录/);
});

test('missing AI configuration emits one retryable guide request without changing ordinary error text', () => {
  assert.match(source, /onRequireAi/);
  assert.match(source, /vocabnote:ai-required/);
  assert.match(source, /resume/);
});
