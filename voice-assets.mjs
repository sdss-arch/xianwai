import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const revision = '64da57285918e20ea79ea5c88eed7197933abaa8';
const source = 'https://huggingface.co/Xenova/whisper-base/resolve/' + revision + '/';
const cache = resolve(process.env.ASR_CACHE_DIR || fileURLToPath(new URL('./.runtime/voice', import.meta.url)), revision);
const downloads = new Map();
const modelFiles = {
  'config.json': [2248],
  'generation_config.json': [3776],
  'preprocessor_config.json': [339],
  'tokenizer.json': [2480466],
  'tokenizer_config.json': [282683],
  'onnx/decoder_model_merged_quantized.onnx': [53707539, 'a6beb6baabb66f00b6a686d828c95ffca6146d51900cbad0266cad38f64cf861'],
  'onnx/encoder_model_quantized.onnx': [23200850, '3e345e977b55620a37c0c2b2af0644e019afdfad562dcf71eb929bb7274285f9']
};

async function sizeOf(file) {
  try { return (await stat(file)).size; } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function verify(file, size, hash) {
  if (await sizeOf(file) !== size) throw new Error('Voice asset size mismatch.');
  if (!hash) return;
  const digest = createHash('sha256');
  for await (const data of createReadStream(file)) digest.update(data);
  if (digest.digest('hex') !== hash) throw new Error('Voice asset checksum mismatch.');
}

async function stage(name, path, size, hash) {
  await mkdir(dirname(path), { recursive: true });
  const partial = path + '.part';
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  let failure;
  try {
    await run(curl, ['--fail', '--location', '--silent', '--show-error', '--retry', '1', '--continue-at', '-', '--max-time', '150',
      source + name + '?download=true', '--output', partial], { windowsHide: true, timeout: 165_000 });
  } catch (error) {
    failure = error;
  }
  try {
    await verify(partial, size, hash);
  } catch (error) {
    if (await sizeOf(partial) >= size) await unlink(partial);
    throw failure || error;
  }
  await rename(partial, path);
}

export async function voiceAsset(name) {
  if (!Object.hasOwn(modelFiles, name)) return null;
  const [size, hash] = modelFiles[name];
  const path = resolve(cache, name);
  if (await sizeOf(path) !== size) {
    if (!downloads.has(name)) downloads.set(name, stage(name, path, size, hash).finally(() => downloads.delete(name)));
    await downloads.get(name);
  }
  return { name, path, size, type: name.endsWith('.json') ? 'application/json' : 'application/octet-stream' };
}

export function prepareVoiceAssets() {
  return Promise.all(Object.keys(modelFiles).map(voiceAsset));
}
