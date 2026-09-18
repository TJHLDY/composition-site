(function exposeOnboardingGuide(root, factory) {
  const guide = factory();
  if (typeof module === 'object' && module.exports) module.exports = guide;
  if (root) root.VocabNoteOnboarding = guide;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOnboardingGuideModule() {
  'use strict';

  const AUTO_STATUSES = new Set(['not_started', 'in_progress']);
  const STEPS = Object.freeze(['wordbook', 'composition', 'preload', 'annotation', 'complete']);
  const STEP_COPY = Object.freeze({
    wordbook: {
      eyebrow: '第 1 步 · 收下一条表达',
      title: '从一个词开始',
      copy: '在搜索框输入 explore，或换成你真正想查的词。按回车后，选择一个释义，再把它收进单词本。'
    },
    composition: {
      eyebrow: '第 2 步 · 留下一篇范文',
      title: '让单词有语境',
      copy: '新建一篇范文并保存。示例内容可以直接修改成自己的材料。'
    },
    preload: {
      eyebrow: '第 3 步 · 准备阅读',
      title: '正在预加载重点词',
      copy: '保存后会自动准备语境释义。需要 AI 配置时，我会只引导你完成这一步。'
    },
    annotation: {
      eyebrow: '第 4 步 · 读进自己的笔记',
      title: '点一个单词，留下理解',
      copy: '点击已准备好的单词，写下释义或记忆提示，然后保存到本篇笔记。'
    },
    complete: {
      eyebrow: '完成 · 继续积累',
      title: '第一轮学习已经完成',
      copy: '长按或拖动连续文字，也可以把短语一起收录。以后可在学习设置中重新查看教程。'
    }
  });

  function identifier(value) {
    return value === undefined || value === null || value === '' ? null : String(value);
  }

  function shouldAutoStart(view) {
    return Boolean(view && view.autoStart === true && AUTO_STATUSES.has(view.coreStatus));
  }

  function createGuideState(view = {}, options = {}) {
    return {
      mode: options.mode === 'manual' ? 'manual' : 'auto',
      step: 'wordbook',
      wordbookId: identifier(view.tutorialWordbookId),
      compositionId: identifier(view.tutorialCompositionId),
      tutorialVersion: Number.isInteger(Number(view.tutorialVersion)) ? Number(view.tutorialVersion) : 1
    };
  }

  function reduceGuide(state, event = {}) {
    const current = state || createGuideState();
    const type = event.type;
    if (type === 'close') return { ...current, step: 'wordbook' };
    if (type === 'skip') return { ...current, step: 'skipped' };
    if (type === 'restart-wordbook') {
      return { ...current, step: 'wordbook', wordbookId: null, compositionId: null };
    }

    if (current.step === 'wordbook') {
      if (type === 'resume-saved-wordbook' && current.wordbookId) {
        return { ...current, step: 'composition' };
      }
      if (type === 'wordbook-saved' && !current.wordbookId) {
        const entryId = identifier(event.entryId);
        return entryId ? { ...current, step: 'composition', wordbookId: entryId } : current;
      }
    }

    if (current.step === 'composition') {
      if (type === 'resume-saved-composition' && current.compositionId) {
        return { ...current, step: 'preload' };
      }
      if (type === 'composition-saved' && !current.compositionId) {
        const compositionId = identifier(event.compositionId);
        return compositionId ? { ...current, step: 'preload', compositionId } : current;
      }
    }

    if (current.step === 'preload' && type === 'preload-ready') {
      const compositionId = identifier(event.compositionId);
      if (!compositionId || !current.compositionId || compositionId === current.compositionId) {
        return { ...current, step: 'annotation' };
      }
    }

    if (current.step === 'annotation' && type === 'annotation-saved' && identifier(event.annotationId)) {
      return { ...current, step: 'complete' };
    }
    return current;
  }

  function guideMarkup() {
    return `
      <section id="onboarding-layer" class="onboarding-layer" hidden aria-label="VocabNote 新手教程" data-step="wordbook">
        <div class="onboarding-scrim" data-onboarding-scrim="top" aria-hidden="true"></div>
        <div class="onboarding-scrim" data-onboarding-scrim="right" aria-hidden="true"></div>
        <div class="onboarding-scrim" data-onboarding-scrim="bottom" aria-hidden="true"></div>
        <div class="onboarding-scrim" data-onboarding-scrim="left" aria-hidden="true"></div>
        <div class="onboarding-target-ring" aria-hidden="true"></div>
        <p class="onboarding-target-note" id="onboarding-target-note" role="status" hidden><span aria-hidden="true">↳</span><span data-onboarding-cue></span></p>
        <p id="onboarding-scroll-hint" class="onboarding-scroll-hint" role="status" hidden><span aria-hidden="true">↓</span><span data-onboarding-scroll-text>继续向下，点击收录</span></p>
        <aside class="onboarding-guidebar onboarding-card" role="region" aria-live="polite" aria-labelledby="onboarding-title">
          <div class="onboarding-guidebar-main">
            <p class="onboarding-eyebrow" id="onboarding-eyebrow"></p>
            <h2 id="onboarding-title"></h2>
            <p id="onboarding-copy"></p>
          </div>
          <div class="onboarding-guidebar-controls">
            <button class="onboarding-details-toggle" type="button" data-onboarding-action="toggle-details" aria-expanded="false" aria-controls="onboarding-guide-details">说明</button>
            <button class="onboarding-skip" type="button" data-onboarding-action="skip">跳过</button>
          </div>
          <div class="onboarding-progress-row" aria-label="教程进度">
            <div class="onboarding-progress" role="list">
              <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 1 步"></span>
              <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 2 步"></span>
              <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 3 步"></span>
              <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 4 步"></span>
              <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="完成"></span>
            </div>
          </div>
          <div class="onboarding-guide-details" id="onboarding-guide-details">
            <p class="onboarding-status" id="onboarding-status" role="status"></p>
            <div class="onboarding-card-actions" id="onboarding-card-actions"></div>
          </div>
        </aside>
      </section>`;
  }

  function isElement(value) {
    return Boolean(value && value.nodeType === 1);
  }

  function resolveElement(value, document) {
    if (typeof value === 'string') return document.querySelector(value);
    return isElement(value) ? value : null;
  }

  function guideStepIndex(step) {
    const index = STEPS.indexOf(step);
    return index === -1 ? 0 : index;
  }

  function defaultActions(state) {
    if (state.step === 'wordbook' && state.wordbookId) {
      return [
        { action: 'resume-wordbook', label: '继续上次教程', tone: 'primary' },
        { action: 'restart-wordbook', label: '重新开始教程', tone: 'secondary' }
      ];
    }
    if (state.step === 'composition' && state.compositionId) {
      return [{ action: 'resume-composition', label: '继续使用已保存范文', tone: 'secondary' }];
    }
    if (state.step === 'complete') {
      return [{ action: 'dismiss-tip', label: '知道了', tone: 'secondary' }];
    }
    return [];
  }

  function createOnboardingController(options = {}) {
    const document = options.document || (typeof globalThis !== 'undefined' ? globalThis.document : null);
    if (!document || !document.body) throw new Error('A browser document is required for the onboarding guide.');
    const window = options.window || document.defaultView || globalThis;
    const existingLayer = document.querySelector('#onboarding-layer');
    if (existingLayer) existingLayer.remove();
    document.body.insertAdjacentHTML('beforeend', guideMarkup());

    const layer = document.querySelector('#onboarding-layer');
    const ring = layer.querySelector('.onboarding-target-ring');
    const guidebar = layer.querySelector('.onboarding-guidebar');
    const targetNote = layer.querySelector('#onboarding-target-note');
    const cue = layer.querySelector('[data-onboarding-cue]');
    const scrollHint = layer.querySelector('#onboarding-scroll-hint');
    const scrollHintText = layer.querySelector('[data-onboarding-scroll-text]');
    const scrims = Object.fromEntries(
      [...layer.querySelectorAll('[data-onboarding-scrim]')].map(scrim => [scrim.dataset.onboardingScrim, scrim])
    );
    const eyebrow = layer.querySelector('#onboarding-eyebrow');
    const title = layer.querySelector('#onboarding-title');
    const copy = layer.querySelector('#onboarding-copy');
    const status = layer.querySelector('#onboarding-status');
    const actions = layer.querySelector('#onboarding-card-actions');
    const progress = [...layer.querySelectorAll('.onboarding-progress-marker')];

    let state = null;
    let active = false;
    let locked = true;
    let activeTarget = null;
    let allowedTargets = [];
    let instruction = {};
    let actionBusy = false;
    let animationFrame = null;
    let visibilityFrame = null;
    let guidebarExpanded = false;

    function snapshot() {
      return state ? { ...state } : null;
    }

    function moveLayerToTargetContext(target = activeTarget) {
      const dialog = target?.closest?.('dialog[open]');
      const host = dialog || document.body;
      if (layer.parentElement !== host) host.appendChild(layer);
    }

    function clearTarget() {
      if (activeTarget) activeTarget.classList.remove('onboarding-target-active');
      activeTarget = null;
      ring.hidden = true;
      targetNote.hidden = true;
      ring.removeAttribute('style');
      layer.dataset.keyboardOpen = 'false';
      layer.removeAttribute('data-guidebar-placement');
      layer.style.removeProperty('--onboarding-guidebar-top');
      hideScrimPanels();
      moveLayerToTargetContext(null);
    }

    function detach() {
      clearTarget();
      allowedTargets = [];
    }

    function setScrimPanel(name, left, top, width, height) {
      const panel = scrims[name];
      if (!panel) return;
      const visible = width > 0 && height > 0;
      panel.hidden = !visible;
      if (!visible) return;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.width = `${Math.ceil(width)}px`;
      panel.style.height = `${Math.ceil(height)}px`;
    }

    function positionScrimPanels(rect) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (!rect) {
        setScrimPanel('top', 0, 0, viewportWidth, viewportHeight);
        setScrimPanel('right', 0, 0, 0, 0);
        setScrimPanel('bottom', 0, 0, 0, 0);
        setScrimPanel('left', 0, 0, 0, 0);
        return;
      }

      const left = Math.max(0, Math.min(viewportWidth, rect.left));
      const top = Math.max(0, Math.min(viewportHeight, rect.top));
      const right = Math.max(left, Math.min(viewportWidth, rect.right));
      const bottom = Math.max(top, Math.min(viewportHeight, rect.bottom));
      setScrimPanel('top', 0, 0, viewportWidth, top);
      setScrimPanel('right', right, top, viewportWidth - right, bottom - top);
      setScrimPanel('bottom', 0, bottom, viewportWidth, viewportHeight - bottom);
      setScrimPanel('left', 0, top, left, bottom - top);
    }

    function hideScrimPanels() {
      Object.values(scrims).forEach(panel => { panel.hidden = true; });
    }

    function renderGuidebar() {
      const expanded = guidebarExpanded || actions.childElementCount > 0;
      layer.dataset.guidebarExpanded = String(expanded);
      const toggle = guidebar.querySelector('[data-onboarding-action="toggle-details"]');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? '收起' : '说明';
    }

    function positionGuidebarForTarget(rect) {
      layer.removeAttribute('data-guidebar-placement');
      layer.style.removeProperty('--onboarding-guidebar-top');
      const guidebarRect = guidebar.getBoundingClientRect();
      const overlapsHorizontally = rect.left < guidebarRect.right && rect.right > guidebarRect.left;
      const occupiesHeader = rect.top < guidebarRect.bottom + 12 && rect.bottom <= 140;
      if (occupiesHeader && overlapsHorizontally) {
        layer.dataset.guidebarPlacement = 'below-target';
        layer.style.setProperty('--onboarding-guidebar-top', `${Math.ceil(rect.bottom + 12)}px`);
      }
    }

    function positionTargetNote(rect) {
      if (!rect || !cue.textContent) {
        targetNote.hidden = true;
        return;
      }
      if (layer.dataset.guidebarPlacement === 'below-target') {
        targetNote.hidden = true;
        return;
      }
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const noteWidth = Math.min(220, Math.max(120, rect.width));
      const left = Math.max(12, Math.min(viewportWidth - noteWidth - 12, rect.left));
      const below = rect.bottom + 12;
      const top = below + 36 >= viewportHeight ? Math.max(12, rect.top - 40) : below;
      targetNote.hidden = false;
      targetNote.style.width = `${Math.round(noteWidth)}px`;
      targetNote.style.left = `${Math.round(left)}px`;
      targetNote.style.top = `${Math.round(top)}px`;
    }

    function ensureTargetVisible() {
      if (!active || !activeTarget?.isConnected) return;
      if (layer.dataset.guidebarPlacement === 'below-target') return;
      const targetRect = activeTarget.getBoundingClientRect();
      const guidebarRect = guidebar.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const blockedAtTop = targetRect.top < guidebarRect.bottom + 18;
      const outsideBottom = targetRect.bottom > viewportHeight - 18;
      if ((blockedAtTop || outsideBottom) && typeof activeTarget.scrollIntoView === 'function') {
        activeTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }
    }

    function positionTarget() {
      if (!active || !activeTarget || !activeTarget.isConnected) {
        ring.hidden = true;
        targetNote.hidden = true;
        hideScrimPanels();
        return;
      }
      moveLayerToTargetContext(activeTarget);
      const rect = activeTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        ring.hidden = true;
        targetNote.hidden = true;
        hideScrimPanels();
        return;
      }
      const padding = 7;
      const width = Math.max(44, rect.width + padding * 2);
      const height = Math.max(44, rect.height + padding * 2);
      ring.hidden = false;
      ring.style.width = `${Math.ceil(width)}px`;
      ring.style.height = `${Math.ceil(height)}px`;
      ring.style.left = `${Math.round(rect.left + rect.width / 2 - width / 2)}px`;
      ring.style.top = `${Math.round(rect.top + rect.height / 2 - height / 2)}px`;
      hideScrimPanels();
      positionGuidebarForTarget(rect);
      positionTargetNote(rect);
    }

    function schedulePosition() {
      if (!active || animationFrame !== null) return;
      const render = () => { animationFrame = null; positionTarget(); };
      animationFrame = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(render)
        : window.setTimeout(render, 0);
    }

    function setTarget(target) {
      const next = resolveElement(target, document);
      if (activeTarget === next) {
        schedulePosition();
        return;
      }
      clearTarget();
      activeTarget = next;
      if (activeTarget) activeTarget.classList.add('onboarding-target-active');
      schedulePosition();
      if (visibilityFrame !== null) window.cancelAnimationFrame?.(visibilityFrame);
      visibilityFrame = window.requestAnimationFrame?.(() => {
        visibilityFrame = null;
        ensureTargetVisible();
      }) ?? window.setTimeout(() => ensureTargetVisible(), 0);
    }

    function setAllowedTargets(targets = []) {
      const values = Array.isArray(targets) ? targets : [targets];
      allowedTargets = values.map(target => resolveElement(target, document)).filter(Boolean);
    }

    function renderActions(nextActions) {
      actions.replaceChildren();
      nextActions.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.onboardingAction = item.action;
        button.className = item.tone === 'primary' ? 'primary-button' : 'secondary-button';
        button.textContent = item.label;
        actions.appendChild(button);
      });
    }

    function renderInstruction() {
      if (!state) return;
      const content = { ...STEP_COPY[state.step], ...instruction };
      const stepChanged = layer.dataset.step && layer.dataset.step !== state.step;
      layer.dataset.step = state.step;
      eyebrow.textContent = content.eyebrow || '';
      title.textContent = content.title || '';
      copy.textContent = content.copy || '';
      progress.forEach((marker, index) => {
        marker.classList.toggle('is-current', index === guideStepIndex(state.step));
        marker.classList.toggle('is-complete', index < guideStepIndex(state.step));
      });
      renderActions(content.actions || defaultActions(state));
      cue.textContent = content.cue || content.title || '';
      renderGuidebar();
      // 步骤切换时触发内容淡入动画
      if (stepChanged) {
        const main = guidebar.querySelector('.onboarding-guidebar-main');
        if (main) {
          main.classList.remove('is-transitioning');
          void main.offsetWidth; // 强制回流，重置动画
          main.classList.add('is-transitioning');
        }
      }
    }

    function setStatus(message = '') {
      status.textContent = message;
      if (message) guidebarExpanded = true;
      renderGuidebar();
    }

    function setScrollHint(visible, message = '继续向下，点击收录') {
      scrollHint.hidden = !visible;
      if (visible) scrollHintText.textContent = message;
    }

    function canInteract(element) {
      if (!active) return true;
      if (!locked) return true; // 非锁定模式（如预加载阶段）：允许自由操作
      if (!isElement(element)) return false;
      if (layer.contains(element) && element.closest('[data-onboarding-action]')) return true;
      if (element.closest('[data-onboarding-system-close]')) return true;
      return [activeTarget, ...allowedTargets].filter(Boolean).some(target => (
        target === element || target.contains(element) || element.contains(target)
      ));
    }

    function blockOutsideGuide(event) {
      if (!active || canInteract(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function keepGuideFocus(event) {
      if (!active || canInteract(event.target) || !activeTarget?.focus) return;
      window.setTimeout(() => activeTarget.focus({ preventScroll: true }), 0);
    }

    async function skip() {
      if (!active || actionBusy) return;
      actionBusy = true;
      try {
        state = reduceGuide(state, { type: 'skip' });
        deactivate();
        if (typeof options.onSkipped === 'function') options.onSkipped(snapshot());
        // 后台静默同步，失败不影响用户已关闭的引导
        if (state.mode === 'auto' && typeof options.onSkip === 'function') {
          options.onSkip(snapshot()).catch(err => console.warn('Onboarding skip sync failed:', err));
        }
      } finally {
        actionBusy = false;
      }
    }

    function deactivate({ keepTip = false } = {}) {
      active = false;
      locked = true;
      document.body.classList.remove('onboarding-active');
      clearTarget();
      allowedTargets = [];
      setScrollHint(false);
      hideScrimPanels();
      layer.classList.toggle('onboarding-tip-only', keepTip);
      layer.hidden = !keepTip;
      if (!keepTip) setStatus('');
    }

    function start(view = {}, settings = {}) {
      const initialView = settings.resetResources
        ? { ...view, tutorialWordbookId: null, tutorialCompositionId: null }
        : view;
      state = createGuideState(initialView, { mode: settings.mode });
      if (STEPS.includes(settings.step)) state = { ...state, step: settings.step };
      instruction = settings.instruction || {};
      guidebarExpanded = Boolean(instruction.expanded);
      active = true;
      layer.hidden = false;
      layer.classList.remove('onboarding-tip-only');
      hideScrimPanels();
      setScrollHint(false);
      document.body.classList.add('onboarding-active');
      renderInstruction();
      setStatus(settings.status || '');
      setTarget(settings.target || null);
      setAllowedTargets(settings.interactiveTargets);
      return snapshot();
    }

    function close() {
      if (!state) return null;
      state = reduceGuide(state, { type: 'close' });
      deactivate();
      if (typeof options.onClose === 'function') options.onClose(snapshot());
      return snapshot();
    }

    function dispatch(event, settings = {}) {
      if (!state) return null;
      state = reduceGuide(state, event);
      instruction = settings.instruction || {};
      guidebarExpanded = Boolean(instruction.expanded);
      renderInstruction();
      setStatus(settings.status || '');
      if (Object.hasOwn(settings, 'target')) setTarget(settings.target);
      if (Object.hasOwn(settings, 'interactiveTargets')) setAllowedTargets(settings.interactiveTargets);
      if (typeof options.onStateChange === 'function') options.onStateChange(snapshot(), event);
      return snapshot();
    }

    function showInstruction(nextInstruction = {}, target, settings = {}) {
      instruction = nextInstruction;
      guidebarExpanded = Boolean(instruction.expanded);
      renderInstruction();
      if (arguments.length > 1) setTarget(target);
      else schedulePosition();
      setAllowedTargets(settings.interactiveTargets);
    }

    function showCompletionTip(nextInstruction = {}) {
      if (!state) state = createGuideState({}, { mode: 'manual' });
      state = { ...state, step: 'complete' };
      instruction = nextInstruction;
      renderInstruction();
      deactivate({ keepTip: true });
      return snapshot();
    }

    function setSystemClose(target, allowed = true) {
      const element = resolveElement(target, document);
      if (!element) return;
      if (allowed) element.setAttribute('data-onboarding-system-close', '');
      else element.removeAttribute('data-onboarding-system-close');
    }

    function handleLayerAction(event) {
      const control = isElement(event.target) ? event.target.closest('[data-onboarding-action]') : null;
      if (!control || !layer.contains(control)) return;
      const action = control.dataset.onboardingAction;
      if (action === 'skip') {
        void skip();
        return;
      }
      if (action === 'toggle-details') {
        guidebarExpanded = !guidebarExpanded;
        renderGuidebar();
        ensureTargetVisible();
        schedulePosition();
        return;
      }
      if (action === 'dismiss-tip') {
        deactivate();
        return;
      }
      if (typeof options.onAction === 'function') options.onAction(action, snapshot());
    }

    layer.addEventListener('click', handleLayerAction);
    document.addEventListener('click', blockOutsideGuide, true);
    document.addEventListener('submit', blockOutsideGuide, true);
    document.addEventListener('keydown', blockOutsideGuide, true);
    document.addEventListener('focusin', keepGuideFocus, true);
    document.addEventListener('scroll', schedulePosition, true);
    window.addEventListener?.('resize', schedulePosition);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('scroll', schedulePosition);

    return {
      start,
      close,
      dispatch,
      getState: snapshot,
      setStatus,
      setScrollHint,
      setTarget,
      setLocked(value) { locked = Boolean(value); },
      detach,
      showInstruction,
      showCompletionTip,
      setSystemClose,
      isActive: () => active,
      destroy() {
        deactivate();
        if (animationFrame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(animationFrame);
        layer.removeEventListener('click', handleLayerAction);
        document.removeEventListener('click', blockOutsideGuide, true);
        document.removeEventListener('submit', blockOutsideGuide, true);
        document.removeEventListener('keydown', blockOutsideGuide, true);
        document.removeEventListener('focusin', keepGuideFocus, true);
        document.removeEventListener('scroll', schedulePosition, true);
        window.removeEventListener?.('resize', schedulePosition);
        window.visualViewport?.removeEventListener('resize', schedulePosition);
        window.visualViewport?.removeEventListener('scroll', schedulePosition);
        layer.remove();
      }
    };
  }

  return {
    createGuideState,
    createOnboardingController,
    guideMarkup,
    reduceGuide,
    shouldAutoStart
  };
});
