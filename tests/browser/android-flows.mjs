import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:8790';
const audio = fileURLToPath(new URL('../fixtures/mandarin.m4a', import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.toString()));
await page.route(base + '/recordings-local/sample.m4a', route => route.fulfill({ path: audio, contentType: 'audio/mp4' }));
await page.addInitScript(() => {
  let saved = { configured: false };
  const recording = { id: 'sample', name: '测试录音.m4a', url: '/recordings-local/sample.m4a', time: Date.now(), size: 10000 };
  window.received = [];
  window.XianwaiAndroid = { dispatch(id, action, contents) {
    const data = JSON.parse(contents);
    window.received.push({ action, data });
    const actions = {
      settings: () => saved,
      saveSettings: () => {
        saved = { configured: true, endpoint: data.endpoint, model: data.model, format: data.format, hasKey: !!data.key };
        return saved;
      },
      testSettings: () => 'OK',
      startRecording: () => true,
      stopRecording: () => recording,
      listRecordings: () => [recording],
      copy: () => true,
      complete() {
        const input = JSON.parse(data.messages[1].content);
        if (input.confirmedOutcome) return JSON.stringify({ habit: '评审前先确认要风险点还是成稿。', evidence: [1, 999] });
        return JSON.stringify({ stated: { text: '明早开会要用', evidence: [1] },
          interpretations: [{ title: '梳理问题', explanation: '可能需要把明显问题列出来。', evidence: [1, 999] }],
          profileEffect: '此前更关注可演示稿。', question: '需要我先标问题，还是直接改稿？', reply: '' });
      }
    };
    setTimeout(() => window.XianwaiNativeResult(id, true, actions[action]?.()), 0);
  } };
});

try {
  await page.goto(base);
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByLabel('服务商模板').selectOption('bailian');
  assert.equal(await page.getByLabel('HTTPS API 地址').inputValue(), 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  await page.getByLabel('模型名称').fill('demo-model');
  await page.getByLabel('API 密钥').fill('dummy-verification-key');
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.getByText('连接成功。测试只发送了示例消息。').waitFor();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByText('模型设置已保存。').waitFor();
  assert.equal(await page.getByLabel('API 密钥').inputValue(), '');
  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByRole('button', { name: '录音与音频' }).click();
  await page.getByRole('button', { name: '开始录音' }).click();
  await page.getByRole('button', { name: '停止录音' }).click();
  await page.getByText('测试录音.m4a', { exact: true }).waitFor();
  await page.getByRole('button', { name: '转成文字' }).click();
  await page.getByRole('heading', { name: '校对并选句' }).waitFor({ timeout: 120000 });
  const original = '明早开会要用。';
  await page.getByLabel('校对第 1 句').fill(original);
  await page.getByLabel('校对第 2 句').fill('这句绝不能提交。');
  await page.getByRole('checkbox', { name: '选中第 1 句' }).check();
  await page.getByLabel('沟通对象').selectOption('example-lin');
  await page.getByText('场景与回复口吻').click();
  await page.getByLabel('职场场景').selectOption('review');
  await page.getByLabel('回复口吻').selectOption('brief');
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.getByText('本次解读', { exact: true }).waitFor();
  const sent = await page.evaluate(() => window.received.find(item => item.action === 'complete').data);
  const input = JSON.parse(sent.messages[1].content);
  assert.deepEqual(input.dialogue, [{ id: 1, text: original }]);
  assert.equal(input.profile.name, '林主管');
  assert.equal(input.scenario, 'review');
  assert.equal(input.tone, 'brief');
  await page.getByRole('button', { name: '复制回复' }).click();
  await page.getByText('回复已复制', { exact: true }).waitFor();
  await page.getByRole('button', { name: '保存到复盘' }).click();
  await page.getByRole('link', { name: '复盘', exact: true }).click();
  await page.locator('.review-card').getByText('明早开会要用', { exact: true }).click();
  await page.getByLabel('复盘状态').selectOption('confirmed');
  await page.getByLabel('后来确认的情况').fill('主管只要求我列风险。');
  await page.getByRole('button', { name: '保存复盘' }).click();
  await page.getByRole('heading', { name: '档案更新建议' }).waitFor();
  await page.getByRole('button', { name: '加入上级档案' }).click();
  await page.getByText('已加入林主管的档案').waitFor();
  await page.getByRole('button', { name: '本机录音' }).click();
  await page.getByRole('button', { name: '打开转写' }).click();
  await page.getByText('测试录音.m4a', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Android UI bridge mock, actual ASR, API settings, selection, history, profile feedback and recordings passed');
} finally {
  await browser.close();
}
