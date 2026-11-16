import { loadWebModel, saveWebModel } from './local-device.js';
import { cleanModelConfig, modelSummary } from './model-config.mjs';
import { setupProviderUI } from './provider-ui.js';

async function jsonRequest(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作暂时无法完成，请重试。');
  return data;
}

export function setupBrowserAPI(onChange) {
  const eligible = window.isSecureContext && Boolean(globalThis.crypto?.subtle);
  let active;
  let defaults;
  const show = () => onChange(active?.enabled ? 'custom' : defaults?.modelMode);
  const defaultName = () => defaults?.model || (defaults ? '默认模型' : '');
  const initial = fetch('/api/config').then(async response => {
    if (response.ok) defaults = await response.json();
  }).catch(() => {});
  const load = async () => {
    await initial;
    try {
      active = eligible ? await loadWebModel() : null;
    } finally {
      show();
    }
    return modelSummary(active);
  };

  let ready;
  if (eligible) {
    setupProviderUI({
      defaultName,
      hint: '浏览器单独保存这套设置，密钥加密保存在当前浏览器。分析时由弦外服务转发到所选 HTTPS 接口。',
      load() { return (ready = load()); },
      async save(draft) {
        const value = { ...cleanModelConfig(draft, active), enabled: true };
        await saveWebModel(value);
        active = value;
        return modelSummary(active);
      },
      test: draft => jsonRequest('/api/model-test', { modelConfig: cleanModelConfig(draft, active) }),
      async setEnabled() {
        const next = { ...active, enabled: active.enabled === false };
        await saveWebModel(next);
        active = next;
        return modelSummary(active);
      }
    }, show);
  } else {
    ready = load();
    ready.then(() => {
      const provider = document.getElementById('provider-settings');
      provider.innerHTML = '<section class="panel settings-card"><h2>模型 API</h2><p>请通过 HTTPS 或电脑本机地址打开弦外，再保存自定义 API。当前页面可继续使用部署时配置的模型。</p></section>';
      document.getElementById('model-indicator').textContent = defaultName() || '设置模型 API';
    }).catch(() => {});
  }

  return {
    async post(path, body, signal) {
      await ready.catch(() => {});
      return jsonRequest(path, active && active.enabled !== false ? { ...body, modelConfig: active } : body, signal);
    }
  };
}
