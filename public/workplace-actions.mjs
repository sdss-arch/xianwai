const addedWork = /(?:让|请|要)[^。；，]{0,10}(?:多接|再接|接一项|接下|加做|多承担)|(?:临时|额外)(?:增加|加派)|(?:新增|加派)(?:了|给你)?(?:一项|一块)?(?:任务|工作)/u;
const settledOrder = /(?:排在[^，。]{1,22}(?:之前|之后)|(?:优先级|先后顺序)(?:已经|已)(?:定|明确)|先[^，。]{1,14}[，,再]+再[^，。]{1,14})/u;
const existingWork = /(?:手头|手上|已有|现有|原有)[^。；]{0,20}(?:任务|工作|交付|截止)/u;
const delegatedApproval = /((?:预算|报价|对外承诺|对外口径)(?:(?:和|、|及|与)(?:预算|报价|对外承诺|对外口径))*)\s*(?:仍|均|要|须|需)?由(上级|主管|您|他|领导|法务|财务|项目负责人)(?:本人)?(决定|批准|审批|拍板|确认)/u;
const ownScope = /(?:我|本人)(?:可以|可自行|有权)([^。；，但]{1,76})/u;
const unknownPrice = /(?:没说谁能定价|未定谁能定价|没定谁能定价|没(?:说|定)谁(?:来|能)?确认(?:最终)?报价|谁(?:来|能)?确认(?:最终)?报价[^。；]{0,12}(?:未定|没定|不清楚))/u;
const budgetLimit = /超(?:出)?(?:已批)?预算[^。；]{0,15}(?:拍板|审批|批准|确认)/u;

function establishedOrder(line) {
  return settledOrder.test(line) && !/(?:未|没|不清楚|是否|要不要)[^，。]{0,12}(?:排在|顺序|优先级)/u.test(line);
}

function promiseAction(facts, tone) {
  const added = facts.find(line => addedWork.test(line));
  const order = added && facts.find(establishedOrder);
  const timing = tone === 'warm' ? '想跟您对齐一下' : '想确认一下';
  const check = '下一轮评估看哪些条件，我们什么时候再对一下？';
  if (order) {
    const sequence = order.match(/把([^，。；]{1,14})排在([^，。；]{1,14})之后/u);
    const action = sequence ? '先完成' + sequence[2] + '，再做' + sequence[1] : '按已定的先后顺序处理';
    return {
      next: action + '。另确认下一轮评估标准和复核时间。',
      reply: '收到，我会' + action + '。' + timing + '，' + check,
      contextEvidence: [added, order]
    };
  }
  if (added) {
    return {
      next: '先请上级确认新增工作和手头事项的先后，明确有没有需要调后的交付。另确认下一轮评估标准和复核时间。',
      reply: '收到，这项新工作您希望排在手头事项之前，还是按原计划做完再接？另外，' + check,
      contextEvidence: [added]
    };
  }
  return { next: '确认下一轮评估标准和复核时间。', reply: timing + '，' + check };
}

function delegationAction(facts, self) {
  const authority = self?.authority || '';
  const currentApproval = facts.find(line => delegatedApproval.test(line));
  const approval = (currentApproval || authority).match(delegatedApproval);
  const scheduling = facts.find(line => /排期|上线时间/u.test(line));
  const workload = facts.find(line => existingWork.test(line));
  const priceGap = facts.find(line => unknownPrice.test(line));

  const empowered = !currentApproval && authority.match(ownScope)?.[1];
  if (empowered && /定.{0,2}排期|安排试点|确认对外承诺|确定对外口径/u.test(empowered)) {
    const bounded = budgetLimit.test(authority);
    const authorizedSchedule = /定.{0,2}排期/u.test(empowered);
    const authorizedCustomer = /确认对外承诺|确定对外口径/u.test(empowered);
    const action = authorizedSchedule && authorizedCustomer ? '定排期和对外口径'
      : authorizedSchedule ? '定排期' : authorizedCustomer ? '定对外口径' : '安排试点';
    return {
      state: bounded ? 'conditional' : undefined,
      next: '在已授权范围内' + action + '。' + (bounded ? '如需超预算，再提交审批。' : ''),
      reply: '好，我先' + action + '。' + (bounded ? '如果需要超预算，我再找您确认。' : ''),
      usesPersonalAuthority: true
    };
  }
  if (approval) {
    const [, topics, assessor, verb] = approval;
    const actor = /^(?:上级|主管|您|他|领导)$/u.test(assessor) ? '您' : assessor;
    const prepare = scheduling ? '协调排期并整理待确认的对外内容' : '整理方案和待拍板的事项';
    const boundary = topics + '由' + actor + verb;
    const follow = workload ? '新项目和手头的交付，您希望我先处理哪项？' : '';
    return {
      state: 'conditional',
      next: '先' + prepare + '。' + topics + '按已明确的审批边界处理。' +
        (workload ? '请上级明确新项目与现有交付的优先级。' : ''),
      reply: '好，我先' + prepare + '。' + boundary + '。' + follow,
      contextEvidence: [currentApproval, workload].filter(Boolean),
      usesPersonalAuthority: !currentApproval
    };
  }
  if (priceGap) {
    return {
      next: '先准备报价草稿。对客户确认最终报价前，问清由谁定价。',
      reply: '收到，我先把报价草稿整理好。最终对客户确认报价前，这个价格由谁定？',
      contextEvidence: [priceGap]
    };
  }
}

export function groundedAction(reading, state, input) {
  if (state === 'paused') return undefined;
  const facts = [...input.dialogue, ...input.context].map(line => line.text);
  if (reading === 'promise') return promiseAction(facts, input.tone);
  if (reading === 'delegation') return delegationAction(facts, input.self);
}
