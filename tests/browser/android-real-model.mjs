import { createServer } from 'node:https';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const certFolder = process.argv[2];
const trace = new URL('android-real-model.jsonl', import.meta.url);
await writeFile(trace, '');
const server = createServer({
  key: await readFile(join(certFolder, 'server.key')), cert: await readFile(join(certFolder, 'server.pem'))
}, async (req, res) => {
  if (req.url !== '/v1/chat/completions' || req.method !== 'POST' ||
      req.headers.authorization !== 'Bearer fixture-test-key') {
    res.writeHead(401).end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const input = JSON.parse(body);
    const upstream = await fetch('http://127.0.0.1:18182/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      signal: AbortSignal.timeout(80_000)
    });
    const response = await upstream.text();
    await appendFile(trace, JSON.stringify({ contentType: req.headers['content-type'],
      model: input.model, request: input, status: upstream.status, response: JSON.parse(response) }) + '\n');
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' }).end(response);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'QA upstream unavailable' }));
  }
});
server.listen(8791, '127.0.0.1', () => console.log('QA HTTPS passthrough to local Qwen ready.'));
