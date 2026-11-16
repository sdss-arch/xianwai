from qa_device import *
import json
import sys

assert is_qa_device()
def edit_after(field, value):
    for _ in range(8):
        nodes = tree()
        for index, node in enumerate(nodes):
            if label(node) != field:
                continue
            candidate = next((n for n in nodes[index+1:] if n.get('class') == 'android.widget.EditText'), None)
            if candidate is not None and 48 < bounds(candidate)[1] < 1275 and bounds(candidate)[3] > bounds(candidate)[1]:
                touch(candidate)
                text(value)
                back()
                return
        swipe('down', 420)
    raise AssertionError(f'Cannot find input following {field!r}')

if '--accepted' not in sys.argv:
    if not any(label(n) == '记录标题' for n in tree()):
        tap(lambda s: s.startswith('需要在评审前检查方案。 林主管'), scroll='up')
    else:
        for _ in range(3):
            swipe('up', 830)
    locate('记录标题', timeout=10, scroll='down')
    edit_after('交付物', 'Presentation draft')
    tap('保存复盘', scroll='down', timeout=25)
    locate('档案更新建议', scroll='down')
    locate('后来确认的要求', scroll='down')
    screenshot('06A-档案更新建议')
    tap('加入上级档案', scroll='down')
locate('已收录到这位上级的档案。', scroll='down')
tap('上级档案')
tap('已收录案例 · 1', scroll='down')
locate('确认后的要求', scroll='down')

restart = launch(restart=True)
locate('沟通工作台')
locate('fixture-compatible-model')
tap('复盘')
locate('1 条记录')
locate(lambda s: s.startswith('需要在评审前检查方案。 林主管'), scroll='down')
tap('本机录音')
locate(lambda s: s.startswith('录音 ·'))
print('Signed APK generated a review suggestion with current evidence, kept it pending for approval, added a case, and retained API, review and recording data after restart.', flush=True)
