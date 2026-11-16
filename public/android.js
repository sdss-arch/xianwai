import { prepareAnalysis, prepareProfileInsight, prepareProfileSuggestion, parseModelJson } from './analysis-core.mjs';

import { setupProviderUI } from './provider-ui.js';
const calls = new Map();
let sequence = 0;

globalThis.XianwaiNativeResult = (id, ok, value) => calls.get(id)?.(ok, value);

function bridge(action, data = {}, signal) {
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const finish = (ok, value) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      calls.delete(id);
      if (ok) resolve(value);
      else reject(new Error(value));
    };
    const timeout = setTimeout(() => finish(false, '操作超时，请重试。'), 180000);
    const abort = () => finish(false, '请求已取消。');
    if (signal?.aborted) return abort();
    calls.set(id, finish);
    signal?.addEventListener('abort', abort, { once: true });
    try { (globalThis.XianwaiPhone || globalThis.XianwaiAndroid).dispatch(id, action, JSON.stringify(data)); }
    catch { finish(false, '暂时无法连接弦外的手机功能。'); }
  });
}

export function setupPhone(onSettingsChange) {
  const android = Boolean(globalThis.XianwaiAndroid);
  let config = {};
  setupProviderUI({
    async load() { return (config = await bridge('settings')); },
    async save(draft) { return (config = await bridge('saveSettings', draft)); },
    test: draft => bridge('testSettings', draft)
  }, onSettingsChange);

  return {
    async post(path, body, signal) {
      if (!config.configured) throw new Error('先在「设置」填入你的模型 API，再开始解读。');
      const spec = path === '/api/analyze' ? (android ? (await import('./workplace-analysis.mjs')).prepareWorkplaceAnalysis(body) : prepareAnalysis(body))
        : path === '/api/profile-suggestion' ? prepareProfileSuggestion(body) : prepareProfileInsight(body);
      const prompt = spec.prompt + '\n只回复符合以下结构的 JSON。JSON Schema：' + JSON.stringify(spec.schema);
      const result = await bridge('complete', {
        name: spec.name,
        schema: spec.schema,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(spec.input) }]
      }, signal);
      try { return spec.normalize(parseModelJson(result)); }
      catch { throw new Error('这次模型回复不完整，可改用支持 JSON 输出的模型或重试。'); }
    },
    audio: {
      start: () => bridge('startRecording'),
      stop: () => bridge('stopRecording'),
      export: id => bridge('exportRecording', { id })
    },
    listRecordings: () => bridge('listRecordings'),
    deleteRecording: id => bridge('deleteRecording', { id }),
    copy: text => bridge('copy', { text }),
    exportText: (text, kind) => bridge('exportText', { text, kind })
  };
}
