import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: process.env.EDGE_PATH
});
const base = 'http://127.0.0.1:8790';
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const page = await desktop.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(base + '/#profiles');
  await page.getByRole('button', { name: '新建档案' }).click();
  await page.getByLabel('怎么称呼这位上级？').fill('陈经理');
  await page.getByLabel(/你们的工作关系/).fill('交付负责人');
  await page.getByLabel(/他通常在意什么/).fill('交付时间');
  await page.getByLabel(/有代表性的例子/).fill('临近评审时会先问可展示稿。');
  await page.getByRole('button', { name: '保存档案' }).click();
  await page.getByText('档案已保存').waitFor();
  await page.getByRole('searchbox').fill('交付负责人');
  await page.getByRole('heading', { name: '陈经理' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '编辑档案' }).count(), 1);
  await page.getByRole('button', { name: '编辑档案' }).click();
  await page.getByLabel(/他通常在意什么/).fill('进度与风险');
  await page.getByRole('button', { name: '保存档案' }).click();
  await page.getByText('进度与风险', { exact: true }).waitFor();
  await page.getByText('迁移档案', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出档案' }).click();
  const download = await downloaded;
  const bytes = await readFile(await download.path());
  assert.equal(download.suggestedFilename(), '弦外-上级档案.json');
  const profiles = JSON.parse(bytes);
  assert.deepEqual(Object.keys(profiles).sort(), ['profiles', 'version']);
  assert.equal(profiles.profiles.length, 1);
  assert.equal(profiles.profiles[0].priority, '进度与风险');
  await writeFile(new URL('qa-profile.json', import.meta.url), bytes);

  const imported = await browser.newPage();
  await imported.goto(base + '/#profiles');
  const file = imported.locator('#profile-file');
  const backup = { name: 'export.json', mimeType: 'application/json', buffer: bytes };
  await file.setInputFiles(backup);
  await imported.getByText('已导入 1 份档案').waitFor();
  await file.setInputFiles(backup);
  await imported.getByText('没有需要导入的新档案').waitFor();
  await file.setInputFiles({ ...backup, buffer: Buffer.from('Invalid JSON') });
  await imported.getByText('无法导入，请选择弦外导出的档案文件').waitFor();
  await imported.reload();
  assert.equal(await imported.getByRole('heading', { name: '陈经理' }).count(), 1);
  await imported.close();

  await page.getByRole('link', { name: '工作台', exact: true }).click();
  await page.getByLabel('对话原文').fill('请把方案清理成可展示版本。');
  await page.getByRole('button', { name: '新建对话' }).click();
  assert.equal(await page.getByLabel('对话原文').inputValue(), '请把方案清理成可展示版本。');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '新建对话' }).click();
  assert.equal(await page.getByLabel('对话原文').inputValue(), '');
  await page.reload();
  assert.equal(await page.getByLabel('对话原文').inputValue(), '');

  await page.getByLabel('对话原文').fill('客户开会要拿这份方案。');
  await page.route('**/api/analyze', route => route.abort('failed'));
  await page.getByRole('button', { name: '开始解读' }).click();
  await page.locator('#analysis-error:not([hidden])').waitFor();
  assert.equal(await page.getByLabel('对话原文').inputValue(), '客户开会要拿这份方案。');
  await page.unroute('**/api/analyze');
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ['analyze', 'profiles', 'history', 'settings']) {
      await page.goto(base + '/#' + route);
      await page.locator('#' + route + '-view:not([hidden])').waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + '/' + route);
      assert.equal(await page.locator('[data-route][aria-current=page]').count(), 1);
    }
  }
  assert.deepEqual(errors, []);
  console.log('Edge: profile CRUD, backup/restore/dedup, draft cancel/reset, offline retry state and four routes at 4 widths passed');
} finally {
  await browser.close();
}
