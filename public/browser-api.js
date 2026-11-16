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
  const demoDefaults = { modelMode: 'demo', model: '演示模式' };
  const show = () => onChange(active?.enabled ? 'custom' : defaults?.modelMode);
  const defaultName = () => defaults?.model || (defaults ? '默认模型' : '');
  function enterDemoMode() {
    defaults = demoDefaults;
    if (!document.getElementById('demo-banner')) {
      const banner = document.createElement('div');
      banner.id = 'demo-banner';
      banner.textContent = '在线演示版：解读展示的是预置的示例结果，不会处理你输入的文字；语音转写与自定义模型请下载本地版使用。';
      document.body.prepend(banner);
    }
  }
  const initial = fetch('/api/config').then(async response => {
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('json')) defaults = await response.json();
    else enterDemoMode();
  }).catch(enterDemoMode);
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
      if (defaults?.modelMode === 'demo') return demoPost(path, body);
      return jsonRequest(path, active && active.enabled !== false ? { ...body, modelConfig: active } : body, signal);
    }
  };
}

async function demoPost(path, body) {
  if (path === '/api/model-test') throw new Error('在线演示版不支持自定义模型，请下载本地版使用。');
  if (path !== '/api/analyze') throw new Error('在线演示版只提供示例解读，请下载本地版体验完整功能。');
  const source = String(body?.dialogue || '');
  if (!source.includes('明早开会要用')) {
    throw new Error('演示版只展示示例对话的解读效果：请点击「试一段示例」，再点「开始解读」。');
  }
  const response = await fetch('demo/example-analysis.json');
  if (!response.ok) throw new Error('演示数据加载失败，请刷新页面重试。');
  return response.json();
}
