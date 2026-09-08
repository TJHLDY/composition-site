const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '..', 'wordbook.js');
const wb = fs.existsSync(modulePath) ? require(modulePath) : {};
const { createApiClient, SESSION_TOKEN_KEY } = require('../api-client.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(api) {
  assert.equal(typeof wb.createSearchController, 'function', 'Wordbook search controller must exist');
  const events = [];
  let scheduled;
  const search = wb.createSearchController({
    api, onList: data => events.push(['list', data]),
    onResult: data => events.push(['result', data]),
    onError: error => events.push(['error', error.message]),
    onBusy: busy => events.push(['busy', busy]),
    schedule: fn => { scheduled = fn; return 1; }, cancelSchedule: () => { scheduled = null; }
  });
  return { search, events, tick: () => scheduled?.() };
}

test('typing debounces only personal GET; IME Enter does nothing', async () => {
  const calls = [];
  const h = harness({ listWordbook: async q => { calls.push(q); return { items: [] }; }, lookupWordbook: () => assert.fail('Typing must never use AI') });
  h.search.input('a', 'word');
  h.search.input('ab', 'word');
  assert.equal(calls.length, 0);
  await h.tick();
  assert.deepEqual(calls, [{ kind: 'word', q: 'ab', page: 0, size: 60 }]);
  await h.search.submit('中文', { isComposing: true });
  await h.search.submit('中文', { keyCode: 229 });
  assert.equal(calls.length, 1);
});

test('Enter resolves an exact personal phrase across types before considering AI', async () => {
  const h = harness({
    listWordbook: async query => { assert.deepEqual(query, { exact: 'take care', page: 0, size: 60 }); return { items: [{ id: 7, kind: 'phrase' }] }; },
    lookupWordbook: () => assert.fail('Existing entries must not query AI')
  });
  await h.search.submit(' take care ');
  assert.deepEqual(h.events.find(e => e[0] === 'result')[1], { entry: { id: 7, kind: 'phrase' } });
});

test('unknown lookup yields an unsaved preview and never creates an entry', async () => {
  const calls = [];
  const h = harness({
    listWordbook: async () => { calls.push('personal'); return { items: [] }; },
    lookupWordbook: async body => { calls.push(body.query); return { term: 'serendipity', translationZh: '意外的美好发现' }; },
    createWordbook: () => assert.fail('Lookup must require explicit add')
  });
  await h.search.submit('意外的美好发现');
  assert.deepEqual(calls, ['personal', '意外的美好发现']);
  assert.equal(h.events.find(e => e[0] === 'result')[1].preview.term, 'serendipity');
});

test('typing a new query suppresses the earlier response before debounce fires', async () => {
  const pending = deferred();
  const h = harness({ listWordbook: () => pending.promise });
  h.search.input('old', 'word');
  const running = h.tick();
  h.search.input('new', 'word');
  pending.resolve({ items: [{ term: 'old' }] });
  await running;
  assert.equal(h.events.some(e => e[0] === 'list'), false);
});

test('navigation/logout cancellation suppresses late AI results and late errors', async () => {
  const pending = deferred();
  const h = harness({ listWordbook: async () => ({ items: [] }), lookupWordbook: () => pending.promise });
  const running = h.search.submit('old');
  await Promise.resolve();
  h.search.cancel();
  pending.resolve({ term: 'old' });
  await running;
  assert.equal(h.events.some(e => e[0] === 'result'), false);
  const rejected = deferred();
  const other = harness({ listWordbook: () => rejected.promise });
  const failing = other.search.submit('old');
  other.search.cancel();
  rejected.reject(new Error('expired previous session'));
  await failing;
  assert.equal(other.events.some(e => e[0] === 'error'), false);
});

test('request scopes invalidate every outstanding lane on reset and only superseded lane otherwise', () => {
  assert.equal(typeof wb.createRequestScope, 'function');
  const scope = wb.createRequestScope();
  const first = scope.start('detail');
  const other = scope.start('list');
  const second = scope.start('detail');
  assert.equal(first(), false);
  assert.equal(other(), true);
  assert.equal(second(), true);
  scope.reset();
  assert.equal(second(), false);
  assert.equal(other(), false);
});

test('wordbook API uses authenticated contract URLs, verbs and bodies', async () => {
  const calls = [];
  const store = new Map([[SESSION_TOKEN_KEY, 'test-token']]);
  const api = createApiClient({ storage: { getItem: k => store.get(k), removeItem: k => store.delete(k) }, persistentStorage: {},
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); return { ok: true, text: async () => '{}' }; } });
  assert.equal(typeof api.listWordbook, 'function');
  await api.listWordbook({ exact: 'it’s & ours', kind: 'word' });
  const query = new URL(calls[0].url, 'https://test.local').searchParams;
  assert.equal(query.get('exact'), 'it’s & ours');
  assert.equal(query.has('kind'), false);
  const payload = { term: 'take care', translationZh: '保重', note: 'personal' };
  await api.createWordbook(payload);
  await api.readWordbook(9);
  await api.updateWordbook(9, payload);
  await api.deleteWordbook(9);
  await api.lookupWordbook({ query: 'care' });
  await api.lookupWordbookCollocations({ query: 'care' });
  await api.generateWordbookSentence({ term: 'take care', translationZh: '保重' });
  await api.saveWordbookExample(9, { english: 'Take care.', translationZh: '保重。', usage: '' });
  await api.deleteWordbookExample(9, 3);
  assert.deepEqual(calls.slice(1).map(c => [c.url, c.method]), [
    ['/api/wordbook', 'POST'], ['/api/wordbook/9', 'GET'], ['/api/wordbook/9', 'PUT'], ['/api/wordbook/9', 'DELETE'],
    ['/api/wordbook/define', 'POST'], ['/api/wordbook/lookup', 'POST'], ['/api/wordbook/sentence', 'POST'], ['/api/wordbook/9/examples', 'POST'], ['/api/wordbook/9/examples/3', 'DELETE']
  ]);
  assert.deepEqual(JSON.parse(calls[1].body), payload);
  assert.ok(calls.every(c => c.headers.Authorization === 'Bearer test-token'));
});
