import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = 'http://127.0.0.1:8787';
const capture = name => fileURLToPath(new URL(name, import.meta.url));

try {
  await page.goto(base);
  await page.getByRole('heading', { name: '这句话，怎么接？' }).waitFor();
  await page.screenshot({ path: capture('home.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'mobile overflow');

  await page.getByRole('link', { name: '上级档案' }).click();
  await page.getByRole('button', { name: '新建档案' }).click();
  await page.getByLabel('怎么称呼这位上级？').fill('顾主管');
  await page.getByLabel('你们的工作关系').fill('研发负责人');
  await page.getByText('重视细节', { exact: true }).click();
  await page.getByLabel('他通常在意什么？').fill('复盘时希望先列清风险，不要求当场修。');
  await page.getByLabel('有代表性的例子').fill('上次他说先过一遍，上会时只让我说明两个风险点。');
  await page.getByRole('button', { name: '保存档案' }).click();
  await page.reload();
  const gu = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '顾主管' }) });
  await gu.getByText('重视细节', { exact: true }).waitFor();
  await page.screenshot({ path: capture('profiles.png'), fullPage: true });
  await gu.getByRole('button', { name: '用此档案解读' }).click();
  await page.getByLabel('对话原文').fill('顾主管：这个方案你先过一遍，明早开会要用。');
  await page.getByLabel('当时是什么情况？').fill('明早内部评审，大家只收集意见，会上再定下一版。');
  let response = page.waitForResponse(resp => resp.url().endsWith('/api/analyze'), { timeout: 90000 });
  await page.getByRole('button', { name: '开始解读' }).click();
  const internal = await response;
  const internalData = await internal.json();
  console.log('internal:', JSON.stringify(internalData));
  assert(internal.ok());
  assert(!/已(经)?(完成|修改|改了|看完|审完)/.test(internalData.reply));
  await page.getByText('本次解读', { exact: true }).waitFor();
  await page.getByText('参考档案 · 顾主管', { exact: true }).waitFor();
  assert(internalData.interpretations.every(item => item.evidence.every(quote => '顾主管：这个方案你先过一遍，明早开会要用。'.includes(quote))));
  const payload = internal.request().postDataJSON();
  assert.equal(payload.profile.name, '顾主管');
  assert(!JSON.stringify(payload).includes('林主管'));
  await page.getByRole('button', { name: '复制回复' }).click();
  await page.getByText('回复已复制', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), internalData.reply);
  await page.screenshot({ path: capture('analysis.png'), fullPage: true });

  await page.getByRole('button', { name: '试用示例' }).click();
  response = page.waitForResponse(resp => resp.url().endsWith('/api/analyze'), { timeout: 90000 });
  await page.getByRole('button', { name: '开始解读' }).click();
  const external = await response;
  const externalData = await external.json();
  console.log('external:', JSON.stringify(externalData));
  assert(external.ok());
  assert(!/已(经)?(完成|修改|改了|看完|审完)/.test(externalData.reply));
  assert.notEqual(internalData.reply, externalData.reply);
  await page.getByText('参考档案 · 林主管', { exact: true }).waitFor();
  await page.getByRole('link', { name: '上级档案' }).click();
  await gu.getByRole('button', { name: '编辑档案' }).click();
  await page.getByLabel('怎么称呼这位上级？').fill('顾负责人');
  response = page.waitForResponse(resp => resp.url().endsWith('/api/profile-insight'), { timeout: 90000 });
  await page.getByRole('button', { name: '从例子梳理沟通习惯' }).click();
  const insight = await response;
  const insightData = await insight.json();
  console.log('insight:', JSON.stringify(insightData));
  assert(insight.ok());
  await page.getByRole('heading', { name: '可能的沟通习惯' }).waitFor();
  assert(insightData.evidence.every(quote => '上次他说先过一遍，上会时只让我说明两个风险点。'.includes(quote)));
  if (insightData.preference) {
    await page.getByRole('button', { name: '加到「他通常在意什么」' }).click();
    assert((await page.getByLabel('他通常在意什么？').inputValue()).includes(insightData.preference));
  }
  await page.getByRole('button', { name: '保存档案' }).click();
  await page.getByRole('heading', { name: '顾负责人' }).waitFor();
  const updated = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '顾负责人' }) });
  await updated.getByRole('button', { name: '编辑档案' }).click();
  page.once('dialog', confirmation => confirmation.accept());
  await page.getByRole('button', { name: '删除档案' }).click();
  assert.equal(await page.getByRole('heading', { name: '顾负责人' }).count(), 0);
  assert.deepEqual(errors, []);
  const desktop = await browser.newPage({ viewport: { width: 1380, height: 900 } });
  await desktop.goto(base);
  await desktop.getByRole('heading', { name: '解读结果' }).waitFor();
  await desktop.screenshot({ path: capture('desktop.png') });
  assert(await desktop.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'desktop overflow');
  assert(await desktop.evaluate(async () => !!(await navigator.serviceWorker.ready)), 'service worker registered');
  console.log('mobile and desktop flow passed');
} finally {
  await browser.close();
}
