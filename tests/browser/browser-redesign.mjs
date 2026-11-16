import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:8793';
const shot = name => fileURLToPath(new URL('screenshots/' + name, import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const session = await browser.newContext({ viewport: { width: 1440, height: 940 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await session.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(base);
  await page.getByRole('heading', { name: '记一段对话' }).waitFor();
  assert.equal(await page.getByLabel('对话原文').inputValue(), '');
  assert.equal(await page.locator('#profile-select option').count(), 1);
  assert.equal(await page.getByText('示例预览').count(), 0);
  const widthFits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert(await widthFits());
  await page.screenshot({ path: shot('browser-redesign-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '录音与音频' }).click();
  await page.getByRole('button', { name: '开始录音' }).waitFor();
  await page.getByRole('button', { name: '导入音频', exact: true }).waitFor();
  await page.getByRole('button', { name: '文字', exact: true }).click();
  const quote = '你很有想法，这事就交给你了。';
  await page.getByLabel('对话原文').fill(quote);
  await page.getByLabel('当时是什么情况？').fill('主管把续约试点交给我，请我协调排期。报价和对外承诺由主管拍板。');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '试一段示例' }).click();
  assert.match(await page.getByLabel('对话原文').inputValue(), /先过一遍/u);
  await page.getByRole('button', { name: '恢复原草稿' }).click();
  assert.equal(await page.getByLabel('对话原文').inputValue(), quote);
  const submission = page.waitForResponse(response => response.url() === base + '/api/analyze', { timeout: 90000 });
  await page.getByRole('button', { name: '开始解读' }).click();
  assert((await submission).ok());
  await page.getByRole('heading', { name: '现在怎么做' }).waitFor();
  const reply = page.getByRole('textbox', { name: '回复草稿' });
  const value = await reply.inputValue();
  assert.match(value, /报价和对外承诺由您拍板/u);
  assert(!value.includes('我按这个边界推进'));
  console.log(value);
  const positions = await page.locator('#result').evaluate(result =>
    [...result.querySelectorAll('h3')].map(heading => heading.textContent));
  assert.deepEqual(positions.slice(0, 2), ['现在怎么做', '回复草稿']);
  await page.getByText('原话依据', { exact: true }).waitFor();
  await page.screenshot({ path: shot('browser-redesign-result.png'), fullPage: true });
  await page.getByRole('button', { name: '复制回复' }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), value);
  await page.getByRole('button', { name: '保存到复盘' }).click();
  await page.getByRole('link', { name: '复盘', exact: true }).click();
  await page.locator('.review-card > summary').click();
  await page.getByText('当时的对话与解读').click();
  await page.locator('.review-card').getByText(value, { exact: true }).waitFor();
  await page.getByRole('link', { name: '上级档案', exact: true }).click();
  await page.getByRole('button', { name: '新建档案' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('heading', { name: '个人信息' }).waitFor();
  await page.getByRole('link', { name: '工作台', exact: true }).click();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await widthFits(), 'Horizontal overflow at ' + width);
    if (width === 390) await page.screenshot({ path: shot('browser-redesign-phone.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('Browser input, example recovery, real model, copy, review, profiles, settings and responsive layout passed.');
} finally {
  await browser.close();
}
