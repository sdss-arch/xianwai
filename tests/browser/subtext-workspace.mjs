import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { prepareWorkplaceAnalysis } from '../../public/workplace-analysis.mjs';

const base = process.argv[2] || 'http://127.0.0.1:8792';
const quote = '你这次考虑得真周到。';
const background = '上级发现漏掉了财务会签，把方案撤下。';
const personalAuthority = '对外承诺由主管拍板。';
const raw = { reading: 'irony', state: 'paused', surface: '字面称赞考虑周到。',
  dialogueRefs: [1, 99], contextRefs: [1, 100], signal: '漏签与表扬冲突，随后撤下。',
  next: '先补会签，再确认提报时间。', alternative: '', clarify: '', reply: '收到，我先补会签。' };
let parsed = prepareWorkplaceAnalysis({ dialogue: quote, context: background }).normalize(raw);
assert.equal(parsed.assessment.reading, 'irony');
assert.deepEqual(parsed.assessment.contextEvidence, [background]);
assert.equal(prepareWorkplaceAnalysis({ dialogue: quote, context: background }).normalize({ ...raw, reply: '' }).reply,
  '收到，我先补会签，再确认提报时间。');
const gated = prepareWorkplaceAnalysis({ dialogue: quote, context: '成本对比得到了肯定。等法务确认才能发客户。' }).normalize({
  ...raw, reading: 'praise', state: 'pending', contextRefs: [1, 2]
});
assert.equal(gated.assessment.reading, 'mixed');
assert.equal(gated.assessment.state, 'conditional');
parsed = prepareWorkplaceAnalysis({ dialogue: quote }).normalize(raw);
assert.equal(parsed.assessment.reading, 'unclear');
assert(parsed.assessment.clarify);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const session = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 950 } });
const page = await session.newPage();
const captured = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/analyze', async route => {
  const body = route.request().postDataJSON();
  captured.push(body);
  const response = body.dialogue.includes('交给你') ? {
    ...raw, reading: 'delegation', state: 'pending', signal: '本次是试点交办。'
  } : raw;
  await route.fulfill({ json: prepareWorkplaceAnalysis(body).normalize(response) });
});

try {
  await page.goto(base + '/#personal');
  await page.getByRole('heading', { name: '个人信息' }).waitFor();
  await page.getByLabel('职位', { exact: true }).fill('客户运营专员');
  await page.getByLabel('当前项目的角色').fill('执行负责人');
  await page.getByLabel('职责与权限').fill(personalAuthority);
  await page.getByLabel('性格与沟通偏好').fill('偏好直接反馈');
  await page.getByRole('button', { name: '保存个人信息' }).click();
  await page.getByText('个人信息已保存在本机。').waitFor();
  await page.reload();
  assert.equal(await page.getByLabel('职位', { exact: true }).inputValue(), '客户运营专员');

  await page.getByRole('link', { name: '工作台', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: '解读时参考我的信息' });
  assert.equal(await toggle.isChecked(), false);
  await page.getByLabel('对话原文').fill(quote);
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByRole('heading', { name: '语境不足' }).waitFor();
  assert.equal(captured[0].self, undefined);
  await toggle.check();
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByRole('heading', { name: '语境不足' }).waitFor();
  await page.locator('#clarification').fill(background);
  await page.getByRole('button', { name: '补充后重新解读' }).click();
  await page.getByRole('heading', { name: '反话批评' }).waitFor();
  assert.equal(captured[2].context, background);
  assert.equal(captured[2].self.authority, personalAuthority);
  await page.getByText(background, { exact: true }).waitFor();
  await page.getByText('先补会签，再确认提报时间。', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 840 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: '保存到复盘' }).click();
  await page.getByRole('link', { name: '复盘', exact: true }).click();
  await page.locator('.review-card > summary').click();
  await page.getByText('当时的对话与解读').click();
  await page.locator('#review-list').getByText('先补会签，再确认提报时间。', { exact: true }).waitFor();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('xianwai.review.v1')));
  assert.equal(history.length, 1);
  assert.equal(history[0].self, undefined);
  assert.equal(history[0].result.assessment.reading, 'irony');
  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByLabel('对话原文').fill('你很有想法，这事就交给你了。');
  await page.getByLabel('当时是什么情况？').fill('续约试点需要协调排期。');
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByRole('heading', { name: '交办与权限边界' }).waitFor();
  await page.getByText('你提供的职责与权限', { exact: true }).waitFor();
  await page.getByText(personalAuthority, { exact: true }).waitFor();
  assert.match(await page.getByRole('textbox', { name: '回复草稿' }).inputValue(), /对外承诺由您拍板/u);
  await page.getByRole('button', { name: '保存到复盘' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('xianwai.review.v1'));
  assert(!saved.includes(personalAuthority), 'The exact self-profile entry must not be copied into saved reviews.');
  assert.deepEqual(errors, []);
  console.log('Personal profile, opt-in payload, clarifying loop, evidence, and saved decision passed.');
} finally {
  await browser.close();
}
