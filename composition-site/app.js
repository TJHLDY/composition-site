(() => {
  'use strict';

  const previewUtils = window.CompositionPreviewUtils;
  const apiModule = window.CompositionApiClient;
  const passwordVisibilityModule = window.PasswordVisibility;
  const onboardingModule = window.VocabNoteOnboarding;
  if (!previewUtils || !apiModule || !passwordVisibilityModule || !onboardingModule) {
    console.error('VocabNote 没有加载完整，请刷新页面后重试。');
    return;
  }

  const {
    getEnglishPhraseCandidate,
    getMobileWordActionState,
    isEnglishPhraseSelection,
    preloadNeedsAiSetup,
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
    cancelPasswordReset: document.querySelector('#cancel-password-reset'),
    rememberMe: document.querySelector('#remember-me'),
    rememberMeField: document.querySelector('#remember-me-field'),
    authSubmitButton: document.querySelector('#auth-submit-button'),
    authFormError: document.querySelector('#auth-form-error'),
    accountDisplayName: document.querySelector('#account-display-name'),
    logoutButton: document.querySelector('#logout-button'),
    learningGuideButton: document.querySelector('#learning-guide-button'),
    mobileMenuButton: document.querySelector('#mobile-menu-button'),
    mobileMenuDialog: document.querySelector('#mobile-menu-dialog'),
    mobileMenuClose: document.querySelector('#mobile-menu-close'),
    mobileAccountDisplayName: document.querySelector('#mobile-account-display-name'),
    mobileAiSettingsButton: document.querySelector('#mobile-ai-settings-button'),
    mobileLearningGuideButton: document.querySelector('#mobile-learning-guide-button'),
    mobileAiGuideButton: document.querySelector('#mobile-ai-guide-button'),
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
  let onboardingView = null;
  let onboardingRequestId = 0;
  let coreProgressBusy = false;
  let pendingCoreProgressRetry = null;
  let aiRequirementPromise = null;
  let aiRequirementRequestId = 0;
  let pendingAiRetry = null;
  let preloadAiResume = null;
  let temporaryAiGuide = false;
  let latestPreloadProgress = null;
  let activePreloadAiKey = null;
  let wordbookSaveScrollCleanup = null;

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
    dom.cancelPasswordReset.hidden = !isReset;
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

  function cancelPasswordReset() {
    const email = dom.authEmail.value.trim();
    setAuthMode('login');
    if (email) dom.authEmail.value = email;
    window.setTimeout(() => dom.authPassword.focus(), 0);
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
    onboarding.close();
    onboardingView = null;
    onboardingRequestId += 1;
    aiRequirementRequestId += 1;
    aiRequirementPromise = null;
    coreProgressBusy = false;
    pendingCoreProgressRetry = null;
    pendingAiRetry = null;
    preloadAiResume = null;
    temporaryAiGuide = false;
    latestPreloadProgress = null;
    activePreloadAiKey = null;
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
    void startAutomaticOnboarding();
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

  const ONBOARDING_SAMPLE_ESSAY = Object.freeze({
    title: 'Exploring the Universe',
    sourceLabel: 'VocabNote 示例 · 可修改',
    content: 'Exploring the universe helps us understand our place in the world. Each new discovery invites us to ask better questions and keep learning with curiosity.'
  });

  function emitOnboardingEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function activeGuideState() {
    return onboarding.isActive() ? onboarding.getState() : null;
  }

  function guideAt(step) {
    return activeGuideState()?.step === step;
  }

  function guideInstruction(step) {
    if (step === 'wordbook') {
      return {
        eyebrow: '第 1 步 · 收下一条表达',
        title: '先查一个真正想记住的词',
        copy: '搜索框里已经放入 explore。你可以直接查它，也可以改成自己的单词；按回车后再选择一个释义。',
        cue: '输入词或短语后查词'
      };
    }
    if (step === 'composition') {
      return {
        eyebrow: '第 2 步 · 留下一篇范文',
        title: '让单词回到语境里',
        copy: '点击加号，保存一篇范文。示例题目和内容都可以改成你的材料。',
        cue: '点击这里新建范文'
      };
    }
    if (step === 'preload') {
      return {
        eyebrow: '第 3 步 · 准备阅读',
        title: '正在预加载语境释义',
        copy: '范文已保存，词义会自动写入这篇范文。若需要 AI 配置，会在这里继续指引你。',
        cue: '等待预加载完成'
      };
    }
    return {
      eyebrow: '第 4 步 · 留下自己的理解',
      title: '点一个已准备好的单词',
      copy: '打开单词卡，补充释义或记忆提示，再保存到本篇笔记。',
      cue: '点击这个单词继续'
    };
  }

  function aiGuideInstruction() {
    return {
      eyebrow: 'AI 配置 · 完成后继续',
      title: '先测试，再保存',
      copy: '选择服务商并填写 API Key，先点击“测试连接”。测试成功后，才能保存并继续刚才的操作。',
      cue: '填写 Key 后先测试'
    };
  }

  function markOnboardingCloseControls(selector, allowed) {
    document.querySelectorAll(selector).forEach(control => onboarding.setSystemClose(control, allowed));
  }

  function clearWordbookSaveScrollCue() {
    wordbookSaveScrollCleanup?.();
    wordbookSaveScrollCleanup = null;
    onboarding.setScrollHint(false);
  }

  function guideWordbookSaveButton(saveButton) {
    clearWordbookSaveScrollCue();
    const editor = document.querySelector('#wb-editor');
    if (!editor || !saveButton) return;

    let frame = null;
    let autoScrolling = true;
    const updateScrollHint = () => {
      if (autoScrolling) return;
      const buttonRect = saveButton.getBoundingClientRect();
      const dialogRect = editor.getBoundingClientRect();
      onboarding.setScrollHint(buttonRect.top > dialogRect.bottom - 12);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      editor.removeEventListener('scroll', updateScrollHint);
      onboarding.setScrollHint(false);
    };
    wordbookSaveScrollCleanup = stop;
    editor.addEventListener('scroll', updateScrollHint, { passive: true });

    const dialogRect = editor.getBoundingClientRect();
    const buttonRect = saveButton.getBoundingClientRect();
    const startTop = editor.scrollTop;
    const targetTop = Math.max(0, Math.min(
      editor.scrollHeight - editor.clientHeight,
      startTop + buttonRect.bottom - dialogRect.bottom + 24
    ));
    const distance = targetTop - startTop;
    const duration = 900;
    const startedAt = performance.now();
    const animate = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      editor.scrollTop = startTop + distance * eased;
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
        return;
      }
      frame = null;
      autoScrolling = false;
      updateScrollHint();
    };
    frame = requestAnimationFrame(animate);
  }

  function startWordbookGuideStage() {
    const guide = activeGuideState();
    if (!guide || guide.step !== 'wordbook') return;
    if (guide.wordbookId) {
      onboarding.showInstruction({
        eyebrow: '继续上次的教程',
        title: '之前收录的内容还在',
        copy: '继续上次：直接进入下一步，不会新建词条。重新开始：会查新词，两者都不会删除已有词条。'
      }, null);
      return;
    }
    wordbook.beginGuidedSearch('explore');
    onboarding.showInstruction(guideInstruction('wordbook'), '#wb-search-form');
  }

  function startCompositionGuideStage() {
    const guide = activeGuideState();
    if (!guide || guide.step !== 'composition') return;
    if (guide.compositionId) {
      onboarding.showInstruction({
        eyebrow: '继续上次的教程',
        title: '之前保存的范文还在',
        copy: '继续使用这篇范文，预加载会从已有内容接着完成。'
      }, null);
      return;
    }
    onboarding.showInstruction(guideInstruction('composition'), '#new-essay-button');
  }

  function startPreloadGuideStage() {
    if (!guideAt('preload')) return;
    onboarding.setLocked(false); // 等待预加载时解除锁定，用户可自由浏览
    onboarding.showInstruction(guideInstruction('preload'), '#preload-status');
  }

  function startAnnotationGuideStage(target) {
    if (!guideAt('annotation')) return;
    onboarding.showInstruction(guideInstruction('annotation'), target || '.essay-word[data-ready="true"]');
  }

  function startCoreGuide(view, mode = 'auto') {
    temporaryAiGuide = false;
    onboardingView = view;
    pendingCoreProgressRetry = null;
    switchView('wordbook');
    onboarding.start(view, {
      mode,
      instruction: guideInstruction('wordbook'),
      target: view.tutorialWordbookId ? null : '#wb-search-form'
    });
    startWordbookGuideStage();
  }

  async function startAutomaticOnboarding() {
    const requestId = ++onboardingRequestId;
    try {
      const view = await api.getOnboarding();
      if (requestId !== onboardingRequestId || !state.currentUser) return;
      onboardingView = view;
      if (!onboardingModule.shouldAutoStart(view)) return;
      const started = await api.startOnboarding();
      if (requestId !== onboardingRequestId || !state.currentUser) return;
      startCoreGuide(started, 'auto');
    } catch (error) {
      if (!handleExpiredSession(error)) console.warn('Unable to load onboarding state.', error);
    }
  }

  async function startManualCoreGuide() {
    if (!state.currentUser) return;
    try {
      const view = await api.getOnboarding();
      onboardingView = view;
      startCoreGuide(view, 'manual');
    } catch (error) {
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '暂时无法打开新手教程。'));
    }
  }

  function once(callback) {
    let used = false;
    return async () => {
      if (used || typeof callback !== 'function') return;
      used = true;
      return callback();
    };
  }

  async function openAiSettings({ tutorial = false, resume = null } = {}) {
    const guideBeforeOpen = activeGuideState();
    const coreGuide = Boolean(guideBeforeOpen && !temporaryAiGuide);
    const resumeOnce = resume ? once(resume) : null;
    if (resumeOnce) pendingAiRetry = resumeOnce;
    const opening = aiSettings.open({
      tutorial,
      onSaved: async () => {
        const retry = pendingAiRetry;
        pendingAiRetry = null;
        preloadAiResume = null;
        activePreloadAiKey = null;
        if (onboarding.isActive()) onboarding.detach();
        if (retry) await retry();
        if (!tutorial || !onboarding.isActive()) return;
        markOnboardingCloseControls('#ai-settings-close', false);
        if (coreGuide) {
          const current = activeGuideState();
          if (current?.step === 'wordbook') startWordbookGuideStage();
          else if (current?.step === 'composition') startCompositionGuideStage();
          else if (current?.step === 'preload') startPreloadGuideStage();
          else if (current?.step === 'annotation') startAnnotationGuideStage();
        } else {
          onboarding.showCompletionTip({
            eyebrow: 'AI 配置完成',
            title: '已经可以继续学习',
            copy: '之后需要 AI 功能时，会直接使用这份配置。'
          });
          temporaryAiGuide = false;
        }
      },
      onClose: () => {
        pendingAiRetry = null;
        preloadAiResume = null;
        temporaryAiGuide = false;
        activePreloadAiKey = null;
        markOnboardingCloseControls('#ai-settings-close', false);
        if (onboarding.isActive()) onboarding.close();
      }
    });
    if (tutorial && coreGuide && onboarding.isActive()) {
      onboarding.showInstruction({ ...aiGuideInstruction(), cardPlacement: 'above' }, '#ai-key');
      onboarding.setSystemClose('#ai-settings-close', true);
    }
    const opened = await opening;
    if (!opened || !tutorial) return opened;
    if (!coreGuide) {
      temporaryAiGuide = true;
      onboarding.start({}, {
        mode: 'manual',
        resetResources: true,
        step: 'preload',
        instruction: aiGuideInstruction(),
        target: '#ai-key'
      });
    }
    onboarding.setSystemClose('#ai-settings-close', true);
    return true;
  }

  async function requireAi(detail = {}) {
    if (!state.currentUser) return false;
    if (detail.forceOpen) return openAiSettings({ tutorial: false, resume: detail.resume });
    if (aiRequirementPromise) return aiRequirementPromise;
    const requestId = ++aiRequirementRequestId;
    const requestingUser = state.currentUser;
    const guide = activeGuideState();
    const forceTutorial = Boolean(detail.forceTutorial || guide?.mode === 'auto' && guide.step === 'preload');
    aiRequirementPromise = (async () => {
      try {
        const claim = await api.claimAiGuide();
        if (requestId !== aiRequirementRequestId || state.currentUser !== requestingUser) return false;
        if (claim.show) return openAiSettings({ tutorial: true, resume: detail.resume });
        if (forceTutorial) return openAiSettings({ tutorial: true, resume: detail.resume });
        detail.showDirectAction?.();
        return false;
      } catch (error) {
        if (handleExpiredSession(error)) return false;
        detail.showDirectAction?.();
        return false;
      }
    })();
    try {
      return await aiRequirementPromise;
    } finally {
      if (requestId === aiRequirementRequestId) aiRequirementPromise = null;
    }
  }

  function showAiSettingsAction(container, resume) {
    if (!container || container.querySelector('[data-ai-settings-direct]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-link ai-settings-direct';
    button.dataset.aiSettingsDirect = 'true';
    button.textContent = '打开 AI 设置';
    button.addEventListener('click', () => void openAiSettings({ tutorial: false, resume }));
    container.append(document.createTextNode(' '), button);
  }

  function showCoreProgressRecovery(type, detail, error) {
    const retryDetail = { ...detail };
    pendingCoreProgressRetry = () => advanceCoreGuide(type, retryDetail);
    onboarding.showInstruction({
      eyebrow: '教程进度尚未确认',
      title: '刚才保存的内容还在',
      copy: '网络暂时不稳定。重新确认后会继续教程；也可以选择跳过教程。',
      actions: [{ action: 'retry-core-progress', label: '重新确认', tone: 'primary' }]
    }, null);
    onboarding.setStatus(error?.message || '教程进度暂时无法同步，请稍后再试。');
  }

  async function advanceCoreGuide(type, detail = {}) {
    const guide = activeGuideState();
    if (!guide || coreProgressBusy) return;
    if (type === 'wordbook' && (guide.step !== 'wordbook' || detail.editing || !detail.entryId)) return;
    if (type === 'composition' && (guide.step !== 'composition' || detail.editing || !detail.compositionId)) return;
    if (type === 'preload' && (guide.step !== 'preload' || String(guide.compositionId) !== String(detail.compositionId))) return;
    if (type === 'annotation' && (guide.step !== 'annotation' || detail.kind !== 'word' || !detail.annotationId)) return;

    pendingCoreProgressRetry = null;
    coreProgressBusy = true;
    onboarding.detach();
    try {
      onboarding.setStatus('正在确认教程进度…');
      if (type === 'wordbook') onboardingView = await api.recordOnboardingWordbook(detail.entryId);
      if (type === 'composition') onboardingView = await api.recordOnboardingComposition(detail.compositionId);
      if (type === 'annotation' && onboardingView?.coreStatus === 'in_progress') {
        onboardingView = await api.completeOnboarding(detail.annotationId);
      }

      if (type === 'wordbook') {
        onboarding.dispatch({ type: 'wordbook-saved', entryId: detail.entryId });
        switchView('compositions');
        startCompositionGuideStage();
      }
      if (type === 'composition') {
        onboarding.dispatch({ type: 'composition-saved', compositionId: detail.compositionId });
        startPreloadGuideStage();
        window.setTimeout(() => replayLatestPreloadProgress(), 0);
      }
      if (type === 'preload') {
        onboarding.setLocked(true); // 进入标注步骤时恢复引导锁定
        onboarding.dispatch({ type: 'preload-ready', compositionId: detail.compositionId });
        startAnnotationGuideStage(detail.target);
      }
      if (type === 'annotation') {
        onboarding.dispatch({ type: 'annotation-saved', annotationId: detail.annotationId }, { target: null });
        onboarding.showCompletionTip();
      }
    } catch (error) {
      if (!handleExpiredSession(error)) showCoreProgressRecovery(type, detail, error);
    } finally {
      coreProgressBusy = false;
    }
  }

  function handleGuideAction(action, guide) {
    if (action === 'retry-core-progress' && pendingCoreProgressRetry) {
      const retry = pendingCoreProgressRetry;
      pendingCoreProgressRetry = null;
      void retry();
      return;
    }
    if (!guide) return;
    if (action === 'restart-wordbook' && guide.wordbookId) {
      onboarding.dispatch({ type: 'restart-wordbook' });
      switchView('wordbook');
      wordbook.beginGuidedSearch('explore', { forcePreview: true });
      onboarding.showInstruction(guideInstruction('wordbook'), '#wb-search-form');
      showToast('已从第 1 步重新开始，之前收录的内容会保留。');
      return;
    }
    if (action === 'resume-wordbook' && guide.wordbookId) {
      onboarding.dispatch({ type: 'resume-saved-wordbook' });
      switchView('compositions');
      startCompositionGuideStage();
      showToast('已继续使用之前收录的词条。');
      return;
    }
    if (action === 'resume-composition' && guide.compositionId) {
      onboarding.dispatch({ type: 'resume-saved-composition' });
      switchView('compositions', guide.compositionId);
      startPreloadGuideStage();
      showToast('已继续使用之前保存的范文。');
    }
  }

  function wireOnboardingEvents() {
    document.addEventListener('vocabnote:wordbook-preview-ready', () => {
      const guide = activeGuideState();
      if (!guide || guide.step !== 'wordbook' || guide.wordbookId) return;
      onboarding.showInstruction({
        eyebrow: '第 1 步 · 选择要记的意思',
        title: '先打开收录页',
        copy: '这是一条真实的查询结果。点击“收录到单词本”，再从词典义项里选择一个最适合的解释。',
        cue: '点击收录到单词本'
      }, '#wordbook-view [data-action="collect"]');
    });
    document.addEventListener('vocabnote:wordbook-editor-opened', (event) => {
      const guide = activeGuideState();
      if (!guide || guide.step !== 'wordbook' || event.detail?.editing) return;
      markOnboardingCloseControls('#wb-editor [data-wb-close]', true);
      const target = document.querySelector('#wb-editor .wb-meaning-picker fieldset') || document.querySelector('#wb-translation');
      onboarding.showInstruction({
        eyebrow: '第 1 步 · 选择一个释义',
        title: '用你认同的意思收录',
        copy: '从这个词性下任选一个或多个义项。选择本身不会完成教程，确认后还要点击“收录到单词本”。',
        cardPlacement: 'above',
        cue: '可多选，选完再收录'
      }, target, { interactiveTargets: ['#wb-editor .wb-meaning-picker', '#wb-save'] });
    });
    document.addEventListener('vocabnote:wordbook-meaning-selected', (event) => {
      const guide = activeGuideState();
      if (!guide || guide.step !== 'wordbook') return;
      if (Number(event.detail?.count) < 1) {
        clearWordbookSaveScrollCue();
        return;
      }
      const saveButton = document.querySelector('#wb-save');
      onboarding.showInstruction({
        eyebrow: '第 1 步 · 保存到单词本',
        title: '现在把它留下来',
        copy: '你选中的释义会写入词条。点击收录，成功保存后才会进入下一步。',
        cardPlacement: 'above',
        cue: '点击收录，完成这一步'
      }, saveButton || '#wb-save', { interactiveTargets: ['#wb-editor .wb-meaning-picker', '#wb-save'] });
      guideWordbookSaveButton(saveButton);
    });
    document.addEventListener('vocabnote:wordbook-editor-closed', (event) => {
      clearWordbookSaveScrollCue();
      markOnboardingCloseControls('#wb-editor [data-wb-close]', false);
      if (!event.detail?.saved && guideAt('wordbook')) onboarding.close();
    });
    document.addEventListener('vocabnote:wordbook-saved', (event) => void advanceCoreGuide('wordbook', event.detail));
    document.addEventListener('vocabnote:composition-saved', (event) => void advanceCoreGuide('composition', event.detail));
    document.addEventListener('vocabnote:preload-ready', (event) => void advanceCoreGuide('preload', event.detail));
    document.addEventListener('vocabnote:mobile-word-action-opened', (event) => {
      if (!guideAt('annotation')) return;
      onboarding.showInstruction({
        eyebrow: '第 4 步 · 打开收录页',
        title: '继续收录这个单词',
        copy: '这条语境释义已经准备好了。点击“收录单词”，写下自己的理解。',
        cue: '点击收录单词'
      }, event.detail?.target || dom.mobileWordRecord);
    });
    document.addEventListener('vocabnote:annotation-saved', (event) => void advanceCoreGuide('annotation', event.detail));
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
    onboarding.close();
    onboardingView = null;
    onboardingRequestId += 1;
    aiRequirementRequestId += 1;
    aiRequirementPromise = null;
    coreProgressBusy = false;
    pendingCoreProgressRetry = null;
    pendingAiRetry = null;
    preloadAiResume = null;
    temporaryAiGuide = false;
    latestPreloadProgress = null;
    activePreloadAiKey = null;
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
    const submitButton = dom.essayForm.querySelector('button[type="submit"]');
    document.querySelector('#essay-dialog-title').textContent = '收进一篇范文';
    dom.essayForm.reset();
    dom.essayFormError.textContent = '';
    const guidedComposition = guideAt('composition');
    if (guidedComposition) {
      dom.essayTitle.value = ONBOARDING_SAMPLE_ESSAY.title;
      dom.essaySourceLabel.value = ONBOARDING_SAMPLE_ESSAY.sourceLabel;
      dom.essayContent.value = ONBOARDING_SAMPLE_ESSAY.content;
      markOnboardingCloseControls('[data-close-dialog="essay-dialog"]', true);
    }
    openDialog(dom.essayDialog);
    if (guidedComposition) {
      onboarding.showInstruction({
        eyebrow: '第 2 步 · 保存一篇范文',
        title: '确认后保存这篇范文',
        copy: '示例题目和正文已经写好；需要时可以直接修改。确认后点击“保存范文”，系统会立即预加载语境释义。',
        cardPlacement: 'above',
        cue: '确认后点击保存范文'
      }, submitButton, {
        interactiveTargets: [dom.essayForm]
      });
    }
    window.setTimeout(() => {
      (guidedComposition ? submitButton : dom.essayTitle).focus({ preventScroll: true });
    }, 0);
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
      emitOnboardingEvent('vocabnote:composition-saved', {
        compositionId: created.id,
        composition: created,
        editing: Boolean(editing)
      });
      markOnboardingCloseControls('[data-close-dialog="essay-dialog"]', false);
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

  function preloadProgressKey(essay) {
    return `${essay.id}:${essay.contentVersion}`;
  }

  function announcePreloadReady(essay, progress) {
    const readyTarget = progress.results
      .map(row => dom.essayBody.querySelector(`[data-start="${row.startOffset}"][data-end="${row.endOffset}"]`))
      .find(Boolean) || dom.essayBody.querySelector('.essay-word[data-ready="true"]');
    if (!readyTarget) return;
    emitOnboardingEvent('vocabnote:preload-ready', {
      compositionId: essay.id,
      contentVersion: essay.contentVersion,
      target: readyTarget
    });
  }

  function requestPreloadAiSetup(essay, progress) {
    if (!preloadNeedsAiSetup(progress)) return;
    const key = preloadProgressKey(essay);
    if (activePreloadAiKey === key) return;
    const activeGuide = activeGuideState();
    if (activeGuide && activeGuide.step !== 'preload') return;
    activePreloadAiKey = key;
    const detail = {
      source: 'preload',
      forceTutorial: guideAt('preload'),
      resume: () => retryPreload(),
      showDirectAction: () => {
        preloadAiResume = () => retryPreload();
        dom.preloadRetry.hidden = false;
        dom.preloadRetry.textContent = '打开 AI 设置';
      }
    };
    emitOnboardingEvent('vocabnote:ai-required', detail);
    void requireAi(detail);
  }

  function replayLatestPreloadProgress() {
    const essay = currentEssay();
    const snapshot = latestPreloadProgress;
    if (!essay || !snapshot
      || String(snapshot.essayId) !== String(essay.id)
      || snapshot.contentVersion !== essay.contentVersion) return;
    if (preloadNeedsAiSetup(snapshot.progress)) requestPreloadAiSetup(essay, snapshot.progress);
    if (snapshot.progress.done > 0 || snapshot.progress.results.length > 0) {
      announcePreloadReady(essay, snapshot.progress);
    }
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
        latestPreloadProgress = {
          essayId: essay.id,
          contentVersion: essay.contentVersion,
          progress
        };
        if (!preloadNeedsAiSetup(progress)) activePreloadAiKey = null;
        if (progress.status !== 'paused') {
          preloadAiResume = null;
          dom.preloadRetry.textContent = '重试未完成部分';
        }
        requestPreloadAiSetup(essay, progress);
        if (progress.done > 0 || progress.results.length > 0) announcePreloadReady(essay, progress);
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
    activePreloadAiKey = null;
    preloadAiResume = null;
    dom.preloadRetry.textContent = '重试未完成部分';
    try {
      await api.retryPreload(essay.id);
      if (currentEssay()?.id === essay.id) watchPreload(essay);
    } catch (error) {
      if (!handleExpiredSession(error)) showToast(errorMessage(error, '暂时无法重试。'));
    } finally { dom.preloadRetry.disabled = false; }
  }
  function setExplanationLoading(isLoading, message) {
    dom.explanationStatus.querySelector('[data-ai-settings-direct]')?.remove();
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
      const missingAi = error instanceof ApiError && error.status === 428;
      setExplanationLoading(
        false,
        missingAi
          ? '请先在右上角「AI 设置」配置自己的 API Key；仍可手动填写。'
          : error instanceof ApiError && (error.status === 503 || error.status === 429)
          ? `${error.message || '语境翻译暂不可用。'} 仍可手动填写释义或记忆提示。`
          : '暂时无法取得语境释义；仍可手动填写释义或记忆提示。'
      );
      if (missingAi) {
        const detail = {
          source: 'context',
          resume: () => fillNoteExplanation(essay, selection),
          showDirectAction: () => showAiSettingsAction(dom.explanationStatus, () => fillNoteExplanation(essay, selection))
        };
        emitOnboardingEvent('vocabnote:ai-required', detail);
        void requireAi(detail);
      }
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
    const guidedAnnotation = guideAt('annotation');
    if (guidedAnnotation) {
      markOnboardingCloseControls('#note-dialog [data-close-dialog]', true);
    }
    openDialog(dom.noteDialog);
    if (guidedAnnotation) {
      onboarding.showInstruction({
        eyebrow: '第 4 步 · 保存一条笔记',
        title: '写下你的理解',
        copy: '可以使用自动填入的释义，也可以改成自己的表达。至少填写一项后，保存到本篇笔记。',
        cardPlacement: 'above',
        cue: '填写释义或记忆提示'
      }, dom.noteTranslation);
    }
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
      emitOnboardingEvent('vocabnote:annotation-saved', {
        annotationId: saved.id,
        compositionId: essay.id,
        kind: saved.kind
      });
      markOnboardingCloseControls('#note-dialog [data-close-dialog]', false);
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

  function closeMobileWordAction() {
    hideMobileWordAction();
    if (guideAt('annotation')) onboarding.close();
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
    emitOnboardingEvent('vocabnote:mobile-word-action-opened', { target: dom.mobileWordRecord });

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
      const missingAi = error instanceof ApiError && error.status === 428;
      const message = error instanceof ApiError && (missingAi || error.status === 429 || error.status === 503)
        ? error.message || '语境释义暂不可用。'
        : '暂时无法取得语境释义。';
      wordNode.dataset.gloss = '点击收录后可手动填写释义。';
      dom.mobileWordMeaning.textContent = '暂时无法取得语境释义。';
      dom.mobileWordStatus.textContent = `${message} 你仍可手动收录并填写释义。`;
      if (missingAi) {
        const detail = {
          source: 'mobile-context',
          resume: () => openMobileWordAction(wordNode),
          showDirectAction: () => showAiSettingsAction(dom.mobileWordStatus, () => openMobileWordAction(wordNode))
        };
        emitOnboardingEvent('vocabnote:ai-required', detail);
        void requireAi(detail);
      }
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
    dom.cancelPasswordReset.addEventListener('click', cancelPasswordReset);
    dom.sendCodeButton.addEventListener('click', () => void requestVerificationCode());
    dom.authPasswordToggle.addEventListener('click', () => authPasswordVisibility.toggle());
    dom.authForm.addEventListener('submit', (event) => void submitAuth(event));
    dom.logoutButton.addEventListener('click', () => void logout());
    dom.learningGuideButton.addEventListener('click', () => void startManualCoreGuide());
    dom.mobileMenuButton.addEventListener('click', openMobileMenu);
    dom.mobileMenuClose.addEventListener('click', closeMobileMenu);
    dom.mobileMenuDialog.addEventListener('close', () => dom.mobileMenuButton.setAttribute('aria-expanded', 'false'));
    dom.mobileAiSettingsButton.addEventListener('click', () => {
      closeMobileMenu();
      void aiSettings.open();
    });
    dom.mobileLearningGuideButton.addEventListener('click', () => {
      closeMobileMenu();
      void startManualCoreGuide();
    });
    dom.mobileAiGuideButton.addEventListener('click', () => {
      closeMobileMenu();
      void openAiSettings({ tutorial: true });
    });
    dom.mobileLogoutButton.addEventListener('click', () => {
      closeMobileMenu();
      void logout();
    });
    dom.newEssayButton.addEventListener('click', openEssayDialog);
    document.querySelector('#edit-essay-button').addEventListener('click', openEditEssayDialog);
    dom.preloadRetry.addEventListener('click', () => {
      const resume = preloadAiResume;
      if (resume) {
        void openAiSettings({ tutorial: false, resume });
        return;
      }
      void retryPreload();
    });
    document.querySelectorAll('[data-open-new-essay]').forEach((button) => button.addEventListener('click', openEssayDialog));
    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = document.querySelector(`#${button.dataset.closeDialog}`);
        if (dialog === dom.noteDialog) {
          pendingAnnotation = null;
          setExplanationLoading(false, '正在准备语境翻译；你也可以按自己的理解修改。');
          if (guideAt('annotation')) onboarding.close();
        }
        if (dialog === dom.essayDialog && guideAt('composition')) {
          markOnboardingCloseControls('[data-close-dialog="essay-dialog"]', false);
          onboarding.close();
        }
        closeDialog(dialog);
      });
    });
    dom.essayDialog.addEventListener('cancel', () => {
      if (!guideAt('composition')) return;
      markOnboardingCloseControls('[data-close-dialog="essay-dialog"]', false);
      onboarding.close();
    });
    dom.noteDialog.addEventListener('cancel', () => {
      pendingAnnotation = null;
      setExplanationLoading(false, '正在准备语境翻译；你也可以按自己的理解修改。');
      if (guideAt('annotation')) onboarding.close();
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
    dom.mobileWordClose.addEventListener('click', closeMobileWordAction);
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
    onOpenComposition: (id) => switchView('compositions', String(id)),
    onRequireAi: (detail) => { void requireAi(detail); }
  });
  const aiSettings = window.AiSettings.init({
    api,
    onUnauthorized: () => showAuthGate('登录状态已失效，请重新登录。'),
    onChanged: () => {
      translationUnavailableUntil = 0;
      if (!pendingAiRetry && currentEssay()) void retryPreload();
    }
  });
  const onboarding = onboardingModule.createOnboardingController({
    onSkip: async () => { onboardingView = await api.skipOnboarding(); },
    onSkipped: () => { pendingCoreProgressRetry = null; },
    onClose: () => { pendingCoreProgressRetry = null; },
    onAction: handleGuideAction
  });
  wireOnboardingEvents();
  document.querySelectorAll('[data-site-view]').forEach(button => {
    button.addEventListener('click', () => {
      if (state.currentUser && !dom.logoutButton.disabled) switchView(button.dataset.siteView);
    });
  });

  void bootstrap();
})();
