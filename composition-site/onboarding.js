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
        <div class="onboarding-scrim" aria-hidden="true"></div>
        <div class="onboarding-target-ring" aria-hidden="true"></div>
        <aside class="onboarding-card" role="region" aria-live="polite" aria-labelledby="onboarding-title">
          <div class="onboarding-card-topline">
            <p class="onboarding-eyebrow" id="onboarding-eyebrow"></p>
            <button class="onboarding-skip" type="button" data-onboarding-action="skip">跳过教程</button>
          </div>
          <div class="onboarding-progress" role="list" aria-label="教程进度">
            <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 1 步"></span>
            <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 2 步"></span>
            <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 3 步"></span>
            <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="第 4 步"></span>
            <span class="onboarding-progress-marker" data-onboarding-progress role="listitem" aria-label="完成"></span>
          </div>
          <h2 id="onboarding-title"></h2>
          <p id="onboarding-copy"></p>
          <p class="onboarding-status" id="onboarding-status" role="status"></p>
          <div class="onboarding-card-actions" id="onboarding-card-actions"></div>
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
      return [{ action: 'resume-wordbook', label: '继续使用已收录内容', tone: 'secondary' }];
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
    const scrim = layer.querySelector('.onboarding-scrim');
    const eyebrow = layer.querySelector('#onboarding-eyebrow');
    const title = layer.querySelector('#onboarding-title');
    const copy = layer.querySelector('#onboarding-copy');
    const status = layer.querySelector('#onboarding-status');
    const actions = layer.querySelector('#onboarding-card-actions');
    const progress = [...layer.querySelectorAll('.onboarding-progress-marker')];

    let state = null;
    let active = false;
    let activeTarget = null;
    let instruction = {};
    let actionBusy = false;
    let animationFrame = null;

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
      ring.removeAttribute('style');
      layer.removeAttribute('data-card-position');
      layer.dataset.keyboardOpen = 'false';
      layer.style.removeProperty('--onboarding-card-bottom');
      layer.style.removeProperty('--onboarding-keyboard-offset');
      moveLayerToTargetContext(null);
    }

    function detach() {
      clearTarget();
    }

    function positionCardForViewport() {
      const visualViewport = window.visualViewport;
      const focused = document.activeElement;
      const targetRect = activeTarget?.isConnected ? activeTarget.getBoundingClientRect() : null;
      const viewportHeight = visualViewport?.height || window.innerHeight;
      const keyboardOpen = Boolean(
        visualViewport && focused && activeTarget && activeTarget.contains(focused)
        && visualViewport.height < window.innerHeight - 120
      );
      layer.dataset.keyboardOpen = String(keyboardOpen);
      if (keyboardOpen && visualViewport) {
        layer.removeAttribute('data-card-position');
        layer.style.removeProperty('--onboarding-card-bottom');
        const offset = Math.max(0, window.innerHeight - (visualViewport.height + visualViewport.offsetTop));
        layer.style.setProperty('--onboarding-keyboard-offset', `${Math.ceil(offset)}px`);
        return;
      }
      layer.style.removeProperty('--onboarding-keyboard-offset');
      if (!targetRect || targetRect.top < viewportHeight * .56) {
        layer.removeAttribute('data-card-position');
        layer.style.removeProperty('--onboarding-card-bottom');
        return;
      }
      const bottomOffset = Math.max(12, window.innerHeight - targetRect.top + 14);
      layer.setAttribute('data-card-position', 'above-target');
      layer.style.setProperty('--onboarding-card-bottom', `${Math.ceil(bottomOffset)}px`);
    }

    function positionTarget() {
      if (!active || !activeTarget || !activeTarget.isConnected) {
        ring.hidden = true;
        positionCardForViewport();
        return;
      }
      moveLayerToTargetContext(activeTarget);
      const rect = activeTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        ring.hidden = true;
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
      positionCardForViewport();
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
      layer.dataset.step = state.step;
      eyebrow.textContent = content.eyebrow || '';
      title.textContent = content.title || '';
      copy.textContent = content.copy || '';
      progress.forEach((marker, index) => {
        marker.classList.toggle('is-current', index === guideStepIndex(state.step));
        marker.classList.toggle('is-complete', index < guideStepIndex(state.step));
      });
      renderActions(content.actions || defaultActions(state));
    }

    function setStatus(message = '') {
      status.textContent = message;
    }

    function canInteract(element) {
      if (!active) return true;
      if (!isElement(element)) return false;
      if (layer.contains(element) && element.closest('[data-onboarding-action]')) return true;
      if (element.closest('[data-onboarding-system-close]')) return true;
      return Boolean(activeTarget && (
        activeTarget === element
        || activeTarget.contains(element)
        || element.contains(activeTarget)
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
      setStatus('正在跳过教程…');
      try {
        if (state.mode === 'auto' && typeof options.onSkip === 'function') await options.onSkip(snapshot());
        state = reduceGuide(state, { type: 'skip' });
        deactivate();
        if (typeof options.onSkipped === 'function') options.onSkipped(snapshot());
      } catch (error) {
        setStatus(error?.message || '暂时无法跳过教程，请稍后重试。');
      } finally {
        actionBusy = false;
      }
    }

    function deactivate({ keepTip = false } = {}) {
      active = false;
      document.body.classList.remove('onboarding-active');
      clearTarget();
      scrim.hidden = keepTip;
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
      active = true;
      layer.hidden = false;
      layer.classList.remove('onboarding-tip-only');
      scrim.hidden = false;
      document.body.classList.add('onboarding-active');
      renderInstruction();
      setStatus(settings.status || '');
      setTarget(settings.target || null);
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
      renderInstruction();
      setStatus(settings.status || '');
      if (Object.hasOwn(settings, 'target')) setTarget(settings.target);
      if (typeof options.onStateChange === 'function') options.onStateChange(snapshot(), event);
      return snapshot();
    }

    function showInstruction(nextInstruction = {}, target) {
      instruction = nextInstruction;
      renderInstruction();
      if (arguments.length > 1) setTarget(target);
      else schedulePosition();
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
      setTarget,
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
