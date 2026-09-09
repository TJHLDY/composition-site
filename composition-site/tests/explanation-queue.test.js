const test = require('node:test');
const assert = require('node:assert/strict');
const { createExplanationQueue } = require('../essay-utils.js');

test('serializes requests, waits after completion, and prioritizes interactive work', async () => {
  const waits = [], calls = [];
  const queue = createExplanationQueue({ pause: ms => new Promise(resolve => waits.push({ms,resolve})) });
  await queue(async () => { calls.push('first'); return 1; });
  const background = queue(async () => calls.push('background'), {background:true});
  const foreground = queue(async () => calls.push('foreground'));
  assert.deepEqual(calls,['first']);
  assert.equal(waits[0].ms,2100);
  waits.shift().resolve(); await foreground;
  assert.deepEqual(calls,['first','foreground']);
  waits.shift().resolve(); await background;
  assert.deepEqual(calls,['first','foreground','background']);
  waits.shift().resolve();
});

test('failed requests release the queue and stale queued work is never sent', async () => {
  const queue=createExplanationQueue({pause:async()=>{}});
  await assert.rejects(queue(async()=>{throw Error('network');}),/network/);
  let sent=false;
  await assert.rejects(queue(async()=>{sent=true;},{isCurrent:()=>false}),{name:'AbortError'});
  assert.equal(sent,false);
  assert.equal(await queue(async()=>42),42);
});
