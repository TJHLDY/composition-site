const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientPath = path.resolve(__dirname, '..', 'api-client.js');

assert.equal(fs.existsSync(clientPath), true, 'The authenticated API client must exist.');

const { ApiError, SESSION_TOKEN_KEY, createApiClient } = require(clientPath);

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === undefined ? '' : JSON.stringify(body)
  };
}

const calls = [];
const replies = [
  response(201, { token: 'opaque-token', user: { id: 7, email: 'reader@example.com', displayName: 'Reader' } }),
  response(201, { id: 9, title: 'A title', sourceLabel: null, content: 'An essay.', contentVersion: 1, annotations: [] }),
  response(200, { selectedText: 'essay', kind: 'word', translationZh: '文章', memoryHint: 'essay writing', contentVersion: 1 }),
  response(200, { selectedText: 'make meaningful progress', kind: 'phrase', translationZh: '取得有意义的进步', memoryHint: null, contentVersion: 1 }),
  response(201, { id: 11, selectedText: 'make meaningful progress', kind: 'phrase', translationZh: '取得有意义的进步', note: '短语笔记', contentVersion: 1 }),
  response(204)
];
const storage = memoryStorage();
const api = createApiClient({
  storage,
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return replies.shift();
  }
});

(async () => {
  const result = await api.register({ email: 'reader@example.com', password: 'StrongPass123', displayName: 'Reader' });
  assert.equal(result.user.email, 'reader@example.com');
  assert.equal(storage.getItem(SESSION_TOKEN_KEY), 'opaque-token');
  assert.equal(calls[0].url, '/api/auth/register');
  assert.equal(calls[0].options.headers.Authorization, undefined);

  await api.createComposition({ title: 'A title', sourceLabel: null, content: 'An essay.' });
  assert.equal(calls[1].url, '/api/compositions');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer opaque-token');

  const explanation = await api.explainSelection(9, { startOffset: 3, endOffset: 8, kind: 'word', contentVersion: 1 });
  assert.equal(explanation.translationZh, '文章');
  assert.equal(calls[2].url, '/api/compositions/9/explanations');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer opaque-token');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    startOffset: 3,
    endOffset: 8,
    kind: 'word',
    contentVersion: 1
  }, 'Basic word explanations must not opt into collocation recognition.');

  const phraseExplanation = await api.explainSelection(9, {
    startOffset: 0,
    endOffset: 24,
    kind: 'phrase',
    contentVersion: 1
  });
  assert.equal(phraseExplanation.translationZh, '取得有意义的进步');
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    startOffset: 0,
    endOffset: 24,
    kind: 'phrase',
    contentVersion: 1
  }, 'Phrase recording must request ordinary context translation without a collocation flag.');

  const savedAnnotation = await api.saveAnnotation(9, {
    startOffset: 0,
    endOffset: 24,
    kind: 'phrase',
    translationZh: '取得有意义的进步',
    note: '短语笔记',
    contentVersion: 1
  });
  assert.equal(savedAnnotation.selectedText, 'make meaningful progress');
  const savePayload = JSON.parse(calls[4].options.body);
  assert.equal('learningText' in savePayload, false, 'New phrase recording must save the selected source phrase, not a separately generated collocation.');
  assert.equal('selectedText' in savePayload, false, 'The browser must not submit raw source text because the server derives it from offsets.');

  await api.logout();
  assert.equal(calls[5].options.headers.Authorization, 'Bearer opaque-token');
  assert.equal(storage.getItem(SESSION_TOKEN_KEY), null);

  const failedApi = createApiClient({
    storage: memoryStorage(),
    fetchImpl: async () => response(401, { message: '登录已失效' })
  });
  await assert.rejects(
    () => failedApi.listCompositions(),
    (error) => error instanceof ApiError && error.status === 401
  );
  console.log('Authenticated composition API client passed.');
})();
