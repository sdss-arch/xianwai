import { recognize } from './asr-engine.mjs';

const status = phase => self.postMessage({ phase });

self.onmessage = async ({ data: { samples } }) => {
  try {
    const output = await recognize(samples, status);
    self.postMessage({ phase: 'done', text: output.text, chunks: output.chunks });
  } catch (error) {
    console.error(error);
    status('error');
  }
};
