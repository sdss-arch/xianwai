import assert from 'node:assert/strict';
import { prepareWorkplaceAnalysis } from '../../public/workplace-analysis.mjs';
import { cases } from './subtext-cases.mjs';

const scenario = id => cases.find(item => item.id === id).input;
function output(id, reading, patch) {
  return prepareWorkplaceAnalysis({ ...scenario(id), ...patch }).normalize({
    reading, state: 'pending', surface: '示例', dialogueRefs: [1], contextRefs: [1],
    signal: '当前有事实支持。', next: '再次确认谁有权限。', reply: '请问谁有权限？'
  });
}

const added = output('06', 'promise');
assert.match(added.assessment.next, /新增工作和手头事项的先后/u);
assert.match(added.reply, /手头事项之前/u);
assert.match(added.reply, /下一轮.*什么时候/u);
assert(added.assessment.contextEvidence.some(line => line.includes('多接一块工作')));
const onlyPromise = output('13', 'promise');
assert.doesNotMatch(onlyPromise.reply + onlyPromise.assessment.next, /新增工作|优先级|手头事项/u);
const agreed = output('14', 'promise');
assert.match(agreed.reply, /先完成数据核对，再做盘点/u);
assert.doesNotMatch(agreed.reply, /您希望排在/u);

const known = output('09', 'delegation');
assert.match(known.reply, /预算和对外承诺由您决定/u);
assert.match(known.reply, /先处理哪项/u);
assert.doesNotMatch(known.reply + known.assessment.next, /谁|undefined/u);
const coordinator = output('10', 'delegation');
assert.match(coordinator.reply, /协调排期|由您拍板/u);
assert.equal(coordinator.assessment.usesPersonalAuthority, true);
assert.doesNotMatch(coordinator.reply, /谁|我来决定|我负责拍板/u);
const owner = output('11', 'delegation');
assert.match(owner.reply, /我先定排期和对外口径/u);
assert.match(owner.reply, /超预算.*找您确认/u);
assert.doesNotMatch(owner.reply, /谁/u);
const missing = output('12', 'delegation');
assert.match(missing.reply, /报价草稿.*价格由谁定/u);
const currentWins = output('11', 'delegation', { context: '这次预算和对外承诺仍由上级决定。' });
assert.match(currentWins.reply, /预算和对外承诺由您决定/u);
assert.equal(currentWins.assessment.usesPersonalAuthority, false);
const partlyAuthorized = output('11', 'delegation', {
  self: { role: '项目经理', authority: '我可以确定排期，但不能确认对外承诺。' }
});
assert.match(partlyAuthorized.reply, /定排期/u);
assert.doesNotMatch(partlyAuthorized.reply, /定排期和对外口径/u);
console.log('Action rules passed for workload, agreed order, role, existing/unknown approval and data precedence.');
