(function exposeCompositionApiClient(root, factory) {
  const apiClient = factory();
  if (typeof module === 'object' && module.exports) module.exports = apiClient;
  if (root) root.CompositionApiClient = apiClient;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCompositionApiClientModule() {
  const SESSION_TOKEN_KEY = 'fanwenjia:session-token:v1';

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
    if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求。');
    if (!storage) throw new Error('当前环境不支持会话存储。');

    function getToken() {
      return storage.getItem(SESSION_TOKEN_KEY);
    }

    function clearToken() {
      storage.removeItem(SESSION_TOKEN_KEY);
    }

    function saveToken(token) {
      if (!token || typeof token !== 'string') throw new Error('服务未返回有效登录凭据。');
      storage.setItem(SESSION_TOKEN_KEY, token);
    }

    async function request(path, requestOptions = {}) {
      const {
        method = 'GET',
        body,
        requiresAuth = true
      } = requestOptions;
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const token = getToken();
      if (requiresAuth && token) headers.Authorization = `Bearer ${token}`;

      let response;
      try {
        response = await fetchImpl(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch (error) {
        throw new ApiError(0, '无法连接独立服务，请确认已从 8088 端口打开网站。');
      }

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

    async function establishSession(path, payload) {
      const result = await request(path, { method: 'POST', body: payload, requiresAuth: false });
      saveToken(result && result.token);
      return result;
    }

    return {
      getToken,
      clearToken,
      register: (payload) => establishSession('/api/auth/register', payload),
      login: (payload) => establishSession('/api/auth/login', payload),
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
      explainSelection: (compositionId, payload) => request(
        `/api/compositions/${encodeURIComponent(compositionId)}/explanations`,
        { method: 'POST', body: payload }
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

  return { ApiError, SESSION_TOKEN_KEY, createApiClient };
});
