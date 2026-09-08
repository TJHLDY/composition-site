const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lookupFailureMarkup } = require('../wordbook.js');

test('lookup failure view contains one actionable error location', () => {
  const markup = lookupFailureMarkup('AI 暂时无法完成查询，请重试。你仍可以手动填写并收录。');
  assert.equal((markup.match(/class="wb-status"/g) || []).length, 1);
  assert.match(markup, /重新查询/);
  assert.match(markup, /手动收录/);
});
