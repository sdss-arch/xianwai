import json
import os
import sys
from qa_device import *

trace = ROOT / 'tests/browser/android-real-model.jsonl'
notes = Path(os.environ.get('XIANWAI_QA_NOTES') or ROOT / 'tests/android/notes-061.json')
release = Path(os.environ.get('XIANWAI_APK') or ROOT / 'outputs/弦外-Android-0.6.1.apk')


def read_trace():
    return [json.loads(line) for line in trace.read_text(encoding='utf-8').splitlines()]


def save_stage(name, value):
    data = json.loads(notes.read_text(encoding='utf-8')) if notes.exists() else {}
    data[name] = value
    notes.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def recordings_manifest():
    return adb('shell', 'cd /data/user/0/app.xianwai.workplace/files/recordings && sha256sum *.m4a').splitlines()


def upgrade():
    before = recordings_manifest()
    assert before, 'Previous install did not have recordings'
    locate('沟通工作台', timeout=25)
    tap('复盘')
    tap('解读记录')
    old_count = label(locate(lambda s: re.fullmatch(r'[1-9]\d* 条记录', s) is not None))
    print(adb('install', '-r', str(release)), flush=True)
    print(launch(restart=True), flush=True)
    locate('沟通工作台', timeout=25)
    assert 'versionName=0.6.1' in adb('shell', 'dumpsys', 'package', PACKAGE)
    assert before == recordings_manifest(), 'An existing local recording changed during upgrade'
    tap('复盘')
    tap('解读记录')
    locate(old_count)
    tap('本机录音')
    locate(lambda s: s.startswith('录音 · '))
    save_stage('upgrade', {'preserved_recordings': len(before), 'previous_review_count': old_count})
    print('Signed install -r preserved recording hashes and existing reviews.', flush=True)


def configure():
    tap('设置')
    locate('模型 API')
    edit_input(0, 'https://127.0.0.1:8791/v1', clear=True)
    edit_input(1, 'qwen3-4b-instruct', clear=True)
    edit_input(2, 'fixture-test-key', clear=True)
    tap('测试连接', scroll='down')
    locate('连接成功。测试只发送了示例消息。', timeout=40, scroll='down')
    tap('保存设置', scroll='down')
    locate('模型设置已保存。', timeout=10, scroll='down')
    check = read_trace()[-1]
    assert check['status'] == 200 and check['response']['choices'][0]['message']['content']
    print('Signed APK connected by HTTPS to real local Qwen.', flush=True)


def configure_role(filename='coordinator-personal.json'):
    adb('push', str(ROOT / ('tests/fixtures/' + filename)), '/sdcard/Download/' + filename)
    tap('设置')
    locate('个人信息', timeout=20, scroll='down')
    tap('导入个人信息', scroll='down', timeout=24)
    choose_file(filename)
    locate('已载入个人信息，确认后点保存。', timeout=15, scroll='down')
    tap('保存个人信息', scroll='up', timeout=16)
    locate('个人信息已保存在本机。', timeout=15, scroll='down')
    print('Personal data imported via the Android Files picker and saved locally.', flush=True)


def import_audio():
    tap('工作台')
    prefix = 'delegation-native.wav'
    adb('push', str(ROOT / ('tests/fixtures/' + prefix)), '/sdcard/Download/' + prefix)
    before = len(read_trace())
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    try:
        deadline = monotonic() + 15
        while 'Active default network: none' not in adb('shell', 'dumpsys', 'connectivity'):
            assert monotonic() < deadline, 'Android emulator still has a default network'
            sleep(1)
        tap('导入音频', timeout=15, scroll='up')
        choose_file(prefix)
        locate('校对并选句', timeout=140)
        locate(lambda s: '想法' in s and ('交給' in s or '交给' in s), timeout=120)
        values = [label(n) for n in edit_inputs() if label(n)][:3]
        assert len(values) >= 2 and any('想法' in s for s in values), values
        assert len(read_trace()) == before
        save_stage('offline_asr', {'transcript': values, 'model_requests_during_import': 0})
        print('The actual signed APK transcribed the Mandarin test audio while offline:', values, flush=True)
    finally:
        adb('shell', 'svc', 'wifi', 'enable')
        adb('shell', 'svc', 'data', 'enable')


def select_audio():
    row = locate(lambda s: '想法' in s and ('交給' in s or '交给' in s), timeout=20)
    if row.get('class') != 'android.widget.EditText':
        row = next(n for n in edit_inputs() if '想法' in label(n))
    original = label(row)
    touch(row)
    key('KEYCODE_MOVE_END')
    if original.endswith(('。', '！', '？', '.')):
        key('KEYCODE_DEL')
    text('.')
    back()
    tap('选中第 1 句', scroll='down')
    locate(lambda s: s.startswith('已选 1 /'), scroll='down')
    opt_in = locate('解读时参考我的信息', scroll='down')
    if opt_in.get('checked') != 'true':
        tap_visible('解读时参考我的信息')
    save_stage('correction', {'original': original, 'selected_rows': 1})
    print('Edited one transcript row in the WebView and kept one selected.', flush=True)


def tap_visible(text_to_tap, timeout=24):
    deadline = monotonic() + timeout
    while monotonic() < deadline:
        for node in tree():
            if matches(node, text_to_tap):
                left, top, right, bottom = bounds(node)
                if left < right and 48 < top < bottom < 1350:
                    touch(node)
                    return
        swipe('down', 390)
    raise AssertionError(f'Cannot tap {text_to_tap!r} above the navigation')


def interpret(role='执行协调', use_existing='no'):
    before = len(read_trace())
    if use_existing == 'yes':
        before -= 1
        swipe('up', 455)
    else:
        tap('工作台')
        tap_visible('开始解读')
    locate('交办与权限边界', timeout=100)
    messages = read_trace()[before:]
    assert messages and all(item['status'] == 200 for item in messages), messages
    info = messages[-1]
    request = info['request']
    assert info['contentType'].startswith('application/json')
    assert request['response_format']['json_schema']['name'] == 'workplace_contextual_analysis'
    assert request['model'] == 'qwen3-4b-instruct'
    submitted = json.loads(request['messages'][1]['content'])
    assert submitted['self']['role'] == role, submitted.get('self')
    if role == '项目负责人':
        assert any('first draft of client response' in case['observed'] for case in submitted['profile']['cases']), submitted['profile']
    selected = [item['text'] for item in submitted['dialogue']]
    assert len(selected) == 1 and '想法' in selected[0], selected
    assert selected[0].endswith('.'), selected
    assert not any('维护' in line or '維護' in line or '續約' in line or '续约' in line for line in selected)
    locate('你提供的职责与权限', scroll='down', timeout=20)
    locate('下一步', scroll='down', timeout=16)
    next_step = label(locate(lambda s: s.startswith(('先整理', '在已授权范围内')), scroll='down', timeout=20))
    hint = '由您拍板' if role == '执行协调' else '超预算'
    reply_node = locate(lambda s: s.startswith('收到') and hint in s, scroll='down', timeout=20)
    reply = label(reply_node)
    tap_visible('复制回复')
    locate('回复已复制', timeout=7)
    tap_visible('保存到复盘')
    locate('已保存到本机复盘', timeout=8)
    save_stage(role, {'submitted_dialogue': selected, 'next': next_step, 'reply': reply, 'schema': request['response_format']['json_schema']['name']})
    print('Actual APK selected-text analysis and usable reply for ' + role + ': ' + reply, flush=True)


def record_local():
    before = recordings_manifest()
    before_requests = len(read_trace())
    adb('shell', 'pm', 'grant', PACKAGE, 'android.permission.RECORD_AUDIO')
    tap('工作台')
    if any(label(n) == '录音与音频' for n in tree()):
        tap('录音与音频', scroll='up')
    tap('开始录音', scroll='down')
    locate('停止录音')
    sleep(2)
    tap('停止录音')
    locate(lambda s: s.startswith('录音 ') and s.endswith('.m4a'), scroll='down')
    current = recordings_manifest()
    assert len(current) == len(before) + 1 and set(before).issubset(current)
    assert len(read_trace()) == before_requests
    save_stage('local_recording', {'original_local_audio_unchanged': True, 'new_local_recordings': 1})
    print('Native recording appended a local M4A without any model request.', flush=True)


def confirm_review():
    tap('复盘')
    tap('解读记录')
    tap(lambda s: s.startswith('你很有想法') and '待跟进' in s)
    swipe('down', 530)
    contact = locate('交付物', scroll='down', timeout=20)
    touch(contact)
    adb('shell', 'input', 'keycombination', '113', '29')
    text('Renewal pilot schedule and first draft of client response')
    back()
    before = len(read_trace())
    tap_visible('保存复盘')
    locate('档案更新建议', scroll='up', timeout=22)
    deadline = monotonic() + 82
    while len(read_trace()) <= before:
        assert monotonic() < deadline, 'The confirmed review did not run the model'
        sleep(1)
    check = read_trace()[-1]
    assert check['status'] == 200, check
    submitted = json.loads(check['request']['messages'][1]['content'])
    assert 'priorCases' not in submitted and 'Renewal pilot' in submitted['confirmedOutcome'], submitted
    suggestion = json.loads(check['response']['choices'][0]['message']['content'])
    assert suggestion.get('habit') and suggestion.get('evidence'), suggestion
    locate(lambda s: s.startswith('你很有想法') and ('交給' in s or '交给' in s), scroll='down', timeout=20)
    habit = label(locate(lambda s: len(s) > 22 and any(word in s for word in ('这次', '类似', '原话')) and '要求' in s, scroll='down', timeout=25))
    assert '过一遍' not in habit and '可展示稿' not in habit, habit
    tap_visible('加入上级档案')
    locate('已收录到这位上级的档案。', scroll='up', timeout=18)
    save_stage('confirmed_review', {'visible_habit': habit, 'model': suggestion})
    print('Real Qwen ran the review request. The displayed evidence-backed suggestion was accepted into the manager profile.', flush=True)


def verify_persistence():
    saved = json.loads(notes.read_text(encoding='utf-8'))
    expected = int(saved['upgrade']['previous_review_count'].split(' ')[0])
    expected += sum(role in saved for role in ('执行协调', '项目负责人'))
    launch(restart=True)
    locate('沟通工作台', timeout=25)
    tap('复盘')
    tap('解读记录')
    locate(str(expected) + ' 条记录', timeout=15)
    tap('本机录音')
    locate(lambda s: s.startswith('录音 · '))
    assert len(recordings_manifest()) == saved['upgrade']['preserved_recordings'] + 1
    save_stage('restart', {'review_count': expected, 'recording_count': len(recordings_manifest())})
    print('Relaunch confirmed local reviews and recordings persisted.', flush=True)


assert is_qa_device()
{
    'upgrade': upgrade, 'configure': configure, 'personal': configure_role, 'audio': import_audio,
    'select': select_audio, 'interpret': interpret, 'record': record_local, 'review': confirm_review,
    'persist': verify_persistence
}[sys.argv[1]](*sys.argv[2:])
