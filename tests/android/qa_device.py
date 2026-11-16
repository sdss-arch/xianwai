from pathlib import Path
from time import monotonic, sleep
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ADB = Path(os.environ.get('ADB') or shutil.which('adb') or ROOT / 'work/android/platform-tools/adb.exe')
SERIAL = os.environ.get('XIANWAI_ADB_SERIAL', 'emulator-5556')
PACKAGE = 'app.xianwai.workplace'
SHOT_DIR = Path(os.environ.get('XIANWAI_SHOT_DIR') or ROOT / 'tests/android/shots')


def adb(*args, check=True, binary=False, timeout=45):
    call = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if binary:
        call.check_returncode()
        return call.stdout
    output = (call.stdout + call.stderr).decode('utf-8', errors='replace').strip()
    if check and call.returncode:
        raise RuntimeError(output)
    return output


def launch(restart=False):
    if restart:
        adb('shell', 'am', 'force-stop', PACKAGE)
    return adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')


def tree():
    dump = adb('shell', 'uiautomator', 'dump', '/sdcard/xianwai-qa.xml', check=False)
    if 'dumped to' not in dump:
        return []
    raw = adb('shell', 'cat', '/sdcard/xianwai-qa.xml')
    return list(ET.fromstring(raw).iter('node'))


def bounds(node):
    return tuple(map(int, re.findall(r'\d+', node.get('bounds', ''))))


def label(node):
    return node.get('text') or node.get('content-desc') or ''


def dump():
    for node in tree():
        if label(node) or node.get('resource-id'):
            print(label(node), node.get('resource-id'), node.get('class'), bounds(node))


def swipe(direction='down', distance=640):
    start, end = (1250, 1250 - distance) if direction == 'down' else (500, 500 + distance)
    adb('shell', 'input', 'swipe', '590', str(start), '590', str(end), '380')
    sleep(0.35)


def key(name):
    adb('shell', 'input', 'keyevent', name)


def back():
    key('KEYCODE_BACK')


def matches(node, text):
    return bool(text(label(node)) if callable(text) else label(node) == text or node.get('resource-id') == text)


def locate(text, timeout=15, scroll=None):
    deadline = monotonic() + timeout
    last = []
    while monotonic() < deadline:
        last = tree()
        for node in last:
            if matches(node, text):
                left, top, right, bottom = bounds(node)
                if left < right and top < bottom:
                    return node
        if scroll:
            swipe(scroll, 560)
        else:
            sleep(0.25)
    raise AssertionError(f'Cannot find {text!r}; visible text: {[label(n) for n in last if label(n)]}')


def touch(node):
    left, top, right, bottom = bounds(node)
    adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))
    sleep(0.35)


def tap(text, **options):
    touch(locate(text, **options))


def screenshot(name):
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    file = SHOT_DIR / (name + '.png')
    data = adb('exec-out', 'screencap', '-p', binary=True)
    assert data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG'
    file.write_bytes(data)
    print('Screenshot:', name, flush=True)


def text(value):
    adb('shell', 'input', 'text', value.replace(' ', '%s'))
    sleep(0.2)


def fill(field, value, clear=False):
    tap(field)
    if clear:
        adb('shell', 'input', 'keycombination', '113', '29')
    text(value)
    back()


def edit_inputs():
    return [n for n in tree() if n.get('class') == 'android.widget.EditText']


def edit_input(index, value, clear=False):
    node = edit_inputs()[index]
    touch(node)
    if clear:
        adb('shell', 'input', 'keycombination', '113', '29')
    text(value)
    back()


def choose_file(filename):
    try:
        tap(filename, timeout=6)
    except AssertionError:
        tap('Show roots')
        tap('Downloads')
        tap(filename)


def is_qa_device():
    return adb('shell', 'getprop', 'sys.boot_completed') == '1' and 'Xianwai_QA' in adb('emu', 'avd', 'name')


if __name__ == '__main__':
    dump()
