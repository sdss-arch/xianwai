from qa_device import *
import sys

assert is_qa_device()
assert '0.5.1' in adb('shell', 'dumpsys', 'package', PACKAGE)
denied = lambda s: s.casefold() in {'don’t allow', "don't allow", '不允许'}
if '--after-denial' not in sys.argv:
    if not any(denied(label(node)) for node in tree()):
        adb('shell', 'pm', 'revoke', PACKAGE, 'android.permission.RECORD_AUDIO')
        adb('shell', 'pm', 'clear-permission-flags', PACKAGE, 'android.permission.RECORD_AUDIO', 'user-set', 'user-fixed', check=False)
        launch(restart=True)
        locate('沟通工作台')
        tap('录音与音频')
        tap('开始录音', scroll='down')
    tap(denied, timeout=12)
    locate('开始录音', timeout=10)
adb('shell', 'pm', 'grant', PACKAGE, 'android.permission.RECORD_AUDIO')
tap('开始录音', scroll='down')
locate('停止录音')
screenshot('02-录音与音频')
sleep(2)
tap('停止录音')
locate(lambda s: s.startswith('录音 ') and s.endswith('.m4a'), scroll='down')
tap('复盘')
tap('本机录音')
locate(lambda s: s.startswith('录音 ·'))
screenshot('07-本机录音')
adb('shell', 'svc', 'wifi', 'disable')
adb('shell', 'svc', 'data', 'disable')
try:
    deadline = monotonic() + 15
    while 'Active default network: none' not in adb('shell', 'dumpsys', 'connectivity'):
        assert monotonic() < deadline, 'Android did not go offline'
        sleep(1)
    adb('push', str(ROOT / 'tests/fixtures/mandarin.wav'), '/sdcard/Download/mandarin.wav')
    tap('工作台')
    tap('导入音频')
    choose_file('mandarin.wav')
    locate('校对并选句', timeout=150)
    lines = [label(n) for n in tree() if n.get('class') == 'android.widget.EditText']
    assert any('方案' in line for line in lines), lines
    tap(lambda s: s.startswith('选中第 1 句'), scroll='down')
    locate(lambda s: s.startswith('已选 1 /'), scroll='down')
    assert 'Active default network: none' in adb('shell', 'dumpsys', 'connectivity')
    screenshot('03-转写与校对选句')
    print('Android native microphone denial and recovery, recording, device-local audio library, offline WAV import and transcript selection passed.', flush=True)
finally:
    adb('shell','svc','wifi','enable')
    adb('shell','svc','data','enable')
