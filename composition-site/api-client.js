(function exposeCompositionApiClient(root, factory) {
  const apiClient = factory();
  if (typeof module === 'object' && module.exports) module.exports = apiClient;
  if (root) root.CompositionApiClient = apiClient;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCompositionApiClientModule() {
  const SESSION_TOKEN_KEY = 'fanwenjia:session-token:v1';
  const REMEMBERED_TOKEN_KEY = 'fanwenjia:remembered-token:v1';
  const REMEMBERED_EMAIL_KEY = 'fanwenjia:remembered-email:v1';
  const REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  function createApiClient(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const storage = options.storage || globalThis.sessionStorage;
    const persistentStorage = options.persistentStorage || globalThis.localStorage;
    if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求。');
    if (!storage) throw new Error('当前环境不支持会话存储。');

    function readRememberedToken() {
      if (!persistentStorage) return null;
      try {
        const raw = persistentStorage.getItem(REMEMBERED_TOKEN_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        const token = entry && typeof entry.token === 'string' ? entry.token : '';
        const expiresAt = Number(entry && entry.expiresAt);
        if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          clearRememberedToken();
          return null;
        }
        return { token, expiresAt };
      } catch (error) {
        clearRememberedToken();
        return null;
      }
    }

    function clearRememberedToken() {
      if (!persistentStorage) return;
      try {
        persistentStorage.removeItem(REMEMBERED_TOKEN_KEY);
      } catch (error) {
        // 持久存储不可用时（例如隐私模式）直接放弃记住功能。
      }
    }

    function clearRememberedEmail() {
      if (!persistentStorage) return;
      try {
        persistentStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch (error) {
        // 同上：存储不可用时不阻塞登录流程。
      }
    }

    function saveRemembered(token, email) {
      if (!persistentStorage) return;
      try {
        persistentStorage.setItem(
          REMEMBERED_TOKEN_KEY,
          JSON.stringify({ token, expiresAt: Date.now() + REMEMBER_MS })
        );
        if (email) persistentStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } catch (error) {
        // 存储失败时退回纯会话模式。
      }
    }

    function getToken() {
      const sessionToken = storage.getItem(SESSION_TOKEN_KEY);
      if (sessionToken) return sessionToken;
      const remembered = readRememberedToken();
      if (!remembered) return null;
      try {
        storage.setItem(SESSION_TOKEN_KEY, remembered.token);
      } catch (error) {
        // 会话存储写入失败时仍返回令牌供本次请求使用。
      }
      return remembered.token;
    }

    function getRememberedEmail() {
      if (!persistentStorage) return '';
      try {
        return String(persistentStorage.getItem(REMEMBERED_EMAIL_KEY) || '');
      } catch (error) {
        return '';
      }
    }

    function clearToken() {
      storage.removeItem(SESSION_TOKEN_KEY);
      clearRememberedToken();
    }

    function saveToken(token, sessionOptions = {}) {
      if (!token || typeof token !== 'string') throw new Error('服务未返回有效登录凭据。');
      storage.setItem(SESSION_TOKEN_KEY, token);
      if (sessionOptions.remember) {
        saveRemembered(token, sessionOptions.email || null);
      } else {
        clearRememberedToken();
        clearRememberedEmail();
      }
    }

    async function request(path, requestOptions = {}) {
      const {
        method = 'GET',
        body,
        requiresAuth = true,
        timeoutMs
      } = requestOptions;
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const token = getToken();
      if (requiresAuth && token) headers.Authorization = `Bearer ${token}`;

      const controller = timeoutMs ? new AbortController() : null;
      let timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(() => {
          controller.abort();
        }, Math.max(1, Number(timeoutMs)));
      }

      let response;
      try {
        response = await fetchImpl(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller ? controller.signal : undefined
        });
      } catch (error) {
        if (controller) clearTimeout(timeoutId);
        if (error && (error.name === 'AbortError')) {
          throw new ApiError(0, '请求超时，请稍后再试。');
        }
        throw new ApiError(0, '无法连接独立服务，请确认已从 8088 端口打开网站。');
      }
      if (controller) clearTimeout(timeoutId);

      const rawBody = await response.text();
      let payload = null;
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody);
        } catch (error) {
          payload = null;
        }
      }
      if (!response.ok) {
        if (response.status === 401) clearToken();
        const message = payload && (payload.detail || payload.message || payload.error);
        throw new ApiError(response.status, message || '请求没有完成，请稍后再试。');
      }
      return payload;
    }

    async function establishSession(path, payload, sessionOptions = {}) {
      const result = await request(path, { method: 'POST', body: payload, requiresAuth: false });
      saveToken(result && result.token, {
        remember: Boolean(sessionOptions.remember),
        email: payload && payload.email
      });
      return result;
    }

    return {
      getToken,
      clearToken,
      getRememberedEmail,
      register: (payload, sessionOptions) => establishSession('/api/auth/register', payload, sessionOptions),
      login: (payload, sessionOptions) => establishSession('/api/auth/login', payload, sessionOptions),
      sendRegisterCode: (payload) => request('/api/auth/register/send-code', {
        method: 'POST',
        body: payload,
        requiresAuth: false
      }),
      sendResetCode: (payload) => request('/api/auth/forgot-password/send-code', {
        method: 'POST',
        body: payload,
        requiresAuth: false
      }),
      resetPassword: (payload) => request('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: payload,
        requiresAuth: false
      }),
      currentUser: () => request('/api/auth/me'),
      async logout() {
        try {
          if (getToken()) await request('/api/auth/logout', { method: 'POST' });
        } finally {
          clearToken();
        }
      },
      listCompositions: () => request('/api/compositions'),
      createComposition: (payload) => request('/api/compositions', { method: 'POST', body: payload }),
      readComposition: (compositionId) => request(`/api/compositions/${encodeURIComponent(compositionId)}`),
      deleteComposition: (compositionId) => request(
        `/api/compositions/${encodeURIComponent(compositionId)}`,
        { method: 'DELETE' }
      ),
      explainSelection: (compositionId, payload, requestOptions = {}) => request(
        `/api/compositions/${encodeURIComponent(compositionId)}/explanations`,
        { method: 'POST', body: payload, ...requestOptions }
      ),
      saveAnnotation: (compositionId, payload) => request(
        `/api/compositions/${encodeURIComponent(compositionId)}/annotations`,
        { method: 'POST', body: payload }
      ),
      deleteAnnotation: (compositionId, annotationId) => request(
        `/api/compositions/${encodeURIComponent(compositionId)}/annotations/${encodeURIComponent(annotationId)}`,
        { method: 'DELETE' }
      )
    };
  }

  return { ApiError, SESSION_TOKEN_KEY, REMEMBERED_TOKEN_KEY, REMEMBERED_EMAIL_KEY, createApiClient };
});
