import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8793';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await page.goto(base + '/#personal');
  for (const filename of ['coordinator-personal.json', 'owner-personal.json']) {
    const file = fileURLToPath(new URL('../fixtures/' + filename, import.meta.url));
    const { profile } = JSON.parse(await readFile(file, 'utf8'));
    for (const [field, value] of Object.entries(profile)) await page.locator('#self-' + field).fill(value);
    await page.getByRole('button', { name: '保存个人信息' }).click();
    await page.getByText('个人信息已保存在本机。', { exact: true }).waitFor();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出个人信息' }).click();
    const data = await download;
    assert.equal(data.suggestedFilename(), '弦外-个人信息.json');
    await mkdir(new URL('results/', import.meta.url), { recursive: true });
    const saved = fileURLToPath(new URL('results/' + filename, import.meta.url));
    await data.saveAs(saved);
    assert.deepEqual(JSON.parse(await readFile(saved, 'utf8')).profile, profile);
  }
  console.log('Real browser exports prepared for native transfer.');
} finally {
  await browser.close();
}
