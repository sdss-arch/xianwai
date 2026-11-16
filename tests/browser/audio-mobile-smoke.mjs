import { chromium, devices, webkit } from 'playwright';
import { createHash, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const byWebKit = process.argv.includes('--webkit');
const fixture = type => fileURLToPath(new URL('../fixtures/mandarin.' + type, import.meta.url));
let browser;
let base;
if (byWebKit) {
  browser = await webkit.launch();
  base = 'http://127.0.0.1:8787';
} else {
  if (!process.env.XIANWAI_TLS_CERT) throw new Error('Set XIANWAI_TLS_CERT to the HTTPS test server certificate (server.pem).');
  const leaf = await readFile(process.env.XIANWAI_TLS_CERT);
  const spki = new X509Certificate(leaf).publicKey.export({ type: 'spki', format: 'der' });
  const pin = createHash('sha256').update(spki).digest('base64');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--ignore-certificate-errors-spki-list=' + pin, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  base = process.env.XIANWAI_BASE_URL || 'https://127.0.0.1:8788';
}
try {
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', ...(byWebKit ? {} : { permissions: ['microphone'] }) });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') console.log('browser:', message.text().slice(0, 750)); });
  await page.goto(base + '/#audio');
  assert(await page.locator('#audio-input').isVisible());
  assert(await page.evaluate(() => isSecureContext));
  if (!byWebKit) {
    await page.getByRole('button', { name: '开始录音' }).click();
    await page.getByRole('button', { name: '停止录音' }).waitFor();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: '停止录音' }).click();
    await page.getByText(/弦外录音\./).waitFor();
    await page.getByRole('button', { name: '移除音频' }).click();
  }
  await page.locator('#audio-file').setInputFiles(fixture(byWebKit ? 'wav' : 'm4a'));
  await page.getByRole('button', { name: '转成文字' }).click();
  await page.locator('#transcript:not([hidden]), #audio-error:not([hidden])').first().waitFor({ timeout: 120000 });
  assert(await page.locator('#audio-error').isHidden(), await page.locator('#audio-error').textContent());
  const lines = await page.getByRole('textbox', { name: /校对第/ }).evaluateAll(items => items.map(item => item.value));
  assert.match(lines.join(''), /方案/);
  console.log(byWebKit ? 'WebKit WAV transcription passed' : 'HTTPS microphone and M4A transcription passed', lines);
} finally {
  await browser.close();
}
