from pathlib import Path
import os
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
version = '0.5.1' if '--v051' in sys.argv else ('0.5.0' if '--v05' in sys.argv else ('0.4.0' if '--upgrade' in sys.argv else '0.3.0'))
apk = Path(os.environ.get('XIANWAI_APK') or root.parent.parent / 'outputs' / ('弦外-Android-' + version + '.apk'))
adb = Path(os.environ.get('ADB') or shutil.which('adb') or root / 'platform-tools' / 'adb.exe')
package = 'app.xianwai.workplace'


def run(*args, check=True):
    result = subprocess.run([str(adb), '-s', 'emulator-5556', *args], capture_output=True, timeout=40)
    output = result.stdout.decode('utf-8', 'replace') + result.stderr.decode('utf-8', 'replace')
    if check and result.returncode:
        raise RuntimeError(output)
    return output


def tree():
    output = run('shell', 'uiautomator', 'dump', '/sdcard/xianwai-window.xml', check=False)
    if 'dumped to' not in output:
        return None
    return ET.fromstring(run('shell', 'cat', '/sdcard/xianwai-window.xml').strip())


def wait_text(text, duration=45, prefix=False):
    deadline = time.monotonic() + duration
    last = []
    while time.monotonic() < deadline:
        content = tree()
        if content is not None:
            last = [item.get('text') for item in content.iter('node') if item.get('text')]
            if text == '校对并选句' and any(item.startswith('本机转写未完成') for item in last):
                raise RuntimeError('Android ASR showed its error state.')
            for item in content.iter('node'):
                value = item.get('text', '')
                if (value.startswith(text) if prefix else value == text):
                    return item
        time.sleep(1)
    raise RuntimeError(f'{text!r} not found. Last UI: {last}')


def tap(text):
    left, top, right, bottom = map(int, re.findall(r'\d+', wait_text(text).get('bounds')))
    run('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))


def tap_description(description):
    content = tree()
    item = next(value for value in content.iter('node') if value.get('content-desc') == description)
    left, top, right, bottom = map(int, re.findall(r'\d+', item.get('bounds')))
    run('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))

if '--offline' in sys.argv:
    if '--install-offline' in sys.argv:
        print(run('install', '-r', str(apk)).strip(), flush=True)
        run('shell', 'am', 'start', '-W', '-n', package + '/.MainActivity')
    run('shell', 'svc', 'wifi', 'disable')
    run('shell', 'svc', 'data', 'disable')
    try:
        if '--ready-file' not in sys.argv:
            if '--picker-open' not in sys.argv:
                if '--install-offline' in sys.argv:
                    tap('录音与音频')
                else:
                    tap('解读')
                tap('导入音频')
            tap('mandarin.wav')
        run('shell', 'input', 'swipe', '652', '1220', '652', '685', '300')
        tap('转成文字')
        wait_text('校对并选句', duration=115)
        content = tree()
        text = ' '.join(item.get('text', '') for item in content.iter('node'))
        if '方案' not in text:
            raise RuntimeError(text)
        print('Android APK transcribed a phone-local Mandarin WAV with network disabled.', flush=True)
    finally:
        run('shell', 'svc', 'wifi', 'enable')
        run('shell', 'svc', 'data', 'enable')
    sys.exit(0)


deadline = time.monotonic() + 160
while time.monotonic() < deadline:
    if run('shell', 'getprop', 'sys.boot_completed', check=False).strip() == '1':
        break
    time.sleep(3)
else:
    raise RuntimeError('Emulator did not complete boot.')

print(run('install', '-r', str(apk)).strip(), flush=True)
run('shell', 'pm', 'grant', package, 'android.permission.RECORD_AUDIO')
print(run('shell', 'am', 'start', '-W', '-n', package + '/.MainActivity').strip(), flush=True)
if '--seed' in sys.argv:
    wait_text('沟通工作台')
    tap('录音与音频')
    tap('开始录音')
    wait_text('停止录音')
    time.sleep(2)
    tap('停止录音')
    tap('复盘')
    tap('本机录音')
    wait_text('录音 ·', prefix=True)
    print(version + ' created a local microphone recording.', flush=True)
    sys.exit(0)
if '--upgrade' in sys.argv:
    wait_text('沟通工作台')
    tap('复盘')
    tap('本机录音')
    wait_text('录音 ·', prefix=True)
    print(version + ' installed. Workbench opened and existing recording remained accessible.', flush=True)
    if '--v051' in sys.argv:
        previous = {item.get('text') for item in tree().iter('node') if (item.get('text') or '').startswith('录音 ·')}
        tap('工作台')
        tap('录音与音频')
        tap('开始录音')
        wait_text('停止录音')
        time.sleep(2)
        tap('停止录音')
        tap('复盘')
        tap('本机录音')
        wait_text('录音 ·', prefix=True)
        current = {item.get('text') for item in tree().iter('node') if (item.get('text') or '').startswith('录音 ·')}
        assert current - previous, (previous, current)
        print(version + ' created a new local microphone recording.', flush=True)
    if '--v05' in sys.argv or '--v051' in sys.argv:
        run('push', str(root.parent / 'fixtures' / 'mandarin.wav'), '/sdcard/Download/mandarin.wav')
        run('shell', 'svc', 'wifi', 'disable')
        run('shell', 'svc', 'data', 'disable')
        try:
            for _ in range(12):
                if 'Active default network: none' in run('shell', 'dumpsys', 'connectivity'):
                    break
                time.sleep(1)
            tap('工作台')
            tap('导入音频')
            try:
                wait_text('mandarin.wav', duration=7)
            except RuntimeError:
                tap_description('Show roots')
                tap('Downloads')
            tap('mandarin.wav')
            wait_text('校对并选句', duration=115)
            content = tree()
            text = ' '.join(item.get('text', '') for item in content.iter('node'))
            assert '方案' in text, text
            assert 'Active default network: none' in run('shell', 'dumpsys', 'connectivity')
            print('Android imported a file and transcribed automatically with no network.', flush=True)
        finally:
            run('shell', 'svc', 'wifi', 'enable')
            run('shell', 'svc', 'data', 'enable')
    sys.exit(0)
wait_text('这句话，怎么接？')
tap('录音与音频')
tap('开始录音')
wait_text('停止录音')
time.sleep(2)
tap('停止录音')
wait_text('录音 ', prefix=True)
tap('复盘')
tap('本机录音')
wait_text('录音 ·', prefix=True)
print('Signed APK installed and opened. Native microphone created an app-local recording.', flush=True)
