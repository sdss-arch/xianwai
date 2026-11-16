import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
try {
  const context=await browser.newContext({...devices['Pixel 7'], serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia=() => Promise.reject(new DOMException('Denied by tester', 'NotAllowedError'));
  });
  await page.goto('http://127.0.0.1:8790/#audio');
  await page.getByRole('button',{name:'开始录音'}).click();
  await page.getByText(/麦克风授权未开启/).waitFor();
  const file=page.locator('#audio-file');
  await file.setInputFiles({name:'empty.wav',mimeType:'audio/wav',buffer:Buffer.alloc(0)});
  await page.getByText(/请选择一段非空/).waitFor();
  await file.setInputFiles({name:'damaged.wav',mimeType:'audio/wav',buffer:Buffer.from('fake WAV')});
  await page.getByText(/无法读取这段音频/).waitFor();
  await page.getByRole('button',{name:'开始解读'}).click();
  await page.getByText(/请先转写并勾选/).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Microphone denial, empty file, corrupt WAV and no-selection errors passed');
} finally { await browser.close(); }
