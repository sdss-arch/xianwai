from qa_device import *
import json

assert is_qa_device()
def select(field, choice, direction=None):
    name = lambda value: value == field
    for _ in range(5):
        options = [n for n in tree() if matches(n, name) and n.get('clickable') == 'true' and bounds(n)[3] > bounds(n)[1]]
        if options:
            touch(options[-1])
            return tap(choice)
        if direction:
            swipe(direction, 360)
        else:
            sleep(0.4)
    raise AssertionError(f'Cannot find Android select {field}')

def traces():
    return [json.loads(s) for s in (ROOT / 'tests/browser/mock-model-trace.jsonl').read_text(encoding='utf-8').splitlines() if s]

for _ in range(4):
    swipe('up', 950)
select('沟通对象', lambda v: v.startswith('林主管'))
before = len(traces())
tap('开始解读', scroll='down', timeout=32)
locate('本次解读', timeout=70, scroll='down')
locate('原话依据', scroll='down')
screenshot('04-解读与原话依据')
result = [r for r in traces()[before:] if len(r['messages']) == 2][-1]
sent = json.loads(result['messages'][1]['content'])
assert len(sent['dialogue']) == 1 and '方案' in sent['dialogue'][0]['text'], sent['dialogue']
assert sent['profile']['name'] == '林主管', sent.get('profile')
tap('复制回复', scroll='down')
locate('回复已复制', timeout=6)
tap('保存到复盘', scroll='down')
tap('复盘')
tap('解读记录')
locate('1 条记录')
screenshot('06-沟通复盘')
tap('需要在评审前检查方案。', scroll='down')
print('Signed APK sent just one selected transcript sentence through its native HTTPS bridge, copied reply and saved review.', flush=True)
dump()
