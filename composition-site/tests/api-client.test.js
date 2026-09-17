const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientPath = path.resolve(__dirname, '..', 'api-client.js');

assert.equal(fs.existsSync(clientPath), true, 'The authenticated API client must exist.');

const { ApiError, SESSION_TOKEN_KEY, REMEMBERED_TOKEN_KEY, REMEMBERED_EMAIL_KEY, createApiClient } = require(clientPath);

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
  response(204),
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
  const result = await api.register({
    email: 'reader@example.com',
    password: 'StrongPass123',
    displayName: 'Reader',
    code: '246810'
  });
  assert.equal(result.user.email, 'reader@example.com');
  assert.equal(storage.getItem(SESSION_TOKEN_KEY), 'opaque-token');
  assert.equal(calls[0].url, '/api/auth/register');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].options.body).code, '246810', '注册必须携带邮箱验证码。');

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

  await api.deleteComposition(9);
  assert.equal(calls[5].url, '/api/compositions/9');
  assert.equal(calls[5].options.method, 'DELETE');
  assert.equal(calls[5].options.headers.Authorization, 'Bearer opaque-token');

  await api.logout();
  assert.equal(calls[6].options.headers.Authorization, 'Bearer opaque-token');
  assert.equal(storage.getItem(SESSION_TOKEN_KEY), null);

  const failedApi = createApiClient({
    storage: memoryStorage(),
    fetchImpl: async () => response(401, { message: '登录已失效' })
  });
  await assert.rejects(
    () => failedApi.listCompositions(),
    (error) => error instanceof ApiError && error.status === 401
  );

  // 记住我：勾选后令牌与邮箱保留在本设备，密码绝不落盘。
  const persistent = memoryStorage();
  const rememberedApi = createApiClient({
    storage: memoryStorage(),
    persistentStorage: persistent,
    fetchImpl: async () => response(200, { token: 'remember-token', user: { id: 3, email: 'keeper@example.com', displayName: 'Keeper' } })
  });
  await rememberedApi.login({ email: 'keeper@example.com', password: 'StrongPass123' }, { remember: true });
  assert.equal(persistent.getItem(REMEMBERED_EMAIL_KEY), 'keeper@example.com', '勾选记住我时应一并记住邮箱。');
  const rememberedEntry = JSON.parse(persistent.getItem(REMEMBERED_TOKEN_KEY));
  assert.equal(rememberedEntry.token, 'remember-token');
  assert.ok(rememberedEntry.expiresAt > Date.now(), '记住的令牌必须带未来的过期时间。');
  assert.ok(
    rememberedEntry.expiresAt - Date.now() <= 7 * 24 * 60 * 60 * 1000 + 1000,
    '记住时长不得超过七天。'
  );
  await rememberedApi.logout();
  assert.equal(persistent.getItem(REMEMBERED_TOKEN_KEY), null, '退出登录必须清除记住的令牌。');

  // 七天内重新打开：会话存储为空时从记住条目自动恢复。
  const reopenedStorage = memoryStorage();
  const reopenedPersistent = memoryStorage();
  reopenedPersistent.setItem(REMEMBERED_TOKEN_KEY, JSON.stringify({ token: 'still-valid', expiresAt: Date.now() + 60_000 }));
  const reopenedApi = createApiClient({
    storage: reopenedStorage,
    persistentStorage: reopenedPersistent,
    fetchImpl: async () => response(200, [])
  });
  assert.equal(reopenedApi.getToken(), 'still-valid', '未过期的记住令牌应当自动恢复会话。');
  assert.equal(reopenedStorage.getItem(SESSION_TOKEN_KEY), 'still-valid');
  assert.equal(reopenedApi.getRememberedEmail(), '', '未记住邮箱时返回空字符串。');

  // 超过七天的记住条目必须被丢弃并清除。
  const expiredPersistent = memoryStorage();
  expiredPersistent.setItem(REMEMBERED_TOKEN_KEY, JSON.stringify({ token: 'gone-token', expiresAt: Date.now() - 1000 }));
  const expiredApi = createApiClient({
    storage: memoryStorage(),
    persistentStorage: expiredPersistent,
    fetchImpl: async () => response(200, [])
  });
  assert.equal(expiredApi.getToken(), null, '超过七天的记住令牌不得再使用。');
  assert.equal(expiredPersistent.getItem(REMEMBERED_TOKEN_KEY), null, '过期的记住条目应当被清除。');

  // 取消勾选后再次登录：旧的令牌与邮箱都要清掉。
  const forgetfulPersistent = memoryStorage();
  forgetfulPersistent.setItem(REMEMBERED_TOKEN_KEY, JSON.stringify({ token: 'old-token', expiresAt: Date.now() + 60_000 }));
  forgetfulPersistent.setItem(REMEMBERED_EMAIL_KEY, 'old@example.com');
  const forgetfulApi = createApiClient({
    storage: memoryStorage(),
    persistentStorage: forgetfulPersistent,
    fetchImpl: async () => response(200, { token: 'fresh-token', user: { id: 4, email: 'old@example.com', displayName: 'Old' } })
  });
  await forgetfulApi.login({ email: 'old@example.com', password: 'StrongPass123' });
  assert.equal(forgetfulPersistent.getItem(REMEMBERED_TOKEN_KEY), null, '未勾选记住我时不得保留旧令牌。');
  assert.equal(forgetfulPersistent.getItem(REMEMBERED_EMAIL_KEY), null, '未勾选记住我时也不得保留旧邮箱。');

  // 验证码三个接口都不依赖登录态,重置成功只返回 204。
  const codeCalls = [];
  const codeReplies = [response(204), response(204), response(204)];
  const codeApi = createApiClient({
    storage: memoryStorage(),
    fetchImpl: async (url, options) => {
      codeCalls.push({ url, options });
      return codeReplies.shift();
    }
  });
  await codeApi.sendRegisterCode({ email: 'new@example.com' });
  await codeApi.sendResetCode({ email: 'reader@example.com' });
  await codeApi.resetPassword({ email: 'reader@example.com', code: '123456', newPassword: 'FreshPass456' });
  assert.equal(codeCalls[0].url, '/api/auth/register/send-code');
  assert.equal(codeCalls[1].url, '/api/auth/forgot-password/send-code');
  assert.equal(codeCalls[2].url, '/api/auth/forgot-password/reset');
  codeCalls.forEach((call) => {
    assert.equal(call.options.headers.Authorization, undefined, '验证码接口不得携带登录令牌。');
  });
  assert.deepEqual(JSON.parse(codeCalls[2].options.body), {
    email: 'reader@example.com',
    code: '123456',
    newPassword: 'FreshPass456'
  }, '重置密码只提交邮箱、验证码和新密码。');

  const onboardingCalls = [];
  const onboardingReplies = [
    response(200, { tutorialVersion: 1, coreStatus: 'not_started', autoStart: true }),
    response(200, { tutorialVersion: 1, coreStatus: 'in_progress', autoStart: true }),
    response(200, { tutorialVersion: 1, coreStatus: 'in_progress', autoStart: true, tutorialWordbookId: 12 }),
    response(200, { tutorialVersion: 1, coreStatus: 'in_progress', autoStart: true, tutorialCompositionId: 34 }),
    response(200, { tutorialVersion: 1, coreStatus: 'completed', autoStart: false }),
    response(200, { tutorialVersion: 1, coreStatus: 'skipped', autoStart: false }),
    response(200, { show: true })
  ];
  const onboardingStorage = memoryStorage();
  onboardingStorage.setItem(SESSION_TOKEN_KEY, 'onboarding-token');
  const onboardingApi = createApiClient({
    storage: onboardingStorage,
    fetchImpl: async (url, options) => {
      onboardingCalls.push({ url, options });
      return onboardingReplies.shift();
    }
  });
  assert.equal((await onboardingApi.getOnboarding()).coreStatus, 'not_started');
  await onboardingApi.startOnboarding();
  await onboardingApi.recordOnboardingWordbook(12);
  await onboardingApi.recordOnboardingComposition(34);
  await onboardingApi.completeOnboarding(56);
  await onboardingApi.skipOnboarding();
  assert.equal((await onboardingApi.claimAiGuide()).show, true);
  assert.deepEqual(onboardingCalls.map(call => call.url), [
    '/api/onboarding',
    '/api/onboarding/core/start',
    '/api/onboarding/core/wordbook/12',
    '/api/onboarding/core/composition/34',
    '/api/onboarding/core/complete',
    '/api/onboarding/core/skip',
    '/api/onboarding/ai-guide/claim'
  ]);
  assert.equal(onboardingCalls[0].options.method, 'GET');
  assert.equal(onboardingCalls[1].options.method, 'POST');
  assert.equal(onboardingCalls[2].options.body, undefined);
  assert.deepEqual(JSON.parse(onboardingCalls[4].options.body), { annotationId: 56 });
  onboardingCalls.forEach(call => {
    assert.equal(call.options.headers.Authorization, 'Bearer onboarding-token');
  });

  console.log('Authenticated composition API client passed.');
})();
