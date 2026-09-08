(function exposeWordbook(root, factory) {
  const wordbook = factory();
  if (typeof module === 'object' && module.exports) module.exports = wordbook;
  if (root) root.Wordbook = wordbook;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // A response may only affect the view which requested it. Reset on navigation
  // and logout; newer work in one lane need not cancel independent list work.
  function createRequestScope() {
    let epoch = 0;
    const lanes = new Map();
    return {
      start(lane) {
        const generation = epoch;
        const version = (lanes.get(lane) || 0) + 1;
        lanes.set(lane, version);
        return () => generation === epoch && lanes.get(lane) === version;
      },
      reset() { epoch += 1; lanes.clear(); }
    };
  }

  function createSearchController({ api, onList, onResult, onError, onBusy = () => {}, schedule = setTimeout, cancelSchedule = clearTimeout }) {
    const scope = createRequestScope();
    let timer;
    function cancel() {
      cancelSchedule(timer);
      scope.reset();
      onBusy(false);
    }
    return {
      cancel,
      input(query, kind) {
        cancel();
        const current = scope.start('search');
        timer = schedule(async () => {
          if (!current()) return;
          onBusy('list');
          try {
            const data = await api.listWordbook({ kind, q: query.trim(), page: 0, size: 60 });
            if (current()) onList(data);
          } catch (error) { if (current()) onError(error); }
          finally { if (current()) onBusy(false); }
        }, 250);
      },
      async submit(query, event = {}) {
        if (event.isComposing || event.keyCode === 229 || !query.trim()) return;
        cancel();
        const current = scope.start('search');
        onBusy('lookup');
        try {
          const personal = await api.listWordbook({ exact: query.trim(), page: 0, size: 60 });
          if (!current()) return;
          if (personal.items?.length) {
            onResult({ entry: personal.items[0] });
          } else {
            assertAiLength(query.trim());
            const preview = await api.lookupWordbook({ query: query.trim() });
            if (current()) onResult({ preview });
          }
        } catch (error) { if (current()) onError(error); }
        finally { if (current()) onBusy(false); }
      }
    };
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const kindLabel = kind => kind === 'phrase' ? '短语' : '单词';
  const textBlock = (text, cls = '') => text ? `<p class="${cls}">${escapeHtml(text)}</p>` : '';
  function dictionaryGroups(data) {
    const groups = [];
    for (const raw of data?.meanings || []) {
      const match = raw.match(/^\s*((?:(?:n|v|vt|vi|adj|adv|pron|prep|conj|int|interj|aux|num|art|det)\.)|【名】)\s*/i);
      const label = match ? match[1] : '其他释义';
      let group = groups.find(item => item.label === label);
      if (!group) { group = { label, senses: [] }; groups.push(group); }
      group.senses.push(...raw.slice(match ? match[0].length : 0).split(/[；;]/).map(s => s.trim()).filter(Boolean));
    }
    return groups;
  }
  function coreMeaning(entry) {
    const original = entry.dictionary?.meanings?.[0];
    const translation = entry.translationZh || '';
    if (!original) return translation;
    const summary = entry.dictionary.meanings.map(s => s.split(/[；;]/, 1)[0]).join(' · ');
    const generated = [original, original.slice(0, 499) + '…', summary, summary.slice(0, 499) + '…'];
    if (!generated.includes(translation)) return translation;
    return dictionaryGroups(entry.dictionary).map(g => `${g.label} ${g.senses[0] || ''}`).join('\n');
  }
  function dictionaryMarkup(data) {
    if (!data?.meanings?.length) return '';
    const meaning = (value, i) => `<li><span class="wb-definition-number">${String(i + 1).padStart(2, '0')}</span><p>${escapeHtml(value)}</p></li>`;
    return `<section class="wb-section wb-dictionary"><div class="wb-section-heading"><h3>词典释义</h3><span class="wb-small">有道词典</span></div>
      <div class="wb-phonetics">${data.ukPhonetic ? `<span>英 <span lang="en">/${escapeHtml(data.ukPhonetic)}/</span></span>` : ''}${data.usPhonetic ? `<span>美 <span lang="en">/${escapeHtml(data.usPhonetic)}/</span></span>` : ''}</div>
      ${dictionaryGroups(data).map(group => `<section class="wb-pos-group"><h4 class="wb-pos-label">${escapeHtml(group.label)}<span>${group.senses.length} 个义项</span></h4><ol class="wb-definitions">${group.senses.slice(0, 2).map(meaning).join('')}</ol>${group.senses.length > 2 ? `<details class="wb-more-meanings"><summary>展开 ${escapeHtml(group.label)} 的其余 ${group.senses.length - 2} 个义项</summary><ol class="wb-definitions">${group.senses.slice(2).map((v, i) => meaning(v, i + 2)).join('')}</ol></details>` : ''}</section>`).join('')}
      ${data.wordForms?.length ? `<h4 class="wb-saved-heading">词形变化</h4><dl class="wb-word-forms">${data.wordForms.map(f => `<div><dt>${escapeHtml(f.name)}</dt><dd lang="en">${escapeHtml(f.value)}</dd></div>`).join('')}</dl>` : ''}</section>`;
  }
  const aiFailureMessage = error => error?.status === 428
    ? '请在右上角「AI 设置」填写自己的 API Key。基础查词和单词本仍可使用。'
    : error?.status === 429
    ? '查询较频繁，请稍后重试。你仍可以手动填写并收录。'
    : 'AI 暂时无法完成查询，请重试。你仍可以手动填写并收录。';
  function lookupFailureMarkup(message) {
    return `<div class="wb-welcome"><h2>暂时查不到？先记下来。</h2><p>可以重试查询，也可以自己填写释义和备注。</p><div class="wb-term-actions"><button type="button" class="secondary-button" data-action="lookup">重新查询</button><button type="button" class="primary-button" data-action="add">手动收录</button></div><p class="wb-status" data-error="true" role="alert">${escapeHtml(message)}</p></div>`;
  }
  function assertAiLength(term, translationZh) {
    if (term.length > 200 || (translationZh || '').length > 500) {
      const error = new Error('AI 查询最多支持 200 字符的表达和 500 字符的释义，请缩短后重试；仍可手动收录。');
      error.userMessage = true;
      throw error;
    }
  }

  function init({ api, onUnauthorized, onOpenComposition, root = document.querySelector('#wordbook-view') }) {
    if (!root) throw new Error('Wordbook container is missing.');
    const $ = selector => root.querySelector(selector);
    const list = $('#wb-list');
    const detail = $('#wb-detail-content');
    const query = $('#wb-query');
    const status = $('#wb-search-status');
    const contentScope = createRequestScope();
    const listScope = createRequestScope();
    const dialogScope = createRequestScope();
    let active = false;
    let kind = 'word';
    let page = 0;
    let items = [];
    let selected = null;
    let preview = null;
    let collocations = [];
    let editorDictionary = null;
    let generated = null;
    let composing = false;
    let compositionEndedAt = 0;
    let editingId = null;
    let confirmationAction = null;
    let confirmationBusy = false;

    root.insertAdjacentHTML('beforeend', `
      <dialog class="wb-dialog" id="wb-editor" aria-labelledby="wb-editor-title">
        <form id="wb-editor-form">
          <div class="wb-dialog-heading"><div><p class="eyebrow">KEEP A NEW EXPRESSION</p><h2 id="wb-editor-title">收录词条</h2></div><button type="button" class="wb-close" data-wb-close aria-label="关闭录入窗口">×</button></div>
          <div class="wb-fill"><label for="wb-fill-query">需要一点提示？<span>词典查询 · AI 补充</span></label><div class="wb-search-row"><input id="wb-fill-query" maxlength="500" placeholder="输入英文，或想表达的中文" /><button id="wb-fill-button" type="button">查询</button></div><p>只填入空白项，保留你已经写下的内容。</p></div><div id="wb-editor-dictionary"></div>
          <label class="field-label" for="wb-term">英文单词或短语 <em>必填</em></label><input id="wb-term" maxlength="500" required autocomplete="off" placeholder="例如：make a difference" />
          <label class="field-label" for="wb-translation">核心释义</label><textarea id="wb-translation" rows="2" maxlength="1000" placeholder="用自己的话记住它的意思"></textarea>
          <label class="field-label" for="wb-note">我的备注</label><textarea id="wb-note" rows="3" maxlength="2000" placeholder="用法、联想，或想对自己说的话"></textarea>
          <p class="wb-status" id="wb-editor-status" role="status" aria-live="polite"></p>
          <div class="wb-dialog-actions"><button type="button" class="secondary-button" data-wb-close>取消</button><button type="submit" class="primary-button" id="wb-save">收录到单词本</button></div>
        </form>
      </dialog>
      <dialog class="wb-dialog wb-confirm" id="wb-confirm" aria-labelledby="wb-confirm-title" aria-describedby="wb-confirm-copy">
        <p class="eyebrow">REMOVE FROM WORDBOOK</p><h2 id="wb-confirm-title">删除这个词条？</h2><p id="wb-confirm-copy"></p><p id="wb-confirm-error" class="wb-status" role="alert"></p>
        <div class="wb-dialog-actions"><button type="button" class="secondary-button" id="wb-confirm-cancel" autofocus>保留</button><button type="button" class="wb-danger-button" id="wb-confirm-delete">确认删除</button></div>
      </dialog>`);

    const editor = $('#wb-editor');
    const editorForm = $('#wb-editor-form');
    const confirmDialog = $('#wb-confirm');

    function report(error, target = status, ai = false) {
      if (!active) return;
      if (error?.status === 401) { onUnauthorized(error); return; }
      target.textContent = ai && !error?.userMessage
        ? aiFailureMessage(error)
        : (error?.message || '暂时没有完成，请重试。');
      target.dataset.error = 'true';
    }

    function validateAi(term, translationZh, target) {
      try { assertAiLength(term, translationZh); return true; }
      catch (error) { report(error, target); return false; }
    }

    function emptyDetail() {
      detail.innerHTML = `<div class="wb-welcome"><p class="eyebrow">A PERSONAL COLLECTION</p><span class="wb-welcome-mark" aria-hidden="true">Aa</span><h2>把遇见的好词，<br />留在这里。</h2><p>打开一个词条，重温释义与阅读语境。<br />也可以查一个新词，慢慢积累自己的表达。</p><button type="button" class="primary-button" data-action="add">＋ 收录一个词条</button><div class="wb-welcome-rule"></div><p class="wb-small">单词 · 短语 · 你的每一次积累</p></div>`;
    }

    function renderList(data) {
      items = Array.isArray(data.items) ? data.items : [];
      $('#wb-word-count').textContent = data.wordCount ?? 0;
      $('#wb-phrase-count').textContent = data.phraseCount ?? 0;
      $('#wb-result-count').textContent = `${data.total ?? items.length} 个${kindLabel(kind)}${query.value.trim() ? '符合搜索' : '已收录'}`;
      list.innerHTML = items.length ? items.map(item => `<button type="button" class="wb-entry" data-entry="${escapeHtml(item.id)}" aria-current="${String(selected?.id) === String(item.id) ? 'true' : 'false'}"><span class="wb-entry-term" lang="en">${escapeHtml(item.term)}</span><span class="wb-entry-meaning">${escapeHtml(item.translationZh || '尚未填写释义')}</span><span class="wb-entry-arrow" aria-hidden="true">↗</span></button>`).join('')
        : `<div class="wb-empty-list"><p>${query.value.trim() ? '个人词库里还没有匹配的表达。' : `还没有收录${kindLabel(kind)}。`}</p><button type="button" class="text-action" data-action="${query.value.trim() ? 'lookup' : 'add'}">${query.value.trim() ? '回车或点击，查询这个表达 ↗' : '＋ 手动收录一个'}</button></div>`;
      const total = Number(data.total) || 0;
      $('#wb-pagination').hidden = total <= 60 && page === 0;
      $('#wb-page').textContent = `${page + 1} / ${Math.max(page + 1, Math.ceil(total / 60))}`;
      $('#wb-prev').disabled = page === 0;
      $('#wb-next').disabled = (page + 1) * 60 >= total;
    }

    async function loadList() {
      if (!active) return;
      const current = listScope.start('list');
      status.textContent = '正在整理你的词库…';
      status.dataset.error = 'false';
      list.setAttribute('aria-busy', 'true');
      try {
        const data = await api.listWordbook({ kind, q: query.value.trim(), page, size: 60 });
        if (!current() || !active) return;
        renderList(data);
        status.textContent = '';
      } catch (error) {
        if (current()) {
          report(error);
          list.innerHTML = '<button type="button" class="text-action" data-action="retry-list">重新加载词库</button>';
        }
      } finally { if (current()) list.setAttribute('aria-busy', 'false'); }
    }

    function setKind(next) {
      kind = next === 'phrase' ? 'phrase' : 'word';
      root.querySelectorAll('[data-wb-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wbKind === kind)));
    }

    function clearContent() {
      contentScope.reset();
      selected = null;
      preview = null;
      collocations = [];
      generated = null;
    }

    function showDetail() {
      root.classList.add('wb-show-detail');
    }

    async function openEntry(id, nextKind) {
      if (!active) return;
      search.cancel();
      clearContent();
      if (nextKind && nextKind !== kind) { setKind(nextKind); page = 0; void loadList(); }
      const current = contentScope.start('detail');
      root.classList.add('wb-show-detail');
      detail.innerHTML = '<p class="wb-loading" role="status">正在打开词条…</p>';
      try {
        const entry = await api.readWordbook(id);
        if (!current() || !active) return;
        selected = entry;
        renderDetail();
        showDetail();
        list.querySelectorAll('[data-entry]').forEach(button => button.setAttribute('aria-current', String(button.dataset.entry === String(entry.id))));
      } catch (error) {
        if (!current()) return;
        detail.innerHTML = `<div class="wb-empty-list"><p class="wb-status" role="alert"></p><button type="button" class="text-action" data-retry-entry="${escapeHtml(id)}">重新打开</button></div>`;
        report(error, detail.querySelector('.wb-status'));
      }
    }

    function renderDetail() {
      const entry = selected || preview;
      if (!entry) { emptyDetail(); return; }
      const saved = Boolean(selected);
      detail.innerHTML = `<div class="wb-detail-top"><p class="eyebrow">${saved ? 'FROM YOUR COLLECTION' : 'DISCOVER AN EXPRESSION'}</p><span class="wb-tag">${saved ? '已收录' : '查询结果 · 尚未收录'}</span></div>
        <header class="wb-term-header"><span class="wb-kind-label">${kindLabel(entry.kind)}</span><h2 lang="en">${escapeHtml(entry.term)}</h2>${textBlock(coreMeaning(entry) || '尚未填写释义', 'wb-core-meaning')}
        <div class="wb-term-actions">${saved ? '<button type="button" class="secondary-button" data-action="edit">编辑释义与备注</button><button type="button" class="wb-delete-link" data-action="delete">删除词条</button>' : '<button type="button" class="primary-button" data-action="collect">＋ 收录到单词本</button><span class="wb-small">确认后才会加入个人词库</span>'}</div></header>
        ${dictionaryMarkup(entry.dictionary)}
        ${!entry.dictionary ? '<section class="wb-section"><button type="button" class="text-action" data-action="dictionary">补全词典释义 ↗</button><p class="wb-small">查询音标、多义项和词形；确认后保存。</p><p id="wb-dictionary-status" class="wb-status" role="status"></p></section>' : ''}
        ${saved ? `<section class="wb-section"><h3>我的备注</h3>${textBlock(entry.note || '还没有备注。点击编辑，写下你的联想。', entry.note ? 'wb-note' : 'wb-muted')}</section>` : textBlock(entry.memoryHint, 'wb-memory')}
        ${saved ? renderSenses(entry.senses || []) : ''}
        ${saved ? renderRelated(entry.related || [], entry.kind) : ''}
        <section class="wb-section"><div class="wb-section-heading"><h3>搭配与表达 <span class="wb-ai-label">AI</span></h3><button type="button" class="text-action" data-action="collocations">${collocations.length ? '重新查询' : '查询搭配'} ↗</button></div><p class="wb-small">选中想记住的表达，再单独收录。</p><div id="wb-collocations"></div><p id="wb-collocation-status" class="wb-status" role="status"></p></section>
        ${entry.kind === 'phrase' ? `<section class="wb-section"><div class="wb-section-heading"><h3>在句子里练习 <span class="wb-ai-label">AI</span></h3><button type="button" class="text-action" data-action="sentence">生成例句 ↗</button></div><div id="wb-generated"></div><p id="wb-sentence-status" class="wb-status" role="status"></p>${saved ? '<h4 class="wb-saved-heading">我的收藏例句</h4><div id="wb-examples"></div>' : '<p class="wb-small">收录这个短语后，即可保存喜欢的例句。</p>'}</section>` : ''}
        <p id="wb-detail-status" class="wb-status" role="status" aria-live="polite"></p>`;
      renderCollocations();
      renderGenerated();
      renderExamples();
    }

    function renderSenses(senses) {
      return `<section class="wb-section"><div class="wb-section-heading"><h3>阅读中的语境</h3><span class="wb-small">${senses.length} 条</span></div>${senses.length ? senses.map((sense, index) => `<article class="wb-sense"><span class="wb-sense-number">${String(index + 1).padStart(2, '0')}</span><div>${textBlock(sense.translationZh, 'wb-sense-meaning')}${textBlock(sense.sentence, 'wb-quotation')}${textBlock(sense.note, 'wb-muted')}${sense.compositionId ? `<button type="button" class="wb-source" data-composition="${escapeHtml(sense.compositionId)}">↗ ${escapeHtml(sense.compositionTitle || '打开来源作文')}</button>` : '<span class="wb-small">独立保存的语境 · 无来源链接</span>'}</div></article>`).join('') : '<p class="wb-muted">在写译笔记里保存摘录，原句和来源会留在这里。</p>'}</section>`;
    }

    function renderRelated(related, entryKind) {
      return `<section class="wb-section" id="wb-related-section"><h3>${entryKind === 'phrase' ? '关联的已录单词' : '包含这个词的已录短语'}</h3>${related.length ? `<div class="wb-related">${related.map(item => `<button type="button" data-related="${escapeHtml(item.id)}" data-kind="${escapeHtml(item.kind)}"><strong lang="en">${escapeHtml(item.term)} <span aria-hidden="true">↗</span></strong><span>${escapeHtml(item.translationZh || '')}</span></button>`).join('')}</div>` : '<p class="wb-muted">暂时没有关联的收藏。</p>'}</section>`;
    }

    function renderCollocations() {
      const target = $('#wb-collocations');
      if (!target) return;
      target.innerHTML = collocations.length ? `<div class="wb-collocation-list">${collocations.map((item, i) => `<label class="wb-collocation"><input type="checkbox" data-collocation="${i}" ${item.saved ? 'disabled' : ''} /><span><strong lang="en">${escapeHtml(item.term)}</strong><span>${escapeHtml(item.translationZh)}</span></span>${item.saved ? '<small>已收录</small>' : ''}</label>`).join('')}</div><button type="button" class="secondary-button" data-action="save-collocations" disabled>收录选中搭配</button>` : '<p class="wb-muted">主动查询，发现更多表达方式。</p>';
    }

    function exampleMarkup(example) {
      return `<p class="wb-example-english" lang="en">${escapeHtml(example.english)}</p>${textBlock(example.translationZh, 'wb-example-translation')}${example.usage ? `<p class="wb-usage"><span>用法提醒</span> ${escapeHtml(example.usage)}</p>` : ''}`;
    }

    function renderGenerated() {
      const target = $('#wb-generated');
      if (!target) return;
      target.innerHTML = generated ? `<article class="wb-example wb-generated"><span class="wb-small">${generated.saved ? '已保存到收藏' : '新的练习句'}</span>${exampleMarkup(generated)}<div class="wb-example-actions"><button type="button" class="text-action" data-action="copy">复制</button><button type="button" class="text-action" data-action="sentence">换一句</button>${selected ? `<button type="button" class="secondary-button" data-action="save-example" ${generated.saved ? 'disabled' : ''}>${generated.saved ? '已保存' : '保存例句'}</button>` : ''}</div></article>` : '<p class="wb-muted">生成一句自然的英文，看看这个短语如何使用。</p>';
    }

    function renderExamples() {
      const target = $('#wb-examples');
      if (!target) return;
      target.innerHTML = selected?.examples?.length ? selected.examples.map((example, i) => `<article class="wb-example">${exampleMarkup(example)}<div class="wb-example-actions"><button type="button" class="text-action" data-copy-example="${i}">复制</button><button type="button" class="wb-delete-link" data-delete-example="${escapeHtml(example.id)}">移除收藏</button></div></article>`).join('') : '<p class="wb-muted">喜欢的例句，保存下来随时温习。</p>';
    }

    async function refreshRelated() {
      if (!selected || !active) return;
      const current = contentScope.start('related');
      const id = selected.id;
      try {
        const fresh = await api.readWordbook(id);
        if (!current() || !active || selected?.id !== id) return;
        selected.related = fresh.related || [];
        const section = $('#wb-related-section');
        if (section) section.outerHTML = renderRelated(selected.related, selected.kind);
      } catch (error) { if (current()) report(error, $('#wb-detail-status')); }
    }

    // Every asynchronous control captures both its content generation and its DOM
    // owner. Detached controls and requests from prior sessions cannot report back.
    async function act(button, lane, work, complete, target, ai = false) {
      if (!active || button.disabled) return;
      const current = contentScope.start(lane);
      const label = button.textContent;
      button.disabled = true;
      button.textContent = '请稍候…';
      target.textContent = '';
      target.dataset.error = 'false';
      try {
        const result = await work(current);
        if (current() && active) complete(result);
      } catch (error) { if (current()) report(error, target, ai); }
      finally { if (current() && button.isConnected) { button.disabled = false; button.textContent = label; } }
    }

    function openEditor(entry = null, isEdit = false) {
      search.cancel();
      dialogScope.reset();
      editingId = isEdit ? entry.id : null;
      editorDictionary = entry?.dictionary || null;
      $('#wb-editor-dictionary').innerHTML = dictionaryMarkup(editorDictionary);
      editorForm.reset();
      $('#wb-editor-title').textContent = isEdit ? '编辑词条' : '收录词条';
      $('#wb-save').textContent = isEdit ? '保存修改' : '收录到单词本';
      $('#wb-save').disabled = false;
      $('#wb-fill-button').disabled = false;
      $('#wb-term').value = entry?.term || '';
      $('#wb-term').readOnly = isEdit;
      $('#wb-translation').value = entry?.translationZh || '';
      $('#wb-note').value = entry?.note || '';
      $('#wb-fill-query').value = entry?.term || query.value.trim();
      $('#wb-editor-status').textContent = '';
      editor.showModal();
      $('#wb-term').focus();
    }

    async function fillEditor() {
      const fillQuery = $('#wb-fill-query').value.trim();
      if (!fillQuery || $('#wb-fill-button').disabled) return;
      if (!validateAi(fillQuery, null, $('#wb-editor-status'))) return;
      const current = dialogScope.start('fill');
      const fields = ['#wb-term', '#wb-translation', '#wb-note'];
      const before = fields.map(id => $(id).value);
      $('#wb-fill-button').disabled = true;
      $('#wb-editor-status').textContent = '正在查询，仍可继续填写…';
      try {
        const result = await api.lookupWordbook({ query: fillQuery });
        if (!current() || !active || !editor.open) return;
        const values = [result.term, result.translationZh, result.memoryHint];
        if ($('#wb-fill-query').value.trim() !== fillQuery || $('#wb-term').value !== before[0]) {
          $('#wb-editor-status').textContent = '查询内容已改变，请重新查询。';
          return;
        }
        fields.forEach((id, i) => { if (!before[i].trim() && !$(id).value.trim()) $(id).value = values[i] || ''; });
        if ($('#wb-term').value.trim().toLowerCase() === result.term.toLowerCase()) editorDictionary = result.dictionary || null;
        $('#wb-editor-dictionary').innerHTML = dictionaryMarkup(editorDictionary);
        $('#wb-editor-status').textContent = '已补充空白项，请检查后收录。';
      } catch (error) { if (current()) report(error, $('#wb-editor-status'), true); }
      finally { if (current()) $('#wb-fill-button').disabled = false; }
    }

    async function saveEditor(event) {
      event.preventDefault();
      if ($('#wb-save').disabled || !editorForm.reportValidity()) return;
      const payload = { term: $('#wb-term').value.trim(), translationZh: $('#wb-translation').value.trim(), note: $('#wb-note').value.trim() };
      if (editorDictionary?.term.toLowerCase() === payload.term.toLowerCase()) payload.dictionary = editorDictionary;
      if (!payload.term) { $('#wb-editor-status').textContent = '请填写英文单词或短语。'; return; }
      dialogScope.reset();
      const current = dialogScope.start('save');
      $('#wb-save').disabled = true;
      $('#wb-fill-button').disabled = true;
      $('#wb-editor-status').textContent = '正在保存…';
      try {
        const saved = editingId ? await api.updateWordbook(editingId, payload) : await api.createWordbook(payload);
        if (!current() || !active) return;
        editor.close();
        query.value = '';
        page = 0;
        setKind(saved.kind);
        void loadList();
        void openEntry(saved.id);
      } catch (error) { if (current()) report(error, $('#wb-editor-status')); }
      finally { if (current()) { $('#wb-save').disabled = false; $('#wb-fill-button').disabled = false; } }
    }

    function confirmRemoval(title, copy, action) {
      confirmationAction = action;
      confirmationBusy = false;
      $('#wb-confirm-title').textContent = title;
      $('#wb-confirm-copy').textContent = copy;
      $('#wb-confirm-error').textContent = '';
      $('#wb-confirm-delete').disabled = false;
      $('#wb-confirm-cancel').disabled = false;
      confirmDialog.showModal();
    }

    async function removeConfirmed() {
      if (confirmationBusy || !confirmationAction || !active) return;
      confirmationBusy = true;
      const current = contentScope.start('delete');
      $('#wb-confirm-delete').disabled = true;
      $('#wb-confirm-cancel').disabled = true;
      try {
        const complete = await confirmationAction();
        if (!current() || !active) return;
        confirmDialog.close();
        complete();
      } catch (error) { if (current()) report(error, $('#wb-confirm-error')); }
      finally {
        if (current()) {
          confirmationBusy = false;
          $('#wb-confirm-delete').disabled = false;
          $('#wb-confirm-cancel').disabled = false;
        }
      }
    }

    async function copyExample(example, button) {
      const current = contentScope.start('copy');
      const text = [example.english, example.translationZh, example.usage].filter(Boolean).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        if (current() && active && button.isConnected) button.textContent = '已复制';
      } catch (_) {
        if (current() && active) {
          const target = $('#wb-detail-status');
          target.textContent = '浏览器未允许复制，请选中例句文字手动复制。';
        }
      }
    }

    function lookup() {
      if (!active || !query.value.trim()) { query.focus(); return; }
      if (root.contains(document.activeElement)) document.activeElement.blur();
      clearContent();
      listScope.reset();
      detail.innerHTML = '<p class="wb-loading" role="status">先查找你的收藏，再查询新的表达…</p>';
      root.classList.add('wb-show-detail');
      void search.submit(query.value);
    }

    const search = createSearchController({
      api,
      onList(data) { if (active) { page = 0; renderList(data); status.textContent = ''; } },
      onResult(result) {
        if (!active) return;
        if (result.entry) { void openEntry(result.entry.id, result.entry.kind); }
        else { clearContent(); preview = result.preview; collocations = preview.collocations || []; renderDetail(); showDetail(); }
      },
      onError(error) {
        if (!active) return;
        if (root.classList.contains('wb-show-detail') && !selected && !preview) {
          status.textContent = '';
          status.dataset.error = 'false';
          detail.innerHTML = lookupFailureMarkup(aiFailureMessage(error));
        } else report(error, status, true);
      },
      onBusy(busy) {
        $('#wb-lookup').disabled = busy === 'lookup';
        list.setAttribute('aria-busy', String(Boolean(busy)));
        if (busy) { status.textContent = busy === 'lookup' ? '正在查询表达…' : '正在筛选你的收藏…'; status.dataset.error = 'false'; }
        else if (status.dataset.error !== 'true') status.textContent = '';
      }
    });

    $('#wb-search-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!composing && Date.now() - compositionEndedAt > 80) lookup();
    });
    query.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229 || composing || Date.now() - compositionEndedAt <= 80)) event.preventDefault();
    });
    query.addEventListener('compositionstart', () => { composing = true; search.cancel(); listScope.reset(); });
    query.addEventListener('compositionend', () => { composing = false; compositionEndedAt = Date.now(); filterInput(); });
    function filterInput() {
      if (!active) return;
      listScope.reset();
      search.cancel();
      if (!selected) { clearContent(); emptyDetail(); }
      if (!composing) search.input(query.value, kind);
    }
    query.addEventListener('input', filterInput);
    $('#wb-add').addEventListener('click', () => openEditor());
    $('#wb-back').addEventListener('click', () => {
      search.cancel();
      clearContent();
      emptyDetail();
      root.classList.remove('wb-show-detail');
      void loadList();
      query.focus();
    });
    root.querySelectorAll('[data-wb-kind]').forEach(button => button.addEventListener('click', () => {
      search.cancel();
      clearContent();
      emptyDetail();
      root.classList.remove('wb-show-detail');
      setKind(button.dataset.wbKind);
      page = 0;
      void loadList();
      query.focus({ preventScroll: true });
    }));
    $('#wb-prev').addEventListener('click', () => { search.cancel(); page = Math.max(0, page - 1); void loadList(); });
    $('#wb-next').addEventListener('click', () => { search.cancel(); page += 1; void loadList(); });
    editorForm.addEventListener('submit', event => void saveEditor(event));
    $('#wb-fill-button').addEventListener('click', () => void fillEditor());
    $('#wb-fill-query').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); if (!event.isComposing && event.keyCode !== 229) void fillEditor(); } });
    $('#wb-fill-query').addEventListener('input', () => { dialogScope.start('fill'); $('#wb-fill-button').disabled = false; $('#wb-editor-status').textContent = ''; });
    root.querySelectorAll('[data-wb-close]').forEach(button => button.addEventListener('click', () => editor.close()));
    editor.addEventListener('close', () => dialogScope.reset());
    $('#wb-confirm-delete').addEventListener('click', () => void removeConfirmed());
    $('#wb-confirm-cancel').addEventListener('click', () => confirmDialog.close());
    confirmDialog.addEventListener('cancel', event => { if (confirmationBusy) event.preventDefault(); });

    root.addEventListener('change', event => {
      if (!event.target.matches('[data-collocation]')) return;
      const count = root.querySelectorAll('[data-collocation]:checked').length;
      const button = $('[data-action="save-collocations"]');
      button.disabled = count === 0;
      button.textContent = count ? `收录选中搭配（${count}）` : '收录选中搭配';
    });

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || !active) return;
      if (button.dataset.entry) { void openEntry(button.dataset.entry); return; }
      if (button.dataset.related) { query.value = ''; void openEntry(button.dataset.related, button.dataset.kind); return; }
      if (button.dataset.retryEntry) { void openEntry(button.dataset.retryEntry); return; }
      if (button.dataset.composition) { onOpenComposition(button.dataset.composition); return; }
      if (button.dataset.copyExample !== undefined) { void copyExample(selected.examples[Number(button.dataset.copyExample)], button); return; }
      if (button.dataset.deleteExample) {
        const id = selected.id;
        const exampleId = button.dataset.deleteExample;
        confirmRemoval('移除这条例句？', '仅移除这条收藏例句，词条和其他笔记会保留。', async () => {
          await api.deleteWordbookExample(id, exampleId);
          return () => { selected.examples = selected.examples.filter(e => String(e.id) !== exampleId); renderExamples(); };
        });
        return;
      }
      const entry = selected || preview;
      const action = button.dataset.action;
      if (action === 'add') openEditor();
      if (action === 'edit') openEditor(selected, true);
      if (action === 'collect') openEditor(preview);
      if (action === 'lookup') lookup();
      if (action === 'retry-list') void loadList();
      if (action === 'delete' && selected) {
        const id = selected.id;
        confirmRemoval(`删除「${selected.term}」？`, '这个词条的语境、备注和收藏例句将一起删除。关联单词、短语和来源作文会保留。', async () => {
          await api.deleteWordbook(id);
          return () => { clearContent(); emptyDetail(); root.classList.remove('wb-show-detail'); page = 0; void loadList(); };
        });
      }
      if (action === 'dictionary') void act(button, 'dictionary', () => api.lookupWordbook({ query: entry.term }), result => {
        if (!result.dictionary) {
          $('#wb-dictionary-status').textContent = '词典暂未提供这个表达的资料，已有释义仍可使用。';
          return;
        }
        openEditor({ ...entry, dictionary: result.dictionary }, Boolean(selected));
        $('#wb-editor-status').textContent = '已查到词典资料，保存后会一并收录；原有释义和备注保留。';
      }, $('#wb-dictionary-status'));
      if (action === 'collocations' && validateAi(entry.term, null, $('#wb-collocation-status'))) void act(button, 'collocations', () => api.lookupWordbookCollocations({ query: entry.term }), result => {
        collocations = result.collocations || [];
        renderCollocations();
        if (!collocations.length) $('#wb-collocation-status').textContent = '这次没有找到搭配，可以重新查询。';
      }, $('#wb-collocation-status'), true);
      if (action === 'save-collocations') {
        const chosen = [...root.querySelectorAll('[data-collocation]:checked')].map(input => collocations[Number(input.dataset.collocation)]);
        const statusTarget = $('#wb-collocation-status');
        void act(button, 'save-collocations', async current => {
          for (const item of chosen) {
            if (!current() || !active) return;
            if (item.saved) continue;
            await api.createWordbook({ term: item.term, translationZh: item.translationZh, note: '' });
            if (!current() || !active) return;
            item.saved = true;
          }
        }, () => { renderCollocations(); statusTarget.textContent = '选中的搭配已收录。'; void loadList(); void refreshRelated(); }, statusTarget);
      }
      if (action === 'sentence' && validateAi(entry.term, entry.translationZh, $('#wb-sentence-status'))) void act(button, 'sentence', () => api.generateWordbookSentence({ term: entry.term, translationZh: entry.translationZh }), result => { generated = result; renderGenerated(); }, $('#wb-sentence-status'), true);
      if (action === 'save-example' && generated && selected) {
        const sentence = generated;
        const id = selected.id;
        void act(button, 'save-example', () => api.saveWordbookExample(id, { english: sentence.english, translationZh: sentence.translationZh, usage: sentence.usage }), result => {
          const example = result?.id ? result : null;
          sentence.saved = true;
          if (example) { selected.examples = [...(selected.examples || []).filter(e => String(e.id) !== String(example.id)), example]; renderExamples(); }
          else { void openEntry(id); }
          renderGenerated();
        }, $('#wb-sentence-status'));
      }
      if (action === 'copy' && generated) void copyExample(generated, button);
    });

    function suspend() {
      active = false;
      search.cancel();
      contentScope.reset();
      listScope.reset();
      dialogScope.reset();
      if (editor.open) editor.close();
      if (confirmDialog.open) confirmDialog.close();
      confirmationAction = null;
      confirmationBusy = false;
    }

    emptyDetail();
    return {
      setActive(value) {
        if (!value) { suspend(); root.hidden = true; return; }
        if (active) return;
        active = true;
        root.hidden = false;
        // Re-read after returning from compositions so newly saved excerpts appear.
        const id = selected?.id;
        void loadList();
        if (id) void openEntry(id);
        else { clearContent(); emptyDetail(); root.classList.remove('wb-show-detail'); }
      },
      reset() {
        suspend();
        root.hidden = true;
        root.classList.remove('wb-show-detail');
        setKind('word');
        page = 0;
        items = [];
        query.value = '';
        composing = false;
        clearContent();
        editorForm.reset();
        status.textContent = '';
        renderList({ items: [], total: 0, wordCount: 0, phraseCount: 0 });
        emptyDetail();
      }
    };
  }

  return { init, createRequestScope, createSearchController, lookupFailureMarkup, dictionaryMarkup, dictionaryGroups, coreMeaning };
});
