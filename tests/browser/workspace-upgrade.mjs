import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:8790';
const chromiumPath = process.env.CHROME_PATH;
const browser = await chromium.launch({ executablePath: chromiumPath });
const artifact = name => fileURLToPath(new URL(name, import.meta.url));
const example = '这周先把评审稿过一遍，周五下午给项目组同步。';
const userReply = '收到，我会先核查评审稿风险点。想确认周五同步需要提交哪版？';

const context = await browser.newContext({
  viewport: { width: 1440, height: 1040 }, permissions: ['clipboard-read', 'clipboard-write'],
  serviceWorkers: 'block'
});
const page = await context.newPage();
const errors = [];
let payload;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/analyze', async route => {
  payload = route.request().postDataJSON();
  await route.fulfill({ status: 200, json: {
    stated: { text: '本周审稿，周五下午同步。', evidence: [example] },
    interpretations: [{ title: '提前排查交付风险', explanation: '周五要同步进度，可能需要把风险先梳理。', evidence: [example] }],
    question: '周五同步是要风险列表，还是可展示的评审稿？',
    profileEffect: '上次评审中，上级先关注可演示稿。',
    reply: '收到。周五同步是要风险列表，还是可展示的评审稿？'
  } });
});

try {
  await page.goto(base);
  await page.getByRole('heading', { name: '沟通工作台' }).waitFor();
  await page.screenshot({ path: artifact('workspace-desktop.png'), fullPage: true });
  await page.getByLabel('对话原文').fill(example);
  await page.getByLabel('沟通对象').selectOption('example-lin');
  await page.getByLabel('当时是什么情况？').fill('客户要先看可展示的评审稿。');
  await page.getByText('场景与回复口吻').click();
  await page.getByLabel('职场场景').selectOption('review');
  await page.getByLabel('回复口吻').selectOption('brief');
  await page.reload();
  assert.equal(await page.getByLabel('对话原文').inputValue(), example);
  assert.equal(await page.getByLabel('沟通对象').inputValue(), 'example-lin');
  await page.getByRole('button', { name: /继续草稿/ }).waitFor();

  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByRole('textbox', { name: '回复草稿' }).fill(userReply);
  assert.equal(payload.scenario, 'review');
  assert.equal(payload.tone, 'brief');
  await page.getByRole('button', { name: '复制回复' }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), userReply);
  await page.getByRole('button', { name: '保存到复盘' }).click();
  await page.getByRole('textbox', { name: '回复草稿' }).fill(userReply + ' 谢谢。');
  await page.getByRole('button', { name: '更新复盘' }).click();
  await page.getByRole('button', { name: /待跟进 · 1/ }).click();
  await page.getByRole('heading', { name: '沟通复盘' }).waitFor();
  assert.equal(await page.getByLabel('状态', { exact: true }).inputValue(), 'open');
  assert.equal(await page.locator('.review-card').count(), 1);
  await page.locator('.review-card > summary').getByText('本周审稿，周五下午同步。', { exact: true }).click();
  await page.getByLabel('记录标题').fill('客户评审方案交付');
  await page.getByLabel('标签（用顿号分隔）').fill('客户评审、交付');
  await page.getByLabel('跟进日期').fill('2025-01-01');
  await page.getByLabel('交付物', { exact: true }).fill('客户可展示的终稿');
  await page.getByLabel('负责人', { exact: true }).fill('项目组一号');
  await page.getByLabel('后来确认的情况').fill('后来确认只需提交一份可展示稿。');
  await page.getByRole('button', { name: '保存复盘' }).click();
  await page.getByRole('button', { name: '置顶', exact: true }).click();
  await page.getByText('已置顶', { exact: true }).waitFor();
  await page.getByText('当时的对话与解读').click();
  await page.getByText(userReply + ' 谢谢。', { exact: true }).waitFor();
  await page.screenshot({ path: artifact('workspace-review.png'), fullPage: true });
  await page.getByLabel('搜索记录').fill('项目组一号');
  assert.equal(await page.locator('.review-card').count(), 1);
  await page.getByLabel('搜索记录').fill('没有匹配值');
  await page.getByText('没有符合条件的记录。').waitFor();
  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByText('1 条到期或逾期').waitFor();
  await page.getByRole('link', { name: '上级档案', exact: true }).click();
  await page.getByLabel('搜索上级档案').fill('林主管');
  await page.getByRole('button', { name: '查看 1 条复盘' }).click();
  assert.equal(await page.locator('#review-profile-filter').inputValue(), 'example-lin');
  await page.reload();
  await page.locator('.review-card > summary').getByText('客户评审方案交付', { exact: true }).waitFor();
  assert.deepEqual(errors, []);

  const mobile = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  const phone = await mobile.newPage();
  await phone.goto(base);
  await phone.getByRole('heading', { name: '沟通工作台' }).waitFor();
  assert(await phone.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'mobile width must not overflow');
  await phone.screenshot({ path: artifact('workspace-mobile.png') });
  await phone.setViewportSize({ width: 320, height: 780 });
  assert(await phone.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'narrow width must not overflow');
  console.log('Draft restore, analysis payload, editable replies, copy, review updates, due dates, search, filtering, pin and mobile width passed');
} finally {
  await browser.close();
}
