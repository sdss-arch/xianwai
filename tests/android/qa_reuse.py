from qa_device import *
import json

assert is_qa_device()
tap('工作台')
locate(lambda s: s.startswith('继续草稿'), scroll='up')
trace = ROOT / 'tests/browser/mock-model-trace.jsonl'
offset = len(trace.read_bytes())
tap('开始解读', scroll='down', timeout=32)
locate(lambda s: s.startswith('参考的历史案例 · 1'), scroll='down', timeout=35)
rows = [json.loads(s) for s in trace.read_bytes()[offset:].splitlines() if s]
request = json.loads(rows[-1]['messages'][1]['content'])
case = request['profile']['cases'][0]
assert '方案' in case['quote'][0] and 'Presentation draft' in case['observed']
locate('复制回复', scroll='down')
screenshot('04A-回复草稿')
print('After restart, the signed app reused the approved same-person case for a new model call.', flush=True)
