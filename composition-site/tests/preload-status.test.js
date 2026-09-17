const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preloadStatusText, preloadNeedsAiSetup } = require('../essay-utils.js');
test('preload communicates progress, completion and retained results on failure', () => {
  assert.match(preloadStatusText({status:'running',done:12,total:24}), /正在预加载.*12 \/ 24/);
  assert.match(preloadStatusText({status:'complete',done:24,total:24}), /释义已就绪/);
  assert.match(preloadStatusText({status:'paused',done:12,total:24,message:'请检查 AI 连接'}), /已暂停.*12 \/ 24.*请检查 AI 连接/);
  assert.match(preloadStatusText({status:'retrying',done:12,total:24}), /自动重试/);
  assert.match(preloadStatusText({status:'complete',done:0,total:0}), /没有需要预加载/);
});

test('only an explicit missing-configuration flag requests AI setup', () => {
  assert.equal(preloadNeedsAiSetup({ status: 'paused', configurationRequired: true }), true);
  assert.equal(preloadNeedsAiSetup({ status: 'paused', configurationRequired: false }), false);
  assert.equal(preloadNeedsAiSetup({ status: 'retrying', configurationRequired: true }), false);
});
