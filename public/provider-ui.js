const $ = id => document.getElementById(id);

const providers = {
  openai: 'https://api.openai.com/v1',
  bailian: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1'
};

const settingsMarkup = `
  <form class="panel settings-card" id="model-settings">
    <header><span class="section-label">连接</span><h2>模型 API</h2></header>
    <label for="mobile-provider">服务商模板</label>
    <select id="mobile-provider"><option value="">自定义</option><option value="bailian">阿里云百炼</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option></select>
    <label for="mobile-endpoint">HTTPS API 地址</label>
    <input type="url" id="mobile-endpoint" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://你的服务地址/v1" required maxlength="500">
    <label for="mobile-model">模型名称</label>
    <input id="mobile-model" autocapitalize="off" spellcheck="false" required maxlength="160" placeholder="填写服务商控制台中的模型名称">
    <label for="mobile-key">API 密钥</label>
    <input type="password" id="mobile-key" autocomplete="off" autocapitalize="off" maxlength="2048" placeholder="仅在本机加密保存">
    <label class="inline-check" id="remove-key-label" hidden><input type="checkbox" id="remove-key">清除已保存的密钥</label>
    <label for="mobile-format">返回格式</label>
    <select id="mobile-format"><option value="auto">自动兼容</option><option value="schema">严格 JSON Schema</option><option value="json">JSON 对象</option><option value="plain">提示词 JSON</option></select>
    <p class="field-note" id="model-hint">支持 OpenAI 兼容的 Chat Completions 接口。</p>
    <p class="settings-status" id="settings-status" role="status" hidden></p>
    <div class="audio-actions">
      <button type="button" class="button secondary" id="test-api">测试连接</button>
      <button type="submit" class="button primary" id="save-api">保存设置</button>
      <button type="button" class="button secondary" id="toggle-custom-model" hidden>使用默认模型</button>
    </div>
  </form>`;

export function setupProviderUI(adapter, onSettingsChange) {
  $('provider-settings').innerHTML = settingsMarkup;
  const form = $('model-settings');
  const toggle = $('toggle-custom-model');
  if (adapter.hint) $('model-hint').textContent = adapter.hint;

  function setConfig(data) {
    $('mobile-endpoint').value = data.endpoint || '';
    $('mobile-provider').value = Object.keys(providers).find(key => providers[key] === data.endpoint) || '';
    $('mobile-model').value = data.model || '';
    $('mobile-format').value = data.format || 'auto';
    $('mobile-key').value = '';
    $('mobile-key').placeholder = data.hasKey ? '已加密保存。留空保留原密钥' : '服务需要认证时填写';
    $('remove-key').checked = false;
    $('remove-key-label').hidden = !data.hasKey;
    const usingCustom = data.configured && data.enabled !== false;
    const indicator = $('model-indicator');
    indicator.textContent = usingCustom ? data.model : (adapter.defaultName?.() || '设置模型 API');
    indicator.classList.toggle('connected', Boolean(usingCustom || adapter.defaultName?.()));
    toggle.hidden = !adapter.setEnabled || !data.configured;
    toggle.textContent = usingCustom ? '使用默认模型' : '启用自定义模型';
  }

  function status(message, error = false) {
    const field = $('settings-status');
    field.textContent = message;
    field.hidden = !message;
    field.classList.toggle('form-error', error);
  }

  function draft() {
    return {
      endpoint: $('mobile-endpoint').value,
      model: $('mobile-model').value,
      key: $('mobile-key').value,
      format: $('mobile-format').value,
      clearKey: $('remove-key').checked
    };
  }

  async function updateSettings(test) {
    if (!form.reportValidity()) return;
    $('save-api').disabled = true;
    $('test-api').disabled = true;
    status(test ? '正在发送测试消息…' : '正在保存…');
    try {
      const value = test ? await adapter.test(draft()) : await adapter.save(draft());
      if (test) status('连接成功。测试只发送了示例消息。');
      else {
        setConfig(value);
        status('模型设置已保存。');
        onSettingsChange();
      }
    } catch (error) {
      status(error.message, true);
    } finally {
      $('save-api').disabled = false;
      $('test-api').disabled = false;
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); updateSettings(false); });
  $('test-api').addEventListener('click', () => updateSettings(true));
  $('mobile-provider').addEventListener('change', event => {
    if (providers[event.target.value]) $('mobile-endpoint').value = providers[event.target.value];
    $('mobile-key').value = '';
    status('');
  });
  toggle.addEventListener('click', async () => {
    if (!adapter.setEnabled) return;
    toggle.disabled = true;
    try {
      const value = await adapter.setEnabled();
      setConfig(value);
      status(value.enabled !== false ? '已启用自定义模型。' : '已切换到默认模型。');
      onSettingsChange();
    } catch (error) {
      status(error.message, true);
    } finally {
      toggle.disabled = false;
    }
  });
  adapter.load().then(setConfig).catch(error => status(error.message, true));
}
