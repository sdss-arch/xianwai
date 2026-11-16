import { createServer } from 'node:https';
import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.argv[2];
const trace = new URL('./mock-model-trace.jsonl', import.meta.url);
await writeFile(trace, '');
const server = createServer({
  key: await readFile(join(directory, 'server.key')), cert: await readFile(join(directory, 'server.pem'))
}, async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return send(404, { error: 'test path' });
  if (req.headers.authorization !== 'Bearer fixture-test-key') return send(401, { error: 'test credentials' });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  await appendFile(trace, JSON.stringify(body) + '\n');
  if (body.response_format?.type === 'json_schema') return send(400, { error: 'response_format json_schema is unsupported' });
  const input = body.messages.length === 1 ? null : JSON.parse(body.messages[1].content);
  const content = !input ? 'OK' : JSON.stringify(input.confirmedOutcome ? {
    habit: '客户评审前说「过一遍」时，先确认交付物是不是可展示稿。',
    evidence: [1, 999]
  } : {
    stated: { text: '需要在评审前检查方案。', evidence: [1] },
    interpretations: [{ title: '可能需要可用稿', explanation: '交付要求还有待确认。', evidence: [1, 999] }],
    profileEffect: input.profile?.cases?.length ? '以往客户评审中，该上级要求过可展示稿。' : '',
    question: '我先列风险，还是改出可展示稿？',
    reply: ''
  });
  return send(200, { choices: [{ message: { content } }] });
});
server.listen(8791, '127.0.0.1', () => console.log('fixture TLS model ready'));
