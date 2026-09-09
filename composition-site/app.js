(() => {
  'use strict';

  const previewUtils = window.CompositionPreviewUtils;
  const apiModule = window.CompositionApiClient;
  const passwordVisibilityModule = window.PasswordVisibility;
  if (!previewUtils || !apiModule || !passwordVisibilityModule) {
    console.error('VocabNote 没有加载完整，请刷新页面后重试。');
    return;
  }

  const {
    getEnglishPhraseCandidate,
    getMobileWordActionState,
    isEnglishPhraseSelection,
    scheduleHoverExplanation,
    splitEssayIntoRenderChunks,
    sortEssaysByRecent
  } = previewUtils;
  const { ApiError, createApiClient } = apiModule;
  const api = createApiClient();
  const queueExplanation = previewUtils.createExplanationQueue();

  const dom = {
    authGate: document.querySelector('#auth-gate'),
    appShell: document.querySelector('#app-shell'),
    authForm: document.querySelector('#auth-form'),
    authModeButtons: document.querySelectorAll('[data-auth-mode]'),
    authModeToggle: document.querySelector('#auth-mode-toggle'),
    authFormKicker: document.querySelector('#auth-form-kicker'),
    authFormTitle: document.querySelector('#auth-form-title'),
    authFormCopy: document.querySelector('#auth-form-copy'),
    authDisplayNameField: document.querySelector('#auth-display-name-field'),
    authDisplayName: document.querySelector('#auth-display-name'),
    authEmail: document.querySelector('#auth-email'),
    authCodeField: document.querySelector('#auth-code-field'),
    authCode: document.querySelector('#auth-code'),
    sendCodeButton: document.querySelector('#send-code-button'),
    authCodeHint: document.querySelector('#auth-code-hint'),
    authPassword: document.querySelector('#auth-password'),
    authPasswordToggle: document.querySelector('#auth-password-toggle'),
    authPasswordLabel: document.querySelector('#auth-password-label'),
    forgotPasswordLink: document.querySelector('#forgot-password-link'),
    rememberMe: document.querySelector('#remember-me'),
    rememberMeField: document.querySelector('#remember-me-field'),
    authSubmitButton: document.querySelector('#auth-submit-button'),
    authFormError: document.querySelector('#auth-form-error'),
    accountDisplayName: document.querySelector('#account-display-name'),
    logoutButton: document.querySelector('#logout-button'),
    mobileMenuButton: document.querySelector('#mobile-menu-button'),
    mobileMenuDialog: document.querySelector('#mobile-menu-dialog'),
    mobileMenuClose: document.querySelector('#mobile-menu-close'),
    mobileAccountDisplayName: document.querySelector('#mobile-account-display-name'),
    mobileAiSettingsButton: document.querySelector('#mobile-ai-settings-button'),
    mobileLogoutButton: document.querySelector('#mobile-logout-button'),
    workspace: document.querySelector('#workspace'),
    newEssayButton: document.querySelector('#new-essay-button'),
    essayList: document.querySelector('#essay-list'),
    essayCount: document.querySelector('#essay-count'),
    readerContent: document.querySelector('#reader-content'),
    readerEmpty: document.querySelector('#reader-empty'),
    readerEmptyTitle: document.querySelector('#reader-empty-title'),
    readerEmptyCopy: document.querySelector('#reader-empty-copy'),
    readerTitle: document.querySelector('#reader-title'),
    readerSourceLabel: document.querySelector('#reader-source-label'),
    readerDate: document.querySelector('#reader-date'),
    readerWordCount: document.querySelector('#reader-word-count'),
    readerNoteCount: document.querySelector('#reader-note-count'),
    preloadStatus: document.querySelector('#preload-status'),
    preloadText: document.querySelector('#preload-text'),
    preloadMeter: document.querySelector('#preload-meter'),
    preloadRetry: document.querySelector('#preload-retry'),
    essayBody: document.querySelector('#essay-body'),
    essayNotes: document.querySelector('#essay-notes'),
    notesGroups: document.querySelector('#notes-groups'),
    notesTotal: document.querySelector('#notes-total'),
    notesToggle: document.querySelector('#notes-toggle-button'),
    backToLibrary: document.querySelector('#back-to-library'),
    phraseAction: document.querySelector('#phrase-action'),
    phraseActionLabel: document.querySelector('#phrase-action-label'),
    explainPhraseButton: document.querySelector('#explain-phrase-button'),
    mobileWordAction: document.querySelector('#mobile-word-action'),
    mobileWordTerm: document.querySelector('#mobile-word-term'),
    mobileWordMeaning: document.querySelector('#mobile-word-meaning'),
    mobileWordStatus: document.querySelector('#mobile-word-status'),
    mobileWordRecord: document.querySelector('#mobile-word-record'),
    mobileWordClose: document.querySelector('#mobile-word-close'),
    essayDialog: document.querySelector('#essay-dialog'),
    essayForm: document.querySelector('#essay-form'),
    essayTitle: document.querySelector('#essay-title'),
    essaySourceLabel: document.querySelector('#essay-source-label'),
    essayContent: document.querySelector('#essay-content'),
    essayFormError: document.querySelector('#essay-form-error'),
    noteDialog: document.querySelector('#note-dialog'),
    noteForm: document.querySelector('#note-form'),
    noteKindLabel: document.querySelector('#note-kind-label'),
    noteSelectedText: document.querySelector('#note-selected-text'),
    noteContext: document.querySelector('#note-context'),
    noteTranslation: document.querySelector('#note-translation'),
    notePersonalText: document.querySelector('#note-personal-text'),
    noteKind: document.querySelector('#note-kind'),
    noteStartOffset: document.querySelector('#note-start-offset'),
    noteEndOffset: document.querySelector('#note-end-offset'),
    noteContentVersion: document.querySelector('#note-content-version'),
    noteFormError: document.querySelector('#note-form-error'),
    saveNoteButton: document.querySelector('#save-note-button'),
    explanationStatus: document.querySelector('#explanation-status'),
    explanationStatusText: document.querySelector('#explanation-status-text'),
    toast: document.querySelector('#toast')
  };

  const state = {
    authMode: 'login',
    currentUser: null,
    essays: [],
    selectedId: null,
    selectedEssay: null
  };
  let pendingPhrase = null;
  let pendingAnnotation = null;
  let toastTimer = null;
  let listRequestId = 0;
  let detailRequestId = 0;
  let activeView = 'wordbook';
  const explanationCache = new Map();
  let translationUnavailableUntil = 0;
  let translationUnavailableMessage = '语境翻译暂不可用。';
  let hoverTimer = null;
  let hoveredWordNode = null;
  let phraseActionTimer = null;
  let preloadRequestId = 0;
  let preloadTimer = null;
  let essayRenderFrame = null;
  let essayRenderId = 0;
  let pendingMobileWord = null;
  let mobileWordNode = null;
  let mobileWordRequestId = 0;
  let notesCollapsed = false;
  let sendCodeTimer = null;
  let sendCodeSecondsLeft = 0;

  function normalizeAnnotation(annotation) {
    return {
      id: String(annotation.id),
      kind: annotation.kind === 'phrase' ? 'phrase' : 'word',
      selectedText: String(annotation.selectedText || ''),
      startOffset: Number(annotation.startOffset),
      endOffset: Number(annotation.endOffset),
      translationZh: String(annotation.translationZh || '').trim(),
      learningText: String(annotation.learningText || '').trim(),
      note: String(annotation.note || '').trim(),
      contentVersion: Number(annotation.contentVersion),
      createdAt: annotation.createdAt || null,
      updatedAt: annotation.updatedAt || null
    };
  }

  function normalizeEssay(essay) {
    return {
      id: String(essay.id),
      title: String(essay.title || '').trim(),
      sourceLabel: String(essay.sourceLabel || '').trim(),
      content: String(essay.content || '').replace(/\r\n?/g, '\n').trim(),
      contentVersion: Number(essay.contentVersion),
      annotations: Array.isArray(essay.annotations) ? essay.annotations.map(normalizeAnnotation) : [],
      createdAt: essay.createdAt || null,
      updatedAt: essay.updatedAt || null
    };
  }

  function normalizeListItem(essay) {
    return {
      id: String(essay.id),
      title: String(essay.title || '').trim(),
      sourceLabel: String(essay.sourceLabel || '').trim(),
      noteCount: Number(essay.noteCount || 0),
      updatedAt: essay.updatedAt || null
    };
  }

  function currentEssay() {
    return state.selectedEssay && state.selectedEssay.id === state.selectedId ? state.selectedEssay : null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '刚刚保存';
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  function wordCount(content) {
    return (content.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
  }

  function sourceSentence(content, startOffset, endOffset) {
    const left = Math.max(
      content.lastIndexOf('.', startOffset - 1),
      content.lastIndexOf('!', startOffset - 1),
      content.lastIndexOf('?', startOffset - 1),
      content.lastIndexOf('\n', startOffset - 1)
    );
    const rightCandidates = [
      content.indexOf('.', endOffset),
      content.indexOf('!', endOffset),
      content.indexOf('?', endOffset),
      content.indexOf('\n', endOffset)
    ].filter((index) => index >= 0);
    const right = rightCandidates.length ? Math.min(...rightCandidates) + 1 : content.length;
    return content.slice(left + 1, right).trim();
  }

  function isMobileLayout() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function renderAccount() {
    const displayName = state.currentUser ? state.currentUser.displayName : '';
    dom.accountDisplayName.textContent = displayName;
    dom.mobileAccountDisplayName.textContent = displayName;
  }

  function renderEssayList() {
    const essays = sortEssaysByRecent(state.essays);
    dom.essayCount.textContent = String(essays.length);
    if (!essays.length) {
      dom.essayList.innerHTML = '<p class="empty-notes">这里还没有范文。<strong>点击右上角 +</strong>，收进第一篇。</p>';
      return;
    }
    dom.essayList.innerHTML = essays.map((essay) => {
      const selected = essay.id === state.selectedId;
      return `
        <div class="essay-list-item" role="listitem">
          <button class="essay-row" type="button" data-open-essay="${escapeHtml(essay.id)}" aria-current="${selected}">
            <span class="essay-row-title" title="${escapeHtml(essay.title)}">${escapeHtml(essay.title)}</span>
            <span class="essay-row-subtitle">${escapeHtml(essay.sourceLabel || '个人范文')}</span>
            <span class="essay-row-time">${formatDate(essay.updatedAt)} · ${essay.noteCount} 条摘录</span>
          </button>
          <button class="essay-delete-button" type="button" data-delete-essay="${escapeHtml(essay.id)}" aria-label="删除作文：${escapeHtml(essay.title)}">删除</button>
        </div>`;
    }).join('');
  }

  function renderReader() {
    const essay = currentEssay();
    const isLoading = Boolean(state.selectedId) && !essay;
    dom.readerContent.hidden = !essay;
    dom.readerEmpty.hidden = Boolean(essay);
    if (!essay) {
      cancelEssayRender();
      preloadRequestId += 1;
      window.clearTimeout(preloadTimer);
      dom.preloadStatus.hidden = true;
      dom.readerEmptyTitle.textContent = isLoading ? '正在打开范文' : '从一篇范文开始';
      dom.readerEmptyCopy.textContent = isLoading
        ? '正在从你的独立账户读取这篇范文和它的词句笔记。'
        : '新建题目、范文和可选来源信息，之后就能在正文里留下自己的词句摘录。';
      return;
    }

    dom.readerTitle.textContent = essay.title;
    dom.readerSourceLabel.textContent = essay.sourceLabel;
    dom.readerSourceLabel.hidden = !essay.sourceLabel;
    dom.readerDate.textContent = `更新于 ${formatDate(essay.updatedAt)}`;
    dom.readerWordCount.textContent = `${wordCount(essay.content)} words`;
    dom.readerNoteCount.textContent = `${essay.annotations.length} 条摘录`;
    renderEssayBody(essay);
    watchPreload(essay);
    renderNotes(essay);
    renderNotesVisibility();
  }

  function buildInteractiveHtml(content, baseOffset = 0) {
    const pattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
    let output = '';
    let cursor = 0;
    for (const match of content.matchAll(pattern)) {
      const text = match[0];
      const start = match.index;
      const end = start + text.length;
      output += escapeHtml(content.slice(cursor, start));
      output += `<span class="essay-word" role="button" tabindex="0" data-start="${baseOffset + start}" data-end="${baseOffset + end}" data-gloss="点击记录这条语境">${escapeHtml(text)}</span>`;
      cursor = end;
    }
    return output + escapeHtml(content.slice(cursor));
  }

  function cancelEssayRender() {
    essayRenderId += 1;
    if (essayRenderFrame !== null) {
      const cancel = window.cancelAnimationFrame || window.clearTimeout;
      cancel(essayRenderFrame);
      essayRenderFrame = null;
    }
  }

  function hydrateCachedGlosses(essay, scope) {
    scope.querySelectorAll('.essay-word').forEach((wordNode) => {
      const startOffset = Number(wordNode.dataset.start);
      const endOffset = Number(wordNode.dataset.end);
      const cachedExplanation = explanationCache.get(explanationCacheKey(essay, startOffset, endOffset));
      if (!cachedExplanation) return;
      wordNode.dataset.gloss = '正在读取语境释义…';
      void cachedExplanation.then((explanation) => {
        if (currentEssay()?.id !== essay.id || currentEssay()?.contentVersion !== essay.contentVersion) return;
        wordNode.dataset.gloss = explanation.translationZh || '点击记录这条语境';
        wordNode.dataset.ready = 'true';
      }).catch(() => {
        if (currentEssay()?.id === essay.id && currentEssay()?.contentVersion === essay.contentVersion) {
          wordNode.dataset.gloss = '点击记录这条语境';
        }
      });
    });
  }

  function renderEssayBody(essay) {
    cancelEssayRender();
    const renderId = essayRenderId;
    const chunks = splitEssayIntoRenderChunks(essay.content);
    let cursor = 0;
    dom.essayBody.replaceChildren();
    dom.essayBody.setAttribute('aria-busy', String(chunks.length > 1));

    function appendChunkBatch(size) {
      const fragment = document.createDocumentFragment();
      const end = Math.min(cursor + size, chunks.length);
      while (cursor < end) {
        const chunk = chunks[cursor++];
        const chunkNode = document.createElement('span');
        chunkNode.className = 'essay-render-chunk';
        chunkNode.innerHTML = buildInteractiveHtml(chunk.text, chunk.start);
        fragment.appendChild(chunkNode);
      }
      hydrateCachedGlosses(essay, fragment);
      dom.essayBody.appendChild(fragment);
    }

    appendChunkBatch(1);
    const renderNext = () => {
      if (renderId !== essayRenderId || currentEssay()?.id !== essay.id || currentEssay()?.contentVersion !== essay.contentVersion) return;
      appendChunkBatch(2);
      if (cursor < chunks.length) {
        const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        essayRenderFrame = schedule(renderNext);
      } else {
        essayRenderFrame = null;
        dom.essayBody.setAttribute('aria-busy', 'false');
      }
    };
    if (cursor < chunks.length) {
      const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
      essayRenderFrame = schedule(renderNext);
    } else {
      dom.essayBody.setAttribute('aria-busy', 'false');
    }
  }

  function renderNotes(essay) {
    const notes = [...essay.annotations].sort((a, b) => a.startOffset - b.startOffset || String(a.id).localeCompare(String(b.id)));
    const groups = [
      { kind: 'word', label: '单词' },
      { kind: 'phrase', label: '短语' }
    ];
    dom.notesTotal.textContent = `${notes.length} 条`;
    dom.notesGroups.innerHTML = groups.map(({ kind, label }) => {
      const groupNotes = notes.filter((note) => note.kind === kind);
      return `
        <section class="note-group" aria-label="${label}笔记">
          <h3 class="note-group-heading">${label} <span>${groupNotes.length}</span></h3>
          ${groupNotes.length ? `<div class="note-list">${groupNotes.map(renderNoteRow).join('')}</div>` : `<div class="empty-notes">还没有${label}摘录。<strong>${kind === 'word' ? '点击一个词' : '拖选一段短语'}</strong>，再决定是否保存。</div>`}
        </section>`;
    }).join('');
  }

  function renderNotesVisibility() {
    const canCollapse = isMobileLayout();
    const collapsed = canCollapse && notesCollapsed;
    dom.essayNotes.classList.toggle('is-collapsed', collapsed);
    dom.notesToggle.hidden = !canCollapse;
    dom.notesToggle.setAttribute('aria-expanded', String(!collapsed));
    dom.notesToggle.textContent = collapsed ? '查看摘录' : '收起';
  }

  function toggleNotes() {
    if (!isMobileLayout()) return;
    notesCollapsed = !notesCollapsed;
    renderNotesVisibility();
  }

  function renderNoteRow(note) {
    const personal = note.note ? `<span class="note-personal">${escapeHtml(note.note)}</span>` : '';
    const displayText = note.kind === 'phrase' && note.learningText ? note.learningText : note.selectedText;
    const hasDistinctSource = note.kind === 'phrase'
      && note.learningText
      && note.learningText.trim().toLocaleLowerCase() !== note.selectedText.trim().toLocaleLowerCase();
    const source = hasDistinctSource
      ? `<span class="note-source-text">原文：${escapeHtml(note.selectedText)}</span>`
      : '';
    return `
      <article class="note-row" data-note-id="${escapeHtml(note.id)}">
        <div>
          <span class="note-term">${escapeHtml(displayText)}</span>
          <span class="note-term-type">${note.kind === 'word' ? 'WORD' : 'PHRASE'}</span>
          ${source}
        </div>
        <div class="note-meaning"><strong>${escapeHtml(note.translationZh || '未填写释义')}</strong>${personal}</div>
        <div class="note-actions">
          <button class="note-icon-button" type="button" data-focus-note="${escapeHtml(note.id)}" aria-label="定位到正文">↗</button>
          <button class="note-icon-button remove" type="button" data-remove-note="${escapeHtml(note.id)}" aria-label="删除笔记">×</button>
        </div>
      </article>`;
  }

  function renderAll() {
    renderAccount();
    renderEssayList();
    renderReader();
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function setButtonBusy(button, isBusy, idleText) {
    button.disabled = isBusy;
    button.dataset.idleText ||= button.textContent;
    button.textContent = isBusy ? '请稍候…' : (idleText || button.dataset.idleText);
  }

  function setAuthMode(mode, resetForm = true) {
    state.authMode = mode === 'register' || mode === 'reset' ? mode : 'login';
    const isRegister = state.authMode === 'register';
    const isReset = state.authMode === 'reset';
    const needsCode = isRegister || isReset;
    stopCodeCountdown();
    dom.authModeToggle.hidden = isReset;
    dom.authModeButtons.forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.authMode === state.authMode));
    });
    dom.authDisplayNameField.hidden = !isRegister;
    dom.authDisplayName.required = isRegister;
    dom.authCodeField.hidden = !needsCode;
    dom.authCode.required = needsCode;
    dom.forgotPasswordLink.hidden = state.authMode !== 'login';
    dom.rememberMeField.hidden = isReset;
    dom.authPassword.autocomplete = state.authMode === 'login' ? 'current-password' : 'new-password';
    dom.authPasswordLabel.innerHTML = isReset ? '新密码 <em>至少 8 位</em>' : '密码 <em>至少 8 位</em>';
    dom.authFormKicker.textContent = isReset ? 'PASSWORD HELP' : (isRegister ? 'NEW ARCHIVE' : 'WELCOME BACK');
    dom.authFormTitle.textContent = isReset
      ? '重置你的密码'
      : (isRegister ? '创建你的 VocabNote 账户' : '进入 VocabNote');
    dom.authFormCopy.textContent = isReset
      ? '输入注册邮箱收到的验证码，设置新密码；重置后所有已登录设备需重新登录。'
      : (isRegister
        ? '注册后，你保存的范文和摘录只会进入这个独立账户。'
        : '登录后继续阅读、摘录和整理自己的范文。');
    dom.authSubmitButton.textContent = isReset ? '重置密码' : (isRegister ? '注册并进入' : '登录并进入');
    delete dom.authSubmitButton.dataset.idleText;
    dom.authFormError.textContent = '';
    dom.authCodeHint.textContent = '';
    if (resetForm) dom.authForm.reset();
    authPasswordVisibility.reset();
  }

  function stopCodeCountdown() {
    if (sendCodeTimer !== null) {
      window.clearInterval(sendCodeTimer);
      sendCodeTimer = null;
    }
    sendCodeSecondsLeft = 0;
    if (dom.sendCodeButton) {
      dom.sendCodeButton.disabled = false;
      dom.sendCodeButton.textContent = '获取验证码';
    }
  }

  function updateSendCodeButton() {
    if (!dom.sendCodeButton) return;
    if (sendCodeSecondsLeft > 0) {
      dom.sendCodeButton.disabled = true;
      dom.sendCodeButton.textContent = `重新发送 ${sendCodeSecondsLeft}s`;
    } else {
      dom.sendCodeButton.disabled = false;
      dom.sendCodeButton.textContent = '获取验证码';
    }
  }

  function startCodeCountdown() {
    sendCodeSecondsLeft = 60;
    updateSendCodeButton();
    sendCodeTimer = window.setInterval(() => {
      sendCodeSecondsLeft -= 1;
      updateSendCodeButton();
      if (sendCodeSecondsLeft <= 0) stopCodeCountdown();
    }, 1000);
  }

  async function requestVerificationCode() {
    if (sendCodeSecondsLeft > 0) return;
    const email = dom.authEmail.value.trim();
    if (!email) {
      dom.authFormError.textContent = '请先填写邮箱，再获取验证码。';
      dom.authEmail.focus();
      return;
    }
    const purpose = state.authMode === 'register' ? 'register' : 'reset';
    dom.sendCodeButton.disabled = true;
    dom.sendCodeButton.textContent = '发送中…';
    dom.authFormError.textContent = '';
    try {
      if (purpose === 'register') await api.sendRegisterCode({ email });
      else await api.sendResetCode({ email });
      startCodeCountdown();
      dom.authCodeHint.textContent = '验证码已发送到你的邮箱，5 分钟内有效；一分钟内只能获取一次。';
    } catch (error) {
      dom.authFormError.textContent = authErrorText(error, '验证码发送失败，请稍后重试。');
      updateSendCodeButton();
    }
  }

  function authErrorText(error, fallback) {
    if (error instanceof ApiError) {
      if (error.status === 400) return '验证码不正确或已过期，请重新获取。';
      if (error.status === 401) return '邮箱或密码不正确。';
      if (error.status === 404) return '该邮箱尚未注册。';
      if (error.status === 409) return '该邮箱已经注册，请直接登录或重置密码。';
      if (error.status === 429) return '验证码已发送，请一分钟后再试。';
      if (error.status === 503) return '邮件服务暂时不可用，请稍后重试。';
      return error.message || fallback;
    }
    return fallback;
  }

  function showAuthGate(message = '') {
    aiSettings.reset();
    ++listRequestId;
    ++detailRequestId;
    wordbook.reset();
    state.currentUser = null;
    state.essays = [];
    state.selectedId = null;
    state.selectedEssay = null;
    ++preloadRequestId;
    window.clearTimeout(preloadTimer);
    pendingAnnotation = null;
    explanationCache.clear();
    translationUnavailableUntil = 0;
    cancelEssayRender();
    hidePhraseAction();
    hideMobileWordAction();
    closeMobileMenu();
    dom.appShell.hidden = true;
    dom.authGate.hidden = false;
    setAuthMode('login', false);
    dom.authFormError.textContent = message;
    dom.authPassword.value = '';
    const rememberedEmail = api.getRememberedEmail();
    if (rememberedEmail && !dom.authEmail.value) dom.authEmail.value = rememberedEmail;
    dom.rememberMe.checked = Boolean(rememberedEmail);
    window.setTimeout(() => (dom.authEmail.value ? dom.authPassword : dom.authEmail).focus(), 0);
  }

  function showApp() {
    dom.authGate.hidden = true;
    dom.appShell.hidden = false;
    renderAll();
    wordbook.reset();
    switchView('wordbook');
  }

  function switchView(view, compositionId = null) {
    activeView = view === 'compositions' ? 'compositions' : 'wordbook';
    ++listRequestId;
    ++detailRequestId;
    hidePhraseAction();
    hideMobileWordAction();
    closeMobileMenu();
    if (activeView !== 'compositions') cancelEssayRender();
    dom.workspace.hidden = activeView !== 'compositions';
    dom.newEssayButton.hidden = activeView !== 'compositions';
    document.querySelectorAll('[data-site-view]').forEach(button => {
      if (button.dataset.siteView === activeView) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    wordbook.setActive(activeView === 'wordbook' && Boolean(state.currentUser));
    if (activeView === 'compositions' && state.currentUser) {
      if (compositionId && isMobileLayout()) dom.workspace.classList.add('show-reader');
      void loadEssays(compositionId || state.selectedId);
    }
  }

  function errorMessage(error, fallback) {
    if (error instanceof ApiError) {
      if (error.status === 409) return '正文已变化，请重新选择需要摘录的内容。';
      if (error.status === 401) return '登录状态已失效，请重新登录。';
      return error.message || fallback;
    }
    return fallback;
  }

  function handleExpiredSession(error) {
    if (error instanceof ApiError && error.status === 401) {
      showAuthGate('登录状态已失效，请重新登录。');
      return true;
    }
    return false;
  }

  async function loadEssays(preferredId = state.selectedId) {
    const requestId = ++listRequestId;
    try {
      const list = await api.listCompositions();
      if (requestId !== listRequestId) return;
      state.essays = Array.isArray(list) ? list.map(normalizeListItem) : [];
      const nextId = preferredId && state.essays.some((essay) => essay.id === String(preferredId))
        ? String(preferredId)
        : (state.essays[0] ? state.essays[0].id : null);
      state.selectedId = nextId;
      state.selectedEssay = null;
      renderAll();
      if (nextId) await loadSelectedEssay(nextId);
    } catch (error) {
      if (requestId !== listRequestId) return;
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '暂时无法读取你的范文。'));
    }
  }

  async function refreshEssayList() {
    try {
      const list = await api.listCompositions();
      state.essays = Array.isArray(list) ? list.map(normalizeListItem) : [];
      renderEssayList();
    } catch (error) {
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '范文列表没有及时刷新。'));
    }
  }

  async function loadSelectedEssay(id) {
    const requestId = ++detailRequestId;
    try {
      const essay = normalizeEssay(await api.readComposition(id));
      if (requestId !== detailRequestId || essay.id !== state.selectedId) return;
      state.selectedEssay = essay;
      renderReader();
    } catch (error) {
      if (requestId !== detailRequestId) return;
      if (handleExpiredSession(error)) return;
      if (error instanceof ApiError && error.status === 404) {
        await loadEssays();
        return;
      }
      showToast(errorMessage(error, '暂时无法打开这篇范文。'));
    }
  }

  async function selectEssay(id, shouldOpenMobile = true) {
    if (!state.essays.some((essay) => essay.id === id)) return;
    state.selectedId = id;
    state.selectedEssay = null;
    notesCollapsed = isMobileLayout();
    hideMobileWordAction();
    renderAll();
    if (shouldOpenMobile && isMobileLayout()) dom.workspace.classList.add('show-reader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await loadSelectedEssay(id);
  }

  async function submitAuth(event) {
    event.preventDefault();
    const email = dom.authEmail.value.trim();
    const password = dom.authPassword.value;
    const displayName = dom.authDisplayName.value.trim();
    const code = dom.authCode.value.trim();
    const mode = state.authMode;
    if (mode === 'register' && !displayName) {
      dom.authFormError.textContent = '请填写称呼。';
      return;
    }
    if (!email) {
      dom.authFormError.textContent = '请填写邮箱。';
      return;
    }
    if (mode !== 'login' && !/^\d{6}$/.test(code)) {
      dom.authFormError.textContent = '请填写邮箱收到的 6 位数字验证码。';
      return;
    }
    if (!password || password.length < 8) {
      dom.authFormError.textContent = mode === 'login' ? '请填写密码。' : '密码至少需要 8 位。';
      return;
    }

    setButtonBusy(dom.authSubmitButton, true);
    dom.authFormError.textContent = '';
    try {
      if (mode === 'reset') {
        await api.resetPassword({ email, code, newPassword: password });
        setAuthMode('login', false);
        dom.authPassword.value = '';
        window.setTimeout(() => dom.authPassword.focus(), 0);
        showToast('密码已重置，请用新密码登录。');
        return;
      }
      const remember = dom.rememberMe.checked;
      const result = mode === 'register'
        ? await api.register({ email, password, displayName, code }, { remember })
        : await api.login({ email, password }, { remember });
      state.currentUser = result.user;
      showApp();
      showToast(`欢迎回来，${result.user.displayName}。`);
    } catch (error) {
      dom.authFormError.textContent = authErrorText(error, '暂时无法进入 VocabNote。');
    } finally {
      setButtonBusy(dom.authSubmitButton, false);
    }
  }

  async function logout() {
    dom.logoutButton.disabled = true;
    wordbook.reset();
    ++listRequestId;
    ++detailRequestId;
    try {
      await api.logout();
    } catch (error) {
      // Session cleanup still happens in the API client, even if the network failed.
    } finally {
      dom.logoutButton.disabled = false;
      showAuthGate();
      showToast('你已退出 VocabNote。');
    }
  }

  let editingEssay = null;
  function openEssayDialog() {
    editingEssay = null;
    document.querySelector('#essay-dialog-title').textContent = '收进一篇范文';
    dom.essayForm.reset();
    dom.essayFormError.textContent = '';
    openDialog(dom.essayDialog);
    window.setTimeout(() => dom.essayTitle.focus(), 0);
  }

  function openEditEssayDialog() {
    const essay = currentEssay();
    if (!essay) return;
    openEssayDialog();
    editingEssay = { id: essay.id, contentVersion: essay.contentVersion };
    document.querySelector('#essay-dialog-title').textContent = '编辑范文';
    dom.essayTitle.value = essay.title;
    dom.essaySourceLabel.value = essay.sourceLabel;
    dom.essayContent.value = essay.content;
  }

  async function saveEssay(event) {
    event.preventDefault();
    const title = dom.essayTitle.value.trim();
    const sourceLabel = dom.essaySourceLabel.value.trim();
    const content = dom.essayContent.value.replace(/\r\n?/g, '\n').trim();
    if (!title || !content) {
      dom.essayFormError.textContent = !title ? '请先填写题目。' : '请先填写范文内容。';
      (!title ? dom.essayTitle : dom.essayContent).focus();
      return;
    }

    const submitButton = dom.essayForm.querySelector('button[type="submit"]');
    if (submitButton.disabled) return;
    const editing = editingEssay;
    setButtonBusy(submitButton, true, '保存范文');
    dom.essayFormError.textContent = '';
    try {
      const payload = {
        title,
        sourceLabel: sourceLabel || null,
        content
      };
      const created = normalizeEssay(await (editing
        ? api.updateComposition(editing.id, { ...payload, contentVersion: editing.contentVersion })
        : api.createComposition(payload)));
      explanationCache.clear();
      state.selectedId = created.id;
      state.selectedEssay = created;
      state.essays = [
        normalizeListItem({ ...created, noteCount: created.annotations.length }),
        ...state.essays.filter((essay) => essay.id !== created.id)
      ];
      closeDialog(dom.essayDialog);
      renderAll();
      if (isMobileLayout()) dom.workspace.classList.add('show-reader');
      void refreshEssayList();
      showToast(editing ? '修改已保存，正在更新语境释义。' : '范文已保存，正在后台预加载语境释义。');
    } catch (error) {
      if (!handleExpiredSession(error)) dom.essayFormError.textContent = errorMessage(error, '范文暂时没有保存成功。');
    } finally {
      setButtonBusy(submitButton, false, '保存范文');
    }
  }

  function annotationAtRange(essay, startOffset, endOffset) {
    return essay.annotations.find((annotation) => (
      annotation.startOffset === startOffset && annotation.endOffset === endOffset
    ));
  }

  function explanationCacheKey(essay, startOffset, endOffset) {
    return `${essay.id}:${essay.contentVersion}:${startOffset}:${endOffset}`;
  }

  function requestExplanation(essay, selection, requestOptions = {}) {
    const cacheKey = explanationCacheKey(essay, selection.startOffset, selection.endOffset);
    if (explanationCache.has(cacheKey)) return explanationCache.get(cacheKey);
    if (Date.now() < translationUnavailableUntil) {
      return Promise.reject(new ApiError(503, translationUnavailableMessage));
    }
    const payload = {
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      kind: selection.kind,
      contentVersion: essay.contentVersion
    };
    const requestingUser = state.currentUser;
    const { background = false, ...apiOptions } = requestOptions;
    const pending = queueExplanation(() => {
      if (Date.now() < translationUnavailableUntil) throw new ApiError(503, translationUnavailableMessage);
      return api.explainSelection(essay.id, payload, apiOptions);
    }, { background, isCurrent: () => state.currentUser === requestingUser
        && currentEssay()?.id === essay.id && currentEssay()?.contentVersion === essay.contentVersion }).catch((error) => {
      explanationCache.delete(cacheKey);
      if (error instanceof ApiError && error.status === 503) {
        translationUnavailableMessage = error.message || '语境翻译暂不可用。';
        translationUnavailableUntil = Date.now() + 5_000;
      }
      throw error;
    });
    explanationCache.set(cacheKey, pending);
    return pending;
  }

  function watchPreload(essay) {
    const token = ++preloadRequestId;
    window.clearTimeout(preloadTimer);
    let cursor = 0;
    const requestingUser = state.currentUser;
    const isCurrent = () => token === preloadRequestId && state.currentUser === requestingUser
      && currentEssay()?.id === essay.id && currentEssay()?.contentVersion === essay.contentVersion;
    dom.preloadStatus.hidden = false;
    dom.preloadText.textContent = '正在读取预加载进度…';
    dom.preloadRetry.hidden = true;
    async function poll() {
      try {
        const progress = await api.getPreload(essay.id, cursor);
        if (!isCurrent()) return;
        if (progress.contentVersion !== essay.contentVersion) {
          dom.preloadText.textContent = '范文已在其他页面更新，请重新打开。';
          dom.preloadMeter.hidden = true;
          return;
        }
        cursor = progress.cursor;
        for (const row of progress.results) {
          if (essay.content.slice(row.startOffset, row.endOffset) !== row.selectedText) continue;
          explanationCache.set(explanationCacheKey(essay, row.startOffset, row.endOffset), Promise.resolve(row));
          const node = dom.essayBody.querySelector(`[data-start="${row.startOffset}"][data-end="${row.endOffset}"]`);
          if (node) { node.dataset.gloss = row.translationZh; node.dataset.ready = 'true'; }
        }
        const label = previewUtils.preloadStatusText(progress);
        dom.preloadText.textContent = label;
        dom.preloadStatus.dataset.state = progress.status;
        dom.preloadMeter.max = Math.max(1, progress.total);
        dom.preloadMeter.value = progress.done;
        dom.preloadMeter.hidden = progress.status === 'complete' || progress.total === 0;
        dom.preloadRetry.hidden = progress.status !== 'paused';
        if (progress.status !== 'complete') preloadTimer = window.setTimeout(poll, progress.status === 'paused' ? 15000 : 3000);
      } catch (error) {
        if (!isCurrent() || handleExpiredSession(error)) return;
        dom.preloadText.textContent = '进度暂时无法同步，已保存的释义仍可查看。';
        preloadTimer = window.setTimeout(poll, 8000);
      }
    }
    void poll();
  }

  async function retryPreload() {
    const essay = currentEssay();
    if (!essay || dom.preloadRetry.disabled) return;
    dom.preloadRetry.disabled = true;
    try {
      await api.retryPreload(essay.id);
      if (currentEssay()?.id === essay.id) watchPreload(essay);
    } catch (error) {
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '暂时无法重试。'));
    } finally { dom.preloadRetry.disabled = false; }
  }
  function setExplanationLoading(isLoading, message) {
    dom.explanationStatus.dataset.loading = String(Boolean(isLoading));
    dom.explanationStatusText.textContent = message;
  }

  async function fillNoteExplanation(essay, selection) {
    const requestedAnnotation = pendingAnnotation;
    setExplanationLoading(true, '正在按本篇语境生成释义…');
    try {
      const explanation = await requestExplanation(essay, selection);
      if (!requestedAnnotation
          || pendingAnnotation !== requestedAnnotation
          || pendingAnnotation.compositionId !== essay.id
          || pendingAnnotation.startOffset !== selection.startOffset
          || pendingAnnotation.endOffset !== selection.endOffset) return;
      if (!dom.noteTranslation.value.trim()) dom.noteTranslation.value = explanation.translationZh || '';
      if (!dom.notePersonalText.value.trim() && explanation.memoryHint) {
        dom.notePersonalText.value = explanation.memoryHint;
      }
      setExplanationLoading(false, '已根据本篇语境填入释义；你可以按自己的理解改写。');
    } catch (error) {
      if (handleExpiredSession(error)) return;
      if (!requestedAnnotation
          || pendingAnnotation !== requestedAnnotation
          || pendingAnnotation.compositionId !== essay.id
          || pendingAnnotation.startOffset !== selection.startOffset
          || pendingAnnotation.endOffset !== selection.endOffset) return;
      setExplanationLoading(
        false,
        error instanceof ApiError && error.status === 428
          ? '请先在右上角「AI 设置」配置自己的 API Key；仍可手动填写。'
          : error instanceof ApiError && (error.status === 503 || error.status === 429)
          ? `${error.message || '语境翻译暂不可用。'} 仍可手动填写释义或记忆提示。`
          : '暂时无法取得语境释义；仍可手动填写释义或记忆提示。'
      );
    }
  }

  function openNoteDialog({ kind, selectedText, startOffset, endOffset, context }) {
    const essay = currentEssay();
    if (!essay) return;
    const existing = annotationAtRange(essay, startOffset, endOffset);
    pendingAnnotation = {
      compositionId: essay.id,
      contentVersion: essay.contentVersion,
      kind,
      selectedText,
      startOffset,
      endOffset
    };
    dom.noteForm.reset();
    dom.noteFormError.textContent = '';
    dom.noteKind.value = kind;
    dom.noteStartOffset.value = String(startOffset);
    dom.noteEndOffset.value = String(endOffset);
    dom.noteContentVersion.value = String(essay.contentVersion);
    dom.noteKindLabel.textContent = kind === 'word' ? 'WORD NOTE' : 'PHRASE NOTE';
    dom.noteSelectedText.textContent = selectedText;
    dom.noteContext.textContent = context ? `语境：${context}` : '语境：本篇范文中的当前用法。';
    dom.noteTranslation.value = existing ? existing.translationZh : '';
    dom.notePersonalText.value = existing ? existing.note : '';
    setExplanationLoading(
      false,
      existing && existing.translationZh
        ? '已载入这条摘录的释义；你可以按自己的理解改写。'
        : '正在准备语境翻译；你也可以按自己的理解修改。'
    );
    openDialog(dom.noteDialog);
    window.setTimeout(() => dom.noteTranslation.focus(), 0);
    if (!existing || !existing.translationZh) {
      void fillNoteExplanation(essay, pendingAnnotation);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    const pending = pendingAnnotation;
    const essay = currentEssay();
    if (!pending || !essay || pending.compositionId !== essay.id) {
      dom.noteFormError.textContent = '选中位置已经失效，请回到正文重新选择。';
      return;
    }
    const translationZh = dom.noteTranslation.value.trim();
    const note = dom.notePersonalText.value.trim();
    if (!translationZh && !note) {
      dom.noteFormError.textContent = '请至少写下中文释义或自己的记忆提示。';
      dom.noteTranslation.focus();
      return;
    }

    setButtonBusy(dom.saveNoteButton, true, '保存到本篇笔记');
    dom.noteFormError.textContent = '';
    try {
      const saved = normalizeAnnotation(await api.saveAnnotation(pending.compositionId, {
        startOffset: pending.startOffset,
        endOffset: pending.endOffset,
        kind: pending.kind,
        translationZh: translationZh || null,
        note: note || null,
        contentVersion: pending.contentVersion
      }));
      const existingIndex = essay.annotations.findIndex((annotation) => annotation.id === saved.id);
      if (existingIndex >= 0) essay.annotations.splice(existingIndex, 1, saved);
      else essay.annotations.push(saved);
      closeDialog(dom.noteDialog);
      pendingAnnotation = null;
      hidePhraseAction();
      renderAll();
      void refreshEssayList();
      showToast(existingIndex >= 0 ? '这条摘录已经更新。' : '已保存到本篇笔记。');
    } catch (error) {
      if (!handleExpiredSession(error)) dom.noteFormError.textContent = errorMessage(error, '笔记暂时没有保存成功。');
    } finally {
      setButtonBusy(dom.saveNoteButton, false, '保存到本篇笔记');
    }
  }

  function selectionOffsets(range) {
    const before = range.cloneRange();
    before.selectNodeContents(dom.essayBody);
    before.setEnd(range.startContainer, range.startOffset);
    const raw = range.toString();
    const candidate = getEnglishPhraseCandidate(raw);
    if (!candidate) return null;
    const startOffset = before.toString().length + candidate.leadingTrimLength;
    return {
      selectedText: candidate.selectedText,
      startOffset,
      endOffset: startOffset + candidate.selectedText.length,
      wordCount: candidate.wordCount
    };
  }

  function selectionInsideEssay(selection) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    return dom.essayBody.contains(range.commonAncestorContainer);
  }

  function positionPhraseAction(range) {
    if (isMobileLayout()) {
      dom.phraseAction.style.removeProperty('top');
      dom.phraseAction.style.removeProperty('right');
      dom.phraseAction.style.removeProperty('bottom');
      dom.phraseAction.style.removeProperty('left');
      return;
    }
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width || rect.height);
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!rect.width) return;
    const actionWidth = dom.phraseAction.offsetWidth || 310;
    const top = Math.min(window.innerHeight - 56, Math.max(12, rect.bottom + 10));
    const left = Math.min(
      window.innerWidth - actionWidth - 14,
      Math.max(14, rect.left + (rect.width / 2) - (actionWidth / 2))
    );
    dom.phraseAction.style.top = `${top}px`;
    dom.phraseAction.style.left = `${left}px`;
    dom.phraseAction.style.right = 'auto';
    dom.phraseAction.style.bottom = 'auto';
  }

  function updatePhraseAction() {
    const selection = window.getSelection();
    if (!selectionInsideEssay(selection)) {
      hidePhraseAction();
      return;
    }
    const range = selection.getRangeAt(0);
    const selectionData = selectionOffsets(range);
    if (!selectionData || !isEnglishPhraseSelection(selectionData.selectedText)) {
      hidePhraseAction();
      return;
    }
    hideMobileWordAction();
    pendingPhrase = selectionData;
    dom.phraseActionLabel.textContent = `已选中 ${selectionData.wordCount} 个词`;
    dom.explainPhraseButton.textContent = '记录短语';
    dom.explainPhraseButton.setAttribute('aria-label', '记录选中的短语');
    dom.phraseAction.hidden = false;
    positionPhraseAction(range);
  }

  function hidePhraseAction() {
    window.clearTimeout(phraseActionTimer);
    dom.phraseAction.hidden = true;
    dom.phraseAction.removeAttribute('style');
    pendingPhrase = null;
  }

  function hideMobileWordAction() {
    mobileWordRequestId += 1;
    pendingMobileWord = null;
    if (mobileWordNode) mobileWordNode.classList.remove('mobile-word-active');
    mobileWordNode = null;
    dom.mobileWordAction.hidden = true;
  }

  function openMobileWordAction(wordNode) {
    const essay = currentEssay();
    if (!essay) return;
    const startOffset = Number(wordNode.dataset.start);
    const endOffset = Number(wordNode.dataset.end);
    const selectedText = essay.content.slice(startOffset, endOffset);
    const existing = annotationAtRange(essay, startOffset, endOffset);
    const cacheKey = explanationCacheKey(essay, startOffset, endOffset);
    const cachedExplanation = explanationCache.get(cacheKey);
    const hasExplanation = Boolean(existing?.translationZh || cachedExplanation || wordNode.dataset.ready === 'true');
    const actionState = getMobileWordActionState({
      hasSavedNote: Boolean(existing),
      hasExplanation,
      preloadPaused: dom.preloadStatus.dataset.state === 'paused'
    });
    const requestId = ++mobileWordRequestId;
    if (mobileWordNode && mobileWordNode !== wordNode) mobileWordNode.classList.remove('mobile-word-active');
    mobileWordNode = wordNode;
    mobileWordNode.classList.add('mobile-word-active');
    pendingMobileWord = {
      kind: 'word',
      selectedText,
      startOffset,
      endOffset,
      context: sourceSentence(essay.content, startOffset, endOffset)
    };
    dom.mobileWordTerm.textContent = selectedText;
    dom.mobileWordRecord.textContent = actionState.actionLabel;
    dom.mobileWordStatus.textContent = actionState.helperText;
    dom.mobileWordMeaning.textContent = existing?.translationZh || (hasExplanation ? '正在读取语境释义…' : actionState.helperText);
    dom.mobileWordAction.hidden = false;

    const explanation = cachedExplanation || (actionState.shouldRequestExplanation
      ? requestExplanation(essay, { kind: 'word', startOffset, endOffset })
      : null);
    if (!explanation) return;
    void explanation.then((result) => {
      if (requestId !== mobileWordRequestId || mobileWordNode !== wordNode) return;
      const translation = result.translationZh || '暂未返回中文释义。';
      wordNode.dataset.gloss = translation;
      wordNode.dataset.ready = 'true';
      dom.mobileWordMeaning.textContent = translation;
      dom.mobileWordStatus.textContent = '已加载本篇语境释义。';
    }).catch((error) => {
      if (requestId !== mobileWordRequestId || mobileWordNode !== wordNode || handleExpiredSession(error)) return;
      const message = error instanceof ApiError && (error.status === 428 || error.status === 429 || error.status === 503)
        ? error.message || '语境释义暂不可用。'
        : '暂时无法取得语境释义。';
      wordNode.dataset.gloss = '点击收录后可手动填写释义。';
      dom.mobileWordMeaning.textContent = '暂时无法取得语境释义。';
      dom.mobileWordStatus.textContent = `${message} 你仍可手动收录并填写释义。`;
    });
  }

  function openMobileWordNote() {
    const pending = pendingMobileWord;
    if (!pending) return;
    hideMobileWordAction();
    openNoteDialog(pending);
  }

  function openMobileMenu() {
    if (dom.mobileMenuDialog.open) return;
    openDialog(dom.mobileMenuDialog);
    dom.mobileMenuButton.setAttribute('aria-expanded', 'true');
  }

  function closeMobileMenu() {
    if (dom.mobileMenuDialog.open) closeDialog(dom.mobileMenuDialog);
    dom.mobileMenuButton.setAttribute('aria-expanded', 'false');
  }

  function openSelectedPhrase() {
    const essay = currentEssay();
    if (!essay || !pendingPhrase) return;
    const phrase = pendingPhrase;
    hidePhraseAction();
    hideMobileWordAction();
    openNoteDialog({
      kind: 'phrase',
      ...phrase,
      context: sourceSentence(essay.content, phrase.startOffset, phrase.endOffset)
    });
  }

  function handleWordActivation(wordNode) {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    const essay = currentEssay();
    if (!essay) return;
    if (isMobileLayout()) {
      hidePhraseAction();
      openMobileWordAction(wordNode);
      return;
    }
    const startOffset = Number(wordNode.dataset.start);
    const endOffset = Number(wordNode.dataset.end);
    const selectedText = essay.content.slice(startOffset, endOffset);
    openNoteDialog({
      kind: 'word',
      selectedText,
      startOffset,
      endOffset,
      context: sourceSentence(essay.content, startOffset, endOffset)
    });
  }

  function beginWordHover(wordNode) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const essay = currentEssay();
    if (!essay) return;
    window.clearTimeout(hoverTimer);
    hoveredWordNode = wordNode;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const selectionData = {
      kind: 'word',
      startOffset: Number(wordNode.dataset.start),
      endOffset: Number(wordNode.dataset.end)
    };
    const cachedExplanation = explanationCache.get(explanationCacheKey(
      essay,
      selectionData.startOffset,
      selectionData.endOffset
    ));
    if (!cachedExplanation) {
      wordNode.dataset.gloss = dom.preloadStatus.dataset.state === 'paused'
        ? '此词尚未加载，可在上方重试或点击手动记录。' : '正在预加载此词，完成后会自动显示释义。';
      return;
    }
    if (wordNode.dataset.ready === 'true') return;
    wordNode.dataset.gloss = '正在读取语境释义…';
    hoverTimer = scheduleHoverExplanation({
      cachedExplanation,
      onRun: () => {
        void (cachedExplanation || requestExplanation(essay, selectionData))
        .then((explanation) => {
          if (hoveredWordNode === wordNode) wordNode.dataset.gloss = explanation.translationZh;
        })
        .catch((error) => {
          if (handleExpiredSession(error)) return;
          if (hoveredWordNode === wordNode) wordNode.dataset.gloss = '点击记录这条语境';
        });
      }
    });
  }

  function endWordHover(wordNode) {
    window.clearTimeout(hoverTimer);
    if (hoveredWordNode === wordNode) hoveredWordNode = null;
  }

  function focusNote(noteId) {
    const essay = currentEssay();
    const note = essay && essay.annotations.find((annotation) => annotation.id === noteId);
    if (!note) return;
    const target = dom.essayBody.querySelector(`[data-start="${note.startOffset}"]`);
    if (!target) {
      showToast('这个摘录在正文中的位置暂时无法定位。');
      return;
    }
    target.classList.remove('note-focus');
    void target.offsetWidth;
    target.classList.add('note-focus');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }

  async function removeNote(noteId) {
    const essay = currentEssay();
    const note = essay && essay.annotations.find((annotation) => annotation.id === noteId);
    if (!essay || !note) return;
    if (!window.confirm(`确定从本篇笔记中删除「${note.selectedText}」吗？`)) return;
    try {
      await api.deleteAnnotation(essay.id, note.id);
      essay.annotations = essay.annotations.filter((annotation) => annotation.id !== note.id);
      renderAll();
      void refreshEssayList();
      showToast('已从本篇笔记移除。');
    } catch (error) {
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '笔记暂时没有删除成功。'));
    }
  }

  async function removeEssay(essayId) {
    const essay = state.essays.find((item) => item.id === String(essayId));
    if (!essay) return;
    if (!window.confirm(`确定删除「${essay.title}」吗？范文及本篇摘录都会一起删除，且无法恢复。`)) return;
    try {
      await api.deleteComposition(essay.id);
      state.essays = state.essays.filter((item) => item.id !== essay.id);
      if (state.selectedId === essay.id) {
        state.selectedId = null;
        state.selectedEssay = null;
        pendingAnnotation = null;
        hidePhraseAction();
        dom.workspace.classList.remove('show-reader');
      }
      renderAll();
      showToast('范文及本篇摘录已删除。');
    } catch (error) {
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '范文暂时没有删除成功。'));
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2600);
  }

  function schedulePhraseAction() {
    window.clearTimeout(phraseActionTimer);
    const delay = isMobileLayout() ? 200 : 0;
    phraseActionTimer = window.setTimeout(() => {
      window.requestAnimationFrame(updatePhraseAction);
    }, delay);
  }

  function wireEvents() {
    dom.authModeButtons.forEach((button) => {
      button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
    });
    dom.forgotPasswordLink.addEventListener('click', () => {
      const email = dom.authEmail.value.trim();
      setAuthMode('reset');
      if (email) dom.authEmail.value = email;
      window.setTimeout(() => (dom.authEmail.value ? dom.authCode : dom.authEmail).focus(), 0);
    });
    dom.sendCodeButton.addEventListener('click', () => void requestVerificationCode());
    dom.authPasswordToggle.addEventListener('click', () => authPasswordVisibility.toggle());
    dom.authForm.addEventListener('submit', (event) => void submitAuth(event));
    dom.logoutButton.addEventListener('click', () => void logout());
    dom.mobileMenuButton.addEventListener('click', openMobileMenu);
    dom.mobileMenuClose.addEventListener('click', closeMobileMenu);
    dom.mobileMenuDialog.addEventListener('close', () => dom.mobileMenuButton.setAttribute('aria-expanded', 'false'));
    dom.mobileAiSettingsButton.addEventListener('click', () => {
      closeMobileMenu();
      void aiSettings.open();
    });
    dom.mobileLogoutButton.addEventListener('click', () => {
      closeMobileMenu();
      void logout();
    });
    dom.newEssayButton.addEventListener('click', openEssayDialog);
    document.querySelector('#edit-essay-button').addEventListener('click', openEditEssayDialog);
    dom.preloadRetry.addEventListener('click', () => void retryPreload());
    document.querySelectorAll('[data-open-new-essay]').forEach((button) => button.addEventListener('click', openEssayDialog));
    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = document.querySelector(`#${button.dataset.closeDialog}`);
        if (dialog === dom.noteDialog) {
          pendingAnnotation = null;
          setExplanationLoading(false, '正在准备语境翻译；你也可以按自己的理解修改。');
        }
        closeDialog(dialog);
      });
    });
    dom.noteDialog.addEventListener('cancel', () => {
      pendingAnnotation = null;
      setExplanationLoading(false, '正在准备语境翻译；你也可以按自己的理解修改。');
    });
    dom.essayForm.addEventListener('submit', (event) => void saveEssay(event));
    dom.noteForm.addEventListener('submit', (event) => void saveNote(event));
    dom.backToLibrary.addEventListener('click', () => {
      hidePhraseAction();
      hideMobileWordAction();
      dom.workspace.classList.remove('show-reader');
    });
    dom.notesToggle.addEventListener('click', toggleNotes);

    dom.essayList.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-essay]');
      if (deleteButton) {
        void removeEssay(deleteButton.dataset.deleteEssay);
        return;
      }
      const row = event.target.closest('[data-open-essay]');
      if (row) void selectEssay(row.dataset.openEssay);
    });
    dom.essayBody.addEventListener('click', (event) => {
      const wordNode = event.target.closest('.essay-word');
      if (wordNode) handleWordActivation(wordNode);
    });
    dom.essayBody.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.essay-word')) {
        event.preventDefault();
        handleWordActivation(event.target.closest('.essay-word'));
      }
    });
    dom.essayBody.addEventListener('pointerover', (event) => {
      const wordNode = event.target.closest('.essay-word');
      if (wordNode) beginWordHover(wordNode);
    });
    dom.essayBody.addEventListener('pointerout', (event) => {
      const wordNode = event.target.closest('.essay-word');
      if (wordNode) endWordHover(wordNode);
    });
    dom.essayNotes.addEventListener('click', (event) => {
      const focusButton = event.target.closest('[data-focus-note]');
      const removeButton = event.target.closest('[data-remove-note]');
      if (focusButton) focusNote(focusButton.dataset.focusNote);
      if (removeButton) void removeNote(removeButton.dataset.removeNote);
    });

    dom.phraseAction.addEventListener('mousedown', (event) => event.preventDefault());
    dom.explainPhraseButton.addEventListener('click', openSelectedPhrase);
    dom.mobileWordClose.addEventListener('click', hideMobileWordAction);
    dom.mobileWordRecord.addEventListener('click', openMobileWordNote);
    document.addEventListener('selectionchange', schedulePhraseAction);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !dom.phraseAction.hidden) hidePhraseAction();
    });
    window.addEventListener('resize', () => {
      if (!isMobileLayout()) dom.workspace.classList.remove('show-reader');
      if (!isMobileLayout()) notesCollapsed = false;
      renderNotesVisibility();
      const selection = window.getSelection();
      if (selectionInsideEssay(selection)) updatePhraseAction();
    });
  }

  async function bootstrap() {
    wireEvents();
    setAuthMode('login', false);
    if (!api.getToken()) {
      showAuthGate();
      return;
    }
    try {
      state.currentUser = await api.currentUser();
      showApp();
    } catch (error) {
      api.clearToken();
      showAuthGate('登录状态已失效，请重新登录。');
    }
  }

  const authPasswordVisibility = passwordVisibilityModule.createPasswordVisibilityController({
    input: dom.authPassword,
    button: dom.authPasswordToggle
  });
  const wordbook = window.Wordbook.init({
    api,
    onUnauthorized: () => showAuthGate('登录状态已失效，请重新登录。'),
    onOpenComposition: (id) => switchView('compositions', String(id))
  });
  const aiSettings = window.AiSettings.init({
    api,
    onUnauthorized: () => showAuthGate('登录状态已失效，请重新登录。'),
    onChanged: () => { translationUnavailableUntil = 0; if (currentEssay()) void retryPreload(); }
  });
  document.querySelectorAll('[data-site-view]').forEach(button => {
    button.addEventListener('click', () => {
      if (state.currentUser && !dom.logoutButton.disabled) switchView(button.dataset.siteView);
    });
  });

  void bootstrap();
})();
