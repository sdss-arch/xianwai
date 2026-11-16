import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/mandarin.wav', import.meta.url));
const base = process.env.APP_URL || 'http://127.0.0.1:8789';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + fixture]
});
const messages = [];
const requests = [];
const context = await browser.newContext({ ...devices['iPhone 13'], permissions: ['microphone'], serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', error => messages.push(error.toString()));
page.on('console', message => { if (message.type() === 'error') console.log('browser:', message.text().slice(0, 1000)); });
page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
page.on('response', response => { if (!response.ok() && response.status() !== 304) console.log('http:', response.status(), response.url()); });

try {
  await page.goto(base);
  await page.getByRole('button', { name: '录音与音频' }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
  await page.locator('#audio-file').setInputFiles(fixture);

  await page.locator('#transcript:not([hidden]), #audio-error:not([hidden])').first().waitFor({ timeout: 120000 });
  assert(await page.locator('#audio-error').isHidden(), await page.locator('#audio-error').textContent());
  const allText = await page.getByRole('textbox', { name: /校对第/ }).evaluateAll(items => items.map(item => item.value));
  console.log('real recognition:', allText);
  assert(allText.length >= 2);
  assert.match(allText.join(''), /方案|開會|开会/);
  assert(requests.every(request => (request.url.startsWith(base) || request.url.startsWith('blob:' + base)) && request.method === 'GET'), 'Transcription must not upload audio or use another origin.');
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByText('请先转写并勾选要解读的句子。', { exact: true }).waitFor();
  const verified = '这个方案你先过一遍，明早开会要用。';
  await page.getByLabel('校对第 1 句').fill(verified);
  await page.getByLabel('校对第 2 句').fill('这是故意未勾选的句子。');
  await page.getByRole('checkbox', { name: '选中第 1 句' }).check();
  await page.getByLabel('沟通对象').selectOption('example-lin');
  await page.getByLabel('当时是什么情况？').fill('明早是客户评审，会直接用这份方案。');
  const request = page.waitForRequest(req => req.url() === base + '/api/analyze');
  const response = page.waitForResponse(res => res.url() === base + '/api/analyze', { timeout: 90000 });
  await page.getByRole('button', { name: '开始解读' }).click();
  const payload = (await request).postDataJSON();
  assert.equal(payload.dialogue, verified);
  assert.equal(payload.profile.name, '林主管');
  assert(!JSON.stringify(payload).includes('这是故意未勾选的句子。'));
  const analysis = await response;
  console.log('actual analysis:', JSON.stringify(await analysis.json()));
  assert(analysis.ok());
  await page.getByText('本次解读', { exact: true }).waitFor();
  await page.getByRole('button', { name: '移除音频' }).click();
  await page.getByRole('button', { name: '开始录音' }).click();
  await page.getByRole('button', { name: '停止录音' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#recording-time').textContent === '录音中 00:08', { timeout: 12000 });
  await page.getByRole('button', { name: '停止录音' }).click();
  await page.locator('#audio-preview:not([hidden]), #audio-error:not([hidden])').first().waitFor({timeout:15000});
  console.log('capture result:', await page.locator('#audio-name').textContent(), await page.locator('#audio-error').textContent());
  assert(await page.locator('#audio-error').isHidden(), await page.locator('#audio-error').textContent());
  await page.getByRole('button', { name: '转成文字' }).click();

  await page.getByRole('heading', { name: '校对并选句' }).waitFor({ timeout: 120000 });
  const recorded = await page.getByRole('textbox', { name: /校对第/ }).evaluateAll(items => items.map(item => item.value));
  console.log('real recorded recognition:', recorded);
  assert.match(recorded.join(''), /方案|開會|开会/);
  assert(requests.filter(request => request.method === 'POST').length === 1);
  assert.deepEqual(messages, []);
  console.log('audio import, capture, on-device ASR, correction, selected-only submission, and actual analysis passed');
} finally {
  await browser.close();
}


