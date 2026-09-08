(function (root) {
  'use strict';
  const providers = {
    deepseek: { name: 'DeepSeek 官方', url: 'https://platform.deepseek.com/' },
    taotoken: { name: 'Taotoken', url: 'https://taotoken.net/?u=inv_j24g5dtpokbj4s2n&utm_source=tt_invite' }
  };
  function init({ api, onUnauthorized, onChanged = () => {} }) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="ai-settings-dialog" class="wb-dialog" aria-labelledby="ai-settings-title">
      <form id="ai-settings-form">
        <div class="wb-dialog-heading"><div><p class="eyebrow">YOUR AI CONNECTION</p><h2 id="ai-settings-title">AI 设置</h2></div><button type="button" class="wb-close" id="ai-settings-close" aria-label="关闭 AI 设置">×</button></div>
        <p class="ai-settings-intro">基础查词和单词本可直接使用。连接自己的 AI，解锁搭配、造句和语境解释。</p>
        <div class="ai-signup-links"><a href="${providers.deepseek.url}" target="_blank" rel="noopener noreferrer">DeepSeek 官方注册 ↗</a><a href="${providers.taotoken.url}" target="_blank" rel="noopener noreferrer">Taotoken 注册 ↗</a></div>
        <label class="field-label" for="ai-provider">服务商</label><select id="ai-provider"><option value="deepseek">DeepSeek 官方</option><option value="taotoken">Taotoken 中转站</option></select>
        <p class="ai-settings-help">注册服务商账户后，在其 API 密钥页面创建 Key。两家服务商的密钥不能混用。</p>
        <label class="field-label" for="ai-key">API Key</label><input type="password" id="ai-key" maxlength="512" autocomplete="off" spellcheck="false" placeholder="粘贴所选服务商的 API Key" />
        <p id="ai-key-state" class="ai-settings-help"></p>
        <p class="ai-settings-model">DeepSeek Flash · 关闭思考模式</p>
        <p class="ai-settings-help">密钥以明文保存在本站数据库中，管理员可读取，用于代发你的 AI 请求。费用由你的服务商账户承担；测试连接也会发起一次小额请求。</p>
        <p id="ai-settings-status" role="status" aria-live="polite"></p>
        <div class="ai-settings-actions"><button type="button" class="secondary-button" id="ai-settings-test">测试连接</button><button type="submit" class="primary-button" id="ai-settings-save">保存配置</button><button type="button" class="wb-delete-link" id="ai-settings-delete" hidden>删除密钥</button></div>
      </form></dialog>`);
    const $ = id => document.getElementById(id);
    const dialog=$('ai-settings-dialog'), key=$('ai-key'), provider=$('ai-provider'), status=$('ai-settings-status');
    let generation=0, saved=null, busy=false;
    function controls(value) {
      busy=value;
      ['ai-provider','ai-key','ai-settings-save','ai-settings-test','ai-settings-delete'].forEach(id => { $(id).disabled=value; });
    }
    function showState() {
      const matching=saved?.configured && saved.provider===provider.value;
      key.placeholder=matching?'已保存 ••••••••，留空保留；填写可更换':'粘贴所选服务商的 API Key';
      $('ai-key-state').textContent=matching?'此账户已配置，密钥不会回显。':'尚未保存此服务商的密钥。';
      $('ai-settings-delete').hidden=!saved?.configured;
    }
    function reset() { generation++; key.value=''; saved=null; status.textContent=''; if(dialog.open) dialog.close(); controls(false); }
    function fail(error) { if(error.status===401) { reset(); onUnauthorized(); return; } status.textContent=error.message || '操作未完成，请稍后再试。'; }
    async function open() {
      if(dialog.open) return;
      key.value=''; saved=null; status.textContent='正在读取配置…'; dialog.showModal(); controls(true);
      const version=++generation;
      try { const result=await api.getAiSettings(); if(version!==generation) return; saved=result; provider.value=result.provider; showState(); status.textContent=''; }
      catch(error) { if(version===generation) fail(error); }
      finally { if(version===generation) controls(false); }
    }
    async function perform(action) {
      if(busy) return;
      if(action==='delete' && !window.confirm('删除后，AI 功能需重新配置密钥。确定删除？')) return;
      if(action!=='delete' && !key.value.trim() && !(saved?.configured && saved.provider===provider.value)) { status.textContent='请填写所选服务商的 API Key。'; key.focus(); return; }
      const version=++generation;
      const input={provider:provider.value,apiKey:key.value.trim()};
      controls(true); status.textContent=action==='test'?'正在测试连接…':'正在保存…';
      try {
        if(action==='test') { const result=await api.testAiSettings(input); if(version===generation) status.textContent=result.message; }
        else if(action==='save') {
          const result=await api.saveAiSettings(input);
          if(version!==generation) return;
          saved=result; key.value=''; showState(); status.textContent='已保存，AI 功能将使用此账户的密钥。'; onChanged();
        } else {
          await api.deleteAiSettings(); if(version!==generation) return;
          saved=null; key.value=''; showState(); status.textContent='密钥已删除，基础功能仍可使用。'; onChanged();
        }
      } catch(error) { if(version===generation) fail(error); }
      finally { input.apiKey=''; if(version===generation) controls(false); }
    }
    provider.addEventListener('change', () => { key.value=''; status.textContent=''; showState(); });
    key.addEventListener('input', () => { status.textContent=''; });
    $('ai-settings-form').addEventListener('submit', e => { e.preventDefault(); void perform('save'); });
    $('ai-settings-test').addEventListener('click', () => void perform('test'));
    $('ai-settings-delete').addEventListener('click', () => void perform('delete'));
    $('ai-settings-close').addEventListener('click', reset);
    dialog.addEventListener('close', () => { generation++; key.value=''; saved=null; controls(false); });
    $('ai-settings-button').addEventListener('click', () => void open());
    return { open, reset };
  }
  root.AiSettings={init};
})(window);
