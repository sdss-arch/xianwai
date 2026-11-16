import { writeFile } from 'node:fs/promises';
import { cases } from './subtext-cases.mjs';

const [base, output, ...ids] = process.argv.slice(2);
if (!base || !output) throw new Error('Usage: node run-subtext-bench.mjs BASE OUTPUT [IDS...]');
const configResponse = await fetch(new URL('/api/config', base), { signal: AbortSignal.timeout(10_000) });
if (!configResponse.ok) throw new Error('Cannot read model configuration.');
const config = await configResponse.json();
const results = [];
for (const item of (ids.length ? ids.map(id => cases.find(item => item.id === id)) : cases)) {
  const start = Date.now();
  let result;
  try {
    const response = await fetch(new URL('/api/analyze', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.input), signal: AbortSignal.timeout(130_000)
    });
    const body = await response.json();
    result = { status: response.status, body };
  } catch (error) {
    result = { error: error.message };
  }
  const elapsed = Date.now() - start;
  results.push({ id: item.id, elapsed, ...result });
  await writeFile(output, JSON.stringify({ config, results }, null, 2), 'utf8');
  console.log(item.id, result.status ?? result.error, elapsed, result.body?.assessment?.reading || '');
}
