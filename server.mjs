import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { prepareProfileInsight, prepareProfileSuggestion, parseModelJson, RequestError } from './public/analysis-core.mjs';
import { prepareWorkplaceAnalysis } from './public/workplace-analysis.mjs';
import { cleanModelConfig } from './public/model-config.mjs';
import { voiceAsset } from './voice-assets.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const endpoint = (process.env.MODEL_BASE_URL || 'http://127.0.0.1:18182/v1').replace(/\/$/, '');
const apiKey = process.env.MODEL_API_KEY;
const model = process.env.MODEL_NAME || 'qwen3-4b-instruct';
const modelMode = new Set(['127.0.0.1', 'localhost', '[::1]']).has(new URL(endpoint).hostname) ? 'local' : 'remote';
if (modelMode === 'remote' && !endpoint.startsWith('https://')) throw new Error('Remote model requires HTTPS.');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/audio.js': ['audio.js', 'text/javascript; charset=utf-8'],
  '/analysis-core.mjs': ['analysis-core.mjs', 'text/javascript; charset=utf-8'],
  '/workplace-analysis.mjs': ['workplace-analysis.mjs', 'text/javascript; charset=utf-8'],
  '/workplace-actions.mjs': ['workplace-actions.mjs', 'text/javascript; charset=utf-8'],
  '/android.js': ['android.js', 'text/javascript; charset=utf-8'],
  '/workspace.js': ['workspace.js', 'text/javascript; charset=utf-8'],
  '/casebook.mjs': ['casebook.mjs', 'text/javascript; charset=utf-8'],
  '/browser-api.js': ['browser-api.js', 'text/javascript; charset=utf-8'],
  '/provider-ui.js': ['provider-ui.js', 'text/javascript; charset=utf-8'],
  '/model-config.mjs': ['model-config.mjs', 'text/javascript; charset=utf-8'],
  '/local-device.js': ['local-device.js', 'text/javascript; charset=utf-8'],
  '/asr-worker.js': ['asr-worker.js', 'text/javascript; charset=utf-8'],
  '/asr-engine.mjs': ['asr-engine.mjs', 'text/javascript; charset=utf-8'],
  '/vendor/transformers.min.js': ['vendor/transformers.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/ort-wasm-simd-threaded.jsep.mjs': ['vendor/ort-wasm-simd-threaded.jsep.mjs', 'text/javascript; charset=utf-8'],
  '/vendor/ort-wasm-simd-threaded.jsep.wasm': ['vendor/ort-wasm-simd-threaded.jsep.wasm', 'application/wasm'],
  '/app.webmanifest': ['app.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png']
};

const defaultModel = { endpoint, model, key: apiKey, format: 'schema' };

function requestModelConfig(req, value) {
  if (value == null) return null;
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.localAddress);
  const origin = req.headers.origin;
  const actual = (req.socket.encrypted ? 'https://' : 'http://') + req.headers.host;
  if ((!req.socket.encrypted && !loopback) || origin !== actual ||
      (!req.socket.encrypted && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(actual).hostname))) {
    throw new RequestError(403, '请在 HTTPS 或本机浏览器入口使用自定义 API。');
  }
  try { return cleanModelConfig(value); }
  catch (error) { throw new RequestError(400, error.message); }
}

async function complete(recipe, signal, custom, test = false) {
  const config = custom || defaultModel;
  if (!custom && modelMode === 'remote' && !apiKey) throw new RequestError(503, '还未配置云端模型密钥。请联系运行此应用的人。');
  const headers = { 'Content-Type': 'application/json' };
  if (config.key) headers.Authorization = 'Bearer ' + config.key;
  const formats = test ? ['plain'] : config.format === 'auto' ? ['schema', 'json', 'plain'] : [config.format];
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(85_000)]);
  const messages = test ? [{ role: 'user', content: 'Reply only OK.' }] : [
    { role: 'system', content: recipe.prompt + (custom ? '\n只回复符合以下结构的 JSON。JSON Schema：' + JSON.stringify(recipe.schema) : '') },
    { role: 'user', content: JSON.stringify(recipe.input) }
  ];
  for (const [index, format] of formats.entries()) {
    const response = await fetch(config.endpoint + '/chat/completions', {
      method: 'POST', headers, signal: timeout, redirect: 'error',
      body: JSON.stringify({
        model: config.model,
        ...(custom ? {} : { temperature: recipe?.temperature ?? 0.2 }),
        max_tokens: test ? 128 : 1450,
        ...(format === 'schema' ? { response_format: { type: 'json_schema', json_schema: { name: recipe.name, strict: true, schema: recipe.schema } } } : {}),
        ...(format === 'json' ? { response_format: { type: 'json_object' } } : {}),
        ...(!custom && modelMode === 'remote' ? { enable_thinking: false } : {}),
        messages
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      if (index + 1 < formats.length && [400, 422].includes(response.status) && /schema|response[_ ]format/iu.test(detail)) continue;
      const message = response.status === 401 || response.status === 403 ? '模型服务拒绝了请求，请检查密钥和权限。'
        : response.status === 429 ? '模型服务限流或额度不足，请稍后重试。'
        : '模型服务返回 HTTP ' + response.status + '，请检查设置或返回格式。';
      throw new RequestError(502, message);
    }
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (test) {
      if (typeof content !== 'string' || !content.trim()) throw new RequestError(502, '模型返回了空回复，请检查 API 地址和模型名称。');
      return { connected: true };
    }
    return recipe.normalize(parseModelJson(content));
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, '请提交 JSON。');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65_000) throw new RequestError(413, '提交的内容太长。');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, '提交格式有误，请重新输入。');
  }
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'microphone=(self), camera=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"
};

async function handleRequest(req, res) {
  for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
  const path = (req.url || '/').split('?')[0];
  try {
    if (path === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, { modelMode, model, analysisVersion: 'contextual-2' });
    }
    if (['/api/analyze', '/api/profile-insight', '/api/profile-suggestion', '/api/model-test'].includes(path) && req.method === 'POST') {
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, '请在弦外页面内提交分析。');
      const body = await readJson(req);
      const config = requestModelConfig(req, body?.modelConfig);
      const controller = new AbortController();
      res.once('close', () => controller.abort());
      const test = path === '/api/model-test';
      if (test && !config) throw new RequestError(400, '请填写要测试的模型设置。');
      const recipe = test ? null : path === '/api/analyze' ? prepareWorkplaceAnalysis(body)
        : path === '/api/profile-suggestion' ? prepareProfileSuggestion(body) : prepareProfileInsight(body);
      const result = await complete(recipe, controller.signal, config, test);
      return sendJson(res, 200, result);
    }
    const assetPrefix = '/voice-model/whisper-base/';
    if (path.startsWith(assetPrefix) && ['GET', 'HEAD'].includes(req.method)) {
      const asset = await voiceAsset(path.slice(assetPrefix.length)).catch(() => {
        throw new RequestError(503, '暂时无法准备转写模型，请稍后重试。');
      });
      if (!asset) throw new RequestError(404, '找不到转写模型文件。');
      if (res.destroyed) return;
      res.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.size, 'Cache-Control': 'private, max-age=604800' });
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(asset.path), res);
      return;
    }
    const file = Object.hasOwn(files, path) && files[path];
    if (!file || !['GET', 'HEAD'].includes(req.method)) throw new RequestError(404, '找不到这个页面。');
    const content = await readFile(new URL('./public/' + file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    if (error instanceof RequestError) return sendJson(res, error.status, { error: error.message });
    const offline = error.cause?.code === 'ECONNREFUSED';
    const message = offline ? '本地分析模型还没启动。启动后即可重试。'
      : error.name === 'TimeoutError' ? '分析超时了，可以缩短对话后重试。'
      : '这次没有生成完整结果，请重试。';
    sendJson(res, offline ? 503 : 502, { error: message });
  }
}

const { HTTPS_KEY, HTTPS_CERT } = process.env;
if (Boolean(HTTPS_KEY) !== Boolean(HTTPS_CERT)) throw new Error('Set HTTPS_KEY and HTTPS_CERT together.');
const server = HTTPS_KEY
  ? createSecureServer({ key: await readFile(HTTPS_KEY), cert: await readFile(HTTPS_CERT) }, handleRequest)
  : createServer(handleRequest);
server.listen(port, host, () => console.log('弦外已启动：' + (HTTPS_KEY ? 'https' : 'http') + '://' + host + ':' + port + ' · ' + modelMode));
