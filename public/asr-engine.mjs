import { env, pipeline } from '/vendor/transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/voice-model/';
env.backends.onnx.wasm.wasmPaths = '/vendor/';
env.backends.onnx.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(3, navigator.hardwareConcurrency || 1) : 1;
if (globalThis.XianwaiPhone || globalThis.XianwaiAndroid) env.useBrowserCache = false;

let interpreter;

export async function recognize(samples, status) {
  if (!interpreter) {
    status('loading');
    interpreter = await pipeline('automatic-speech-recognition', 'whisper-base', {
      device: 'wasm',
      dtype: 'q8'
    });
  }
  status('transcribing');
  await new Promise(resolve => setTimeout(resolve, 25));
  return interpreter(samples, {
    language: 'chinese',
    task: 'transcribe',
    chunk_length_s: 28,
    stride_length_s: 4,
    return_timestamps: true,
    no_repeat_ngram_size: 5
  });
}
