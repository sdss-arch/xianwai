import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { prepareAnalysis, prepareProfileSuggestion } from '../../public/analysis-core.mjs';

const base = 'http://127.0.0.1:8790';
const original = '客户评审前你先过一遍方案，明早会拿来展示。';
const next = '客户评审的这个方案，你能先过一遍吗？';
const outcome = '我确认这里的过一遍是改出可直接展示的版本。';
const editedHabit = '客户评审前提到过一遍方案时，先问清是否需要可直接展示的版本。';
const fixture = fileURLToPath(new URL('../fixtures/mandarin.wav', import.meta.url));
const trace = () => readFile(new URL('mock-model-trace.jsonl', import.meta.url), 'utf8')
  .then(value => value.trim().split('\n').filter(Boolean).map(JSON.parse));

const proposal = prepareProfileSuggestion({ dialogue: original, observed: outcome });
assert.deepEqual(proposal.normalize({ habit: '真实原话可核对。', evidence: [999, 1] }).evidence, [original]);
const profile = { name: '林主管', cases: [{ id: 'case1', scenario: 'review', evidence: [original], observed: outcome, habit: editedHabit }] };
const engine = prepareAnalysis({ dialogue: next, scenario: 'review', profile });
assert.equal(engine.input.profile.cases[0].quote[0], original);
const unrelated = prepareAnalysis({ dialogue: '报销款多久到账？', scenario: 'performance', profile });
assert.equal(unrelated.input.profile.cases.length, 0);
assert.deepEqual(engine.normalize({ stated: { text: '检查方案', evidence: [999, 1] }, question: '是评审稿吗？' }).stated.evidence, [next]);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + fixture]
});
const context = await browser.newContext({ permissions: ['microphone'], serviceWorkers: 'block', viewport: { width: 390, height: 840 } });
const page = await context.newPage();
const errors = [];
const transfers = [];
page.on('console', msg => { if (msg.type() === 'error') console.log('console', msg.text().slice(0, 1000)); });
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => transfers.push({ url: request.url(), method: request.method() }));
await page.addInitScript(() => {
  const key = 'xianwai.profiles.v1';
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, JSON.stringify([
    { id: 'example-lin', name: '林主管', position: '产品负责人', traits: ['表达委婉'], observations: '', priority: '', cases: [] },
    { id: 'case-other', name: '周主管', position: '', traits: [], observations: '', priority: '', cases: [
      { id: 'other-1', scenario: 'review', evidence: ['别的上级的专属原话。'], observed: '别的上级的结论。', habit: '别的上级的专属习惯。' }
    ] }
  ]));
});

try {
  await page.goto(base + '/#settings');
  await page.getByLabel('HTTPS API 地址').fill('https://127.0.0.1:8791/v1/chat/completions');
  await page.getByLabel('模型名称').fill('fixture-compatible-model');
  await page.getByLabel('API 密钥').fill('fixture-test-key');
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.getByText('连接成功。测试只发送了示例消息。').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByText('模型设置已保存。').waitFor();
  await page.reload();
  await page.getByRole('button', { name: '使用默认模型' }).waitFor();
  assert.equal(await page.getByLabel('API 密钥').inputValue(), '');
  const encrypted = await page.evaluate(async () => new Promise(resolve => {
    const open = indexedDB.open('xianwai-device');
    open.onsuccess = () => {
      const request = open.result.transaction('settings').objectStore('settings').get('provider');
      request.onsuccess = () => resolve(!request.result.key && request.result.ciphertext.byteLength > 16);
    };
  }));
  assert(encrypted);
  await page.getByRole('button', { name: '使用默认模型' }).click();
  await page.getByRole('button', { name: '启用自定义模型' }).click();
  await page.getByText('已启用自定义模型。').waitFor();

  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByLabel('沟通对象').selectOption('example-lin');
  await page.getByLabel('对话原文').fill(original);
  await page.getByLabel('当时是什么情况？').fill('客户评审');
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByText('本次解读', { exact: true }).waitFor();
  await page.getByRole('button', { name: '保存到复盘' }).click();
  await page.getByRole('link', { name: '复盘', exact: true }).click();
  await page.locator('.review-card > summary').click();
  await page.getByLabel('复盘状态').selectOption('confirmed');
  await page.getByLabel('后来确认的情况').fill(outcome);
  await page.getByRole('button', { name: '保存复盘' }).click();
  await page.getByRole('heading', { name: '档案更新建议' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.profile-proposal textarea')?.value.includes('先确认交付物是不是可展示稿'));
  assert.deepEqual(await page.locator('.profile-proposal blockquote').allTextContents(), [original]);
  assert(await page.locator('.profile-proposal').getByText(outcome, { exact: true }).isVisible());
  const storedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('xianwai.profiles.v1'))[0].cases.length);
  assert.equal(storedBefore, 0);
  await page.getByLabel('建议记录的沟通习惯').fill(editedHabit);
  await page.getByRole('button', { name: '加入上级档案' }).click();
  await page.getByText('已收录到这位上级的档案。').waitFor();
  await page.getByRole('link', { name: '上级档案', exact: true }).click();
  await page.getByText('已收录案例 · 1', { exact: true }).first().click();
  await page.getByText(editedHabit, { exact: true }).waitFor();

  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByLabel('对话原文').fill(next);
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByText('本次解读', { exact: true }).waitFor();
  await page.getByText('参考的历史案例 · 1', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('#result .result-card blockquote').allTextContents(), [next, next]);
  const modelTrace = await trace();
  assert(modelTrace.some(row => row.response_format?.type === 'json_schema'));
  const forwarded = modelTrace.filter(row => row.messages.length > 1).map(row => JSON.parse(row.messages[1].content));
  assert(forwarded.some(row => row.confirmedOutcome === outcome));
  const sent = forwarded.filter(row => row.dialogue[0].text === next).at(-1);
  assert.equal(sent.profile.cases[0].habit, editedHabit);
  assert.equal(sent.profile.cases[0].quote[0], original);
  assert(!JSON.stringify(sent).includes('别的上级'));

  const chooser = page.waitForEvent('filechooser');
  const analysisCount = transfers.filter(request => request.method === 'POST').length;
  await page.locator('#quick-import').click();
  await (await chooser).setFiles(fixture);
  await page.locator('#transcript:not([hidden]), #audio-error:not([hidden])').first().waitFor({ timeout: 100000 });
  assert(await page.locator('#audio-error').isHidden(), await page.locator('#audio-error').textContent());
  assert.match(await page.getByLabel('校对第 1 句').inputValue(), /方案/);
  assert.equal(transfers.filter(request => request.method === 'POST').length, analysisCount, 'Import must not submit any raw audio or text automatically.');
  await page.getByRole('button', { name: '开始录音' }).click();
  await page.getByRole('button', { name: '停止录音' }).waitFor();
  await page.waitForFunction(() => document.getElementById('recording-time').textContent.includes('00:03'));
  await page.getByRole('button', { name: '停止录音' }).click();
  await page.getByText('已保存到本机录音。').waitFor();
  await page.reload();
  await page.getByRole('link', { name: '复盘', exact: true }).click();
  await page.getByRole('button', { name: '本机录音', exact: true }).click();
  await page.getByRole('button', { name: '打开转写' }).click();
  await page.locator('#transcript:not([hidden]), #audio-error:not([hidden])').first().waitFor({ timeout: 100000 });
  assert(await page.locator('#audio-error').isHidden(), await page.locator('#audio-error').textContent());
  assert.deepEqual(errors, []);
  console.log('TLS custom API, encrypted settings, per-role evidence approval and retrieval, automatic import, browser microphone and local library passed');
} finally {
  await browser.close();
}

