export function endpointURL(address) {
  const raw = typeof address === 'string' ? address.trim().replace(/\/+$/u, '') : '';
  let url;
  try { url = new URL(raw); } catch {}
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || raw.length > 500) {
    throw new Error('请输入 HTTPS API 地址，可填 /v1 兼容地址或完整 Chat Completions 地址。');
  }
  return url.href.replace(/\/$/u, '').replace(/\/chat\/completions$/u, '');
}

export function cleanModelConfig(value, current) {
  const endpoint = endpointURL(value?.endpoint);
  const model = typeof value?.model === 'string' ? value.model.trim() : '';
  if (!model || model.length > 160) throw new Error('请输入服务商提供的模型名称。');
  const format = value.format || 'auto';
  if (!['auto', 'schema', 'json', 'plain'].includes(format)) throw new Error('请选择可用的返回格式。');
  const typedKey = typeof value.key === 'string' ? value.key.trim() : '';
  if (typedKey.length > 2048 || /[\r\n]/u.test(typedKey)) throw new Error('请检查 API 密钥格式。');
  const key = value.clearKey ? '' : typedKey || (current?.endpoint === endpoint ? current.key : '') || '';
  return { endpoint, model, format, key };
}

export function modelSummary(value) {
  if (!value) return { configured: false };
  const { key, ...display } = value;
  return { ...display, hasKey: Boolean(key), configured: true };
}
