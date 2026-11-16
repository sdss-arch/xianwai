from qa_device import *
import json

assert is_qa_device()
tap('上级档案')
locate('新建档案')
screenshot('05-上级档案')
tap('新建档案')
locate('新建上级档案')
screenshot('05A-新建档案')
tap('关闭')
tap('迁移档案', scroll='down')
adb('push', str(ROOT / 'tests/fixtures/qa-profile.json'), '/sdcard/Download/qa-profile.json')
tap('导入档案', scroll='down')
choose_file('qa-profile.json')
locate('已导入 1 份档案', timeout=7)
locate('陈经理', scroll='down')
tap('迁移档案', scroll='up')
if not any(label(n) == '导出档案' and bounds(n)[3] > bounds(n)[1] for n in tree()):
    tap('迁移档案', scroll='up')
tap('导出档案', scroll='down')
tap(lambda s: s.casefold() in {'save', '保存'}, timeout=18)
locate('档案已导出', timeout=8)
print('Desktop exported profile imported through Android file picker; Android then exported profile backup through native Save UI.', flush=True)
