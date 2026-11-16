import { setupAudio } from './audio.js';
import { setupWorkspace, readLocal } from './workspace.js';
import { setupBrowserAPI } from './browser-api.js';
import { browserRecordings } from './local-device.js';
import { cleanCase, matchingCases } from './casebook.mjs';

const icons = {
  brand: '<path d="M4 8h16M4 16h16m-11-8a3 3 0 0 0 6 0m-6 8a3 3 0 0 1 6 0"/>',
  analyze: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.7-4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 10h8m-8 4h5"/>',
  profiles: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m3 10v-2a6 6 0 0 0-2-4.5"/>',
  person: '<circle cx="12" cy="8" r="3.3"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  example: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8m-8 4h5"/>',
  spark: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  quote: '<path d="M10 11H4v6h6v-6ZM20 11h-6v6h6v-6ZM4 11c0-4 2-6 6-7m4 7c0-4 2-6 6-7"/>',
  reply: '<path d="m10 7-6 5 6 5v-4c5 0 8 1 10 5 0-6-3-9-10-9Z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6"/>',
  upload: '<path d="M12 15V3m-4 5 4-5 4 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  desk: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11"/>',
  journal: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8m-8 4h8m-8 4h4"/>',
  settings: '<path d="M4 7h16M4 17h16M9 4v6m6 4v6"/>',
  edit: '<path d="M12 20h8M15 5l4 4M4 16l11-11a2.8 2.8 0 0 1 4 4L8 20H4v-4Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};

function icon(target, key) {
  target.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + icons[key] + '</svg>';
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function iconText(target, key, content) {
  const symbol = element('span');
  icon(symbol, key);
  target.append(symbol, document.createTextNode(content));
}

document.querySelectorAll('[data-icon]').forEach(node => icon(node, node.dataset.icon));
const $ = id => document.getElementById(id);
const select = $('profile-select');
const dialogue = $('dialogue');
const context = $('context');
const result = $('result');
const dialog = $('profile-dialog');
const profileForm = $('profile-form');
const observations = $('profile-observations');
const readHabits = $('read-habits');
const submit = $('analysis-form').querySelector('[type="submit"]');
const storageKey = 'xianwai.profiles.v1';
const draftKey = 'xianwai.draft.v1';
const personalKey = 'xianwai.personal.v1';
const web = !globalThis.XianwaiPhone && !globalThis.XianwaiAndroid;
const traits = ['表达直接', '表达委婉', '重视时效', '重视细节', '重视对齐', '喜欢先看结果', '习惯给自主权', '偏好书面确认'];
const exampleProfile = {
  id: 'example-lin',
  name: '林主管',
  position: '直属上级 · 产品负责人',
  traits: ['表达委婉', '喜欢先看结果'],
  priority: '对外评审前喜欢先看到可演示的版本。',
  observations: '上次客户评审前他说「你先过一遍」，随后明确希望我把明显问题直接修到可用。',
  sample: true
};
const exampleDialogue = '林主管：这个方案你先过一遍，明早开会要用。';
const exampleContext = '明早是客户评审，会直接用这份方案。文档还在调整。';
const preview = {
  stated: { text: '明早客户评审前先过一遍方案。', evidence: [] },
  interpretations: [{
    title: '可能需要一版能直接用的稿子',
    explanation: '如果明早要直接展示，「过一遍」可能包括修掉明显问题。交付范围还值得确认。',
    evidence: ['这个方案你先过一遍，明早开会要用。']
  }],
  reply: '收到，我今天先过一遍。明早开会前，我是把风险点标给您，还是直接改出一版可用稿？'
};

let profiles = loadProfiles();
let editId;
let pending;
let pendingHabits;
let toastTimer;
let source = 'text';
let modelLocation;
let draft = readLocal(draftKey, null);
let usingExample = false;
let excludedCase;
const mobile = (globalThis.XianwaiPhone || globalThis.XianwaiAndroid)
  ? (await import('./android.js')).setupPhone(invalidate) : null;
const personalAvailable = !mobile || Boolean(globalThis.XianwaiAndroid);
const personalFields = ['position', 'role', 'authority', 'preference'];
let personal = personalAvailable ? readLocal(personalKey, {}) : {};
const usePersonal = $('use-personal');
if (web) {
  document.body.classList.add('browser-workspace');
  $('title').textContent = '记一段对话';
  $('source-text').parentElement.append($('model-indicator'));
  $('context-field').after($('who-field'));
  $('recent-list').before($('open-followups'));
  $('draft-status').after($('resume-draft'));
  $('load-example').textContent = '试一段示例';
  $('dialogue').placeholder = '贴上聊天记录，或记下对方说的话。';
  $('context-guide').textContent = '补上对方说完之后做了什么，比如排了时间、给了资源，或撤回了原计划。';
}
const browserAPI = mobile ? null : setupBrowserAPI(mode => {
  const alreadyLoaded = modelLocation !== undefined;
  modelLocation = mode;
  updateAnalysisNotice();
  if (alreadyLoaded) invalidate();
});
const library = mobile ? {
  listRecordings: mobile.listRecordings,
  deleteRecording: mobile.deleteRecording,
  export: mobile.audio.export
} : browserRecordings;
const workspace = setupWorkspace({
  library,
  notify: showToast,
  getProfiles: () => profiles,
  onOptionsChange: editDraft,
  review(entry) {
    usingExample = false;
    setSource('text', false);
    dialogue.value = entry.dialogue;
    context.value = entry.context;
    syncSelect(entry.profileId);
    workspace.setOptions(entry);
    excludedCase = entry.id;
    location.hash = 'analyze';
    editDraft();
  },
  adopt(entry, suggestion) {
    const profile = profiles.find(item => item.id === entry.profileId);
    if (!profile) return showToast('这个上级档案已经移除');
    const item = cleanCase({
      id: entry.id, ...suggestion, scenario: entry.scenario, context: entry.context, date: entry.date
    });
    if (!item) return showToast('这条建议缺少原话依据或实际要求');
    const next = [item, ...(profile.cases || []).filter(value => value.id !== item.id)];
    try {
      storeProfiles(profiles.map(value => value.id === profile.id ? { ...value, cases: next, sample: false } : value));
      syncSelect();
      renderProfiles();
      if (select.value === profile.id) invalidate();
      showToast('已加入' + profile.name + '的档案');
      return true;
    } catch {
      showToast('没有足够空间保存档案');
    }
  },
  suggest(entry, observed, signal) {
    const { dialogue, context, scenario } = entry;
    return post('/api/profile-suggestion', { dialogue, context, scenario, observed }, signal);
  },
  async openRecording(file) {
    setSource('audio');
    location.hash = 'audio';
    if (await audio.loadRecording(file)) audio.runTranscription();
  }
});
const audio = setupAudio(() => {
  if (source === 'audio') {
    invalidate();
    if (!usingExample) saveDraft();
  }
}, mobile?.audio, browserRecordings);

function renderDraft() {
  const hasDraft = Boolean(draft?.dialogue || draft?.audioText || draft?.context);
  $('draft-title').textContent = hasDraft ? '继续草稿' : '当前草稿';
  $('draft-description').textContent = hasDraft ? (draft.source === 'audio' && draft.audioText ? '已保留所选转写文字' : '继续上次记录') : '暂无草稿';
  $('draft-status').textContent = usingExample ? '示例' : hasDraft ? '草稿已保存在本机' : '';
  if (web) {
    $('resume-draft').hidden = !usingExample || !hasDraft;
    $('draft-title').textContent = '恢复原草稿';
  }
}

function saveDraft() {
  const next = {
    dialogue: dialogue.value, audioText: audio.selectedText(), context: context.value,
    profileId: select.value, source, ...workspace.getOptions()
  };
  try {
    if (next.dialogue.trim() || next.audioText || next.context.trim()) {
      localStorage.setItem(draftKey, JSON.stringify(next));
      draft = next;
    } else {
      localStorage.removeItem(draftKey);
      draft = null;
    }
    renderDraft();
  } catch {
    $('draft-status').textContent = '草稿暂时无法保存';
  }
}

function editDraft() {
  usingExample = false;
  saveDraft();
  invalidate();
}

function loadProfiles() {
  const saved = readLocal(storageKey, null);
  if (Array.isArray(saved)) return saved;
  if (!web) return [exampleProfile];
  // Earlier browser builds supplied this profile on demand, even if the user never saved the list.
  const oldDraft = readLocal(draftKey, {});
  const oldReviews = readLocal('xianwai.review.v1', []);
  const referenced = oldDraft.profileId === exampleProfile.id ||
    (Array.isArray(oldReviews) && oldReviews.some(item => item?.profileId === exampleProfile.id));
  return referenced ? [exampleProfile] : [];
}

function storeProfiles(next) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  profiles = next;
  workspace.renderOverview();
}

async function exportProfiles() {
  const data = { version: 1, profiles: profiles.filter(profile => !profile.sample) };
  if (!data.profiles.length) {
    showToast('还没有可导出的自建档案');
    return;
  }
  const text = JSON.stringify(data, null, 2);
  if (mobile) {
    try { if (await mobile.exportText(text)) showToast('档案已导出'); }
    catch (error) { showToast(error.message); }
    return;
  }
  downloadJson(text, '弦外-上级档案.json');
}

function downloadJson(text, filename) {
  const link = element('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function importedProfile(value) {
  if (typeof value?.id !== 'string' || !/^[a-z\d-]{1,64}$/u.test(value.id)
    || typeof value?.name !== 'string' || !value.name.trim()) throw new Error('Invalid profile.');
  const field = (key, size) => typeof value[key] === 'string' ? value[key].trim().slice(0, size) : '';
  return {
    id: value.id,
    name: field('name', 24),
    position: field('position', 40),
    traits: Array.isArray(value.traits) ? traits.filter(trait => value.traits.includes(trait)) : [],
    priority: field('priority', 200),
    observations: field('observations', 1200),
    cases: Array.isArray(value.cases) ? value.cases.map(cleanCase).filter(Boolean) : []
  };
}

async function importProfiles(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 500_000) throw new Error('File too large.');
    const data = JSON.parse(await file.text());
    if (data?.version !== 1 || !Array.isArray(data.profiles)) throw new Error('Invalid backup.');
    const next = new Map(profiles.map(profile => [profile.id, profile]));
    for (const profile of data.profiles.map(importedProfile)) {
      if (!next.has(profile.id)) next.set(profile.id, profile);
    }
    const added = next.size - profiles.length;
    if (added) {
      storeProfiles([...next.values()]);
      syncSelect();
      renderProfiles();
    }
    showToast(added ? '已导入 ' + added + ' 份档案' : '没有需要导入的新档案');
  } catch {
    showToast('无法导入，请选择弦外导出的档案文件');
  }
}

function activeProfile() {
  return profiles.find(profile => profile.id === select.value);
}

function syncSelect(id = select.value) {
  select.replaceChildren(new Option('不指定上级', ''));
  for (const profile of profiles) {
    select.append(new Option(profile.name + (profile.sample ? '（示例）' : ''), profile.id));
  }
  select.value = profiles.some(profile => profile.id === id) ? id : '';
  const profile = activeProfile();
  $('profile-note').textContent = profile
    ? '本次参考' + profile.name + '的沟通习惯和过往例子。'
    : web ? '' : '可在「上级档案」添加这位上级的沟通习惯。';
}

function showToast(message) {
  clearTimeout(toastTimer);
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function showError(id, message = '') {
  const node = $(id);
  node.textContent = message;
  node.hidden = !message;
}

async function copyReply(text, reference) {
  if (mobile) {
    try {
      await mobile.copy(text);
      showToast('回复已复制');
      return;
    } catch {}
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('回复已复制');
      return;
    } catch {
      // Browsers can refuse clipboard access. Try selecting the visible reply.
    }
  }
  const selection = window.getSelection();
  if (reference instanceof HTMLTextAreaElement) {
    reference.focus();
    reference.select();
  } else {
    const range = document.createRange();
    range.selectNodeContents(reference);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  if (!document.execCommand('copy')) {
    showToast('已选中回复，可长按复制');
    return;
  }
  selection.removeAllRanges();
  showToast('回复已复制');
}

function card(title, key) {
  const box = element('article', 'result-card');
  const heading = element('h3');
  if (web) heading.textContent = title;
  else iconText(heading, key, title);
  box.append(heading);
  return box;
}

function addEvidence(parent, quotes) {
  if (quotes.length) parent.append(element('span', 'evidence-label', '原话依据'));
  for (const quote of quotes) parent.append(element('blockquote', 'source', quote));
}

function renderAssessment(data, selfAuthority) {
  const view = element('article', 'assessment-card');
  const heading = element('header', 'label-row');
  heading.append(element('h3', '', data.label), element('span', 'assessment-status', data.status));
  view.append(heading);
  const add = (title, text) => {
    if (!text) return;
    const section = element('div', 'assessment-section');
    section.append(element('h4', '', title), element('p', '', text));
    view.append(section);
  };
  add(web ? '为什么这么判断' : '哪条线索改变了判断', data.signal);
  if (data.contextEvidence?.length) {
    view.append(element('span', 'evidence-label', '你提供的现场背景'));
    for (const text of data.contextEvidence) view.append(element('blockquote', 'source', text));
  }
  if (data.usesPersonalAuthority && selfAuthority) {
    view.append(element('span', 'evidence-label', '你提供的职责与权限'), element('blockquote', 'source', selfAuthority));
  }
  if (!web) add('下一步', data.next);
  add('另一种情况', data.alternative);
  if (data.clarify) {
    const form = element('form', 'context-followup');
    const label = element('label', '', data.clarify);
    label.htmlFor = 'clarification';
    const answer = element('textarea');
    answer.id = 'clarification';
    answer.rows = 2;
    answer.required = true;
    answer.placeholder = '补一句当时发生的事';
    const remaining = Math.max(0, context.maxLength - context.value.trim().length - 1);
    answer.maxLength = remaining;
    const button = element('button', 'button secondary', '补充后重新解读');
    button.type = 'submit';
    const message = element('p', 'field-note', remaining ? '' : '背景已写满，可以先在工作台精简背景。');
    message.setAttribute('role', 'status');
    button.disabled = answer.disabled = !remaining;
    form.append(label, answer, message, button);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = answer.value.trim();
      if (!value) return answer.focus();
      context.value = [context.value.trim(), value].filter(Boolean).join('\n');
      editDraft();
      $('analysis-form').requestSubmit();
    });
    view.append(form);
  }
  return view;
}

function renderResult(data = preview, meta = {}) {
  const empty = meta.empty || (web && data === preview && !usingExample);
  const heading = element('h2');
  heading.id = 'result-heading';
  heading.tabIndex = -1;
  heading.textContent = '解读结果';
  const title = element('div');
  title.append(element('span', 'section-label', '研判'), heading);
  const header = element('div', 'result-top');
  const status = meta.loading ? '正在解读' : empty || (web && meta.live) ? '' : meta.live ? '本次解读' : '示例预览';
  header.append(title);
  if (status) header.append(element('span', 'status-pill', status));
  result.replaceChildren(header);
  result.classList.toggle('is-empty', Boolean(empty && !meta.loading));

  if (meta.loading) {
    result.append(element('p', 'loading-panel', web ? '正在看这段对话…' : '正在核对原话和背景，整理需要确认的事项。'));
    return;
  }
  if (empty) {
    result.append(element('p', 'loading-panel', web ? '解读后，这里会写明下一步和怎么回。' : '开始解读后，在这里查看原话依据、待确认事项和回复草稿。'));
    return;
  }
  const readingSources = web ? element('div', 'reading-sources') : result;
  if (meta.live) {
    const sources = [];
    if (meta.profileName) sources.push(web ? '参考了' + meta.profileName + '的档案' : '参考档案 · ' + meta.profileName);
    else if (!web) sources.push('本次对话与背景');
    if (meta.selfUsed) sources.push('已参考个人信息');
    if (sources.length) readingSources.append(element('p', 'result-meta', sources.join(' · ')));
    if (meta.cases?.length) {
      const references = element('details', 'case-references');
      references.append(element('summary', '', '参考的历史案例 · ' + meta.cases.length));
      for (const item of meta.cases) {
        const caseView = element('article', 'case-reference');
        caseView.append(element('p', '', item.habit));
        for (const line of item.evidence) caseView.append(element('blockquote', 'source', line));
        references.append(caseView);
      }
      readingSources.append(references);
    }
  } else {
    result.append(element('p', 'preview-source', '「这个方案你先过一遍，明早开会要用。」'));
  }

  if (data.assessment) {
    if (web) {
      const next = card('现在怎么做', 'check');
      next.classList.add('next-action');
      next.append(element('p', '', data.assessment.next));
      result.append(next);
    }
    const assessment = renderAssessment(data.assessment, meta.selfAuthority);
    if (data.profileEffect) assessment.append(element('p', 'profile-insight', '档案线索：' + data.profileEffect));
    result.append(assessment);
  }
  if (data.stated) {
    const stated = card(data.assessment ? web ? '对方说了什么' : '表面表达' : '明确要求', 'check');
    stated.append(element('p', '', data.stated.text));
    addEvidence(stated, data.stated.evidence);
    result.append(stated);
  }
  if (!data.assessment) {
    const intentions = card('可能的潜台词', 'quote');
    if (!data.interpretations.length) intentions.append(element('p', '', '暂时没有足够依据推断额外要求。'));
    for (const item of data.interpretations) {
      const section = element('div', 'interpretation');
      section.append(element('strong', '', item.title), element('p', '', item.explanation));
      addEvidence(section, item.evidence);
      intentions.append(section);
    }
    if (data.profileEffect) intentions.append(element('p', 'profile-insight', '档案线索：' + data.profileEffect));
    result.append(intentions);
  }

  if (data.question) {
    const question = card('最值得确认', 'analyze');
    question.append(element('p', '', data.question));
    result.append(question);
  }
  const reply = card('回复草稿', 'reply');
  reply.classList.add('reply-card');
  const replyHeading = element('div', 'reply-heading');
  replyHeading.append(reply.firstElementChild);
  const copy = element('button', 'text-button');
  copy.type = 'button';
  iconText(copy, 'copy', '复制回复');
  const editor = meta.live ? element('textarea', 'reply-text reply-editor') : element('p', 'reply-text', data.reply);
  const replyValue = () => meta.live ? editor.value.trim() : data.reply;
  copy.addEventListener('click', () => copyReply(replyValue(), editor));
  replyHeading.append(copy);
  reply.append(replyHeading, editor);
  let save;
  let savedReply;
  if (meta.live) {
    editor.value = data.reply;
    editor.rows = 3;
    editor.maxLength = 500;
    editor.setAttribute('aria-label', '回复草稿');
    const reset = element('button', 'text-button reply-reset', '恢复原回复');
    reset.type = 'button';
    reset.hidden = true;
    function updateReply() {
      const value = replyValue();
      reset.hidden = value === data.reply;
      copy.disabled = !value;
      if (save) {
        save.disabled = !value || value === savedReply;
        save.textContent = !savedReply ? '保存到复盘' : value === savedReply ? '已保存到复盘' : '更新复盘';
      }
    }
    editor.addEventListener('input', updateReply);
    reset.addEventListener('click', () => { editor.value = data.reply; updateReply(); });
    reply.append(reset);
  }
  result.append(reply);
  if (meta.saveReview) {
    save = element('button', 'button secondary save-review-action', '保存到复盘');
    save.type = 'button';
    save.addEventListener('click', () => {
      if (replyValue() && meta.saveReview(replyValue())) {
        savedReply = replyValue();
        save.disabled = true;
        save.textContent = '已保存到复盘';
        showToast('已保存到本机复盘');
      }
    });
    if (web) reply.append(save);
    else result.append(save);
  }
  if (web && data.assessment) result.querySelector('.next-action').after(reply);
  if (web && readingSources.childElementCount) result.append(readingSources);
}

function setBusy(busy) {
  submit.disabled = busy;
  $('analyze-label').textContent = busy ? '正在解读…' : '开始解读';
  result.setAttribute('aria-busy', String(busy));
}

function invalidate() {
  pending?.abort();
  pending = undefined;
  setBusy(false);
  showError('analysis-error');
  $('character-count').textContent = dialogue.value.length + ' / 2500';
  const activeText = source === 'audio' ? audio.selectedText() : dialogue.value;
  renderResult(undefined, { empty: !usingExample && Boolean(activeText.trim() || context.value.trim()) });
}

function updateAnalysisNotice() {
  const note = document.querySelector('.fine-print');
  const inputs = source === 'audio' ? '所选转写文字、背景与所选档案' : '对话文字、背景与所选档案';
  const destination = mobile || modelLocation === 'custom' ? '你配置的模型服务' : modelLocation === 'remote' ? '云端模型' : '分析服务';
  note.textContent = '提交' + inputs + (personalAvailable && usePersonal.checked ? '、个人信息' : '') + '给' + destination + '。';
}

function setSource(next, persist = true) {
  if (source === next) return;
  if (source === 'audio') {
    audio.finishRecording();
    audio.pause();
  }
  source = next;
  const isAudio = source === 'audio';
  $('source-text').setAttribute('aria-pressed', String(!isAudio));
  $('source-audio').setAttribute('aria-pressed', String(isAudio));
  $('text-input').hidden = isAudio;
  $('audio-input').hidden = !isAudio;
  dialogue.disabled = isAudio;
  updateAnalysisNotice();
  if (persist && !usingExample) saveDraft();
  invalidate();
}

async function post(path, body, signal) {
  if (mobile) return mobile.post(path, body, signal);
  return browserAPI.post(path, body, signal);
}

async function requestAnalysis(event) {
  event.preventDefault();
  const selected = source === 'audio';
  const text = selected ? audio.selectedText() : dialogue.value;
  if (!text.trim() || text.length > 2500) {
    const message = !text.trim() ? (selected ? '请先转写并勾选要解读的句子。' : '请先输入要解读的对话。')
      : '所选文字超过 2500 字，请减少句子后再解读。';
    showError('analysis-error', message);
    (selected ? $('transcript').hidden ? $('import-audio') : $('transcript-heading') : dialogue).focus({ preventScroll: true });
    return;
  }
  const profile = activeProfile();
  const previousContext = context.value;
  const options = workspace.getOptions();
  const self = personalAvailable && usePersonal.checked ? personal : undefined;
  const cases = matchingCases(profile?.cases, { dialogue: text, context: previousContext, scenario: options.scenario, excludeId: excludedCase });
  const request = new AbortController();
  pending = request;
  showError('analysis-error');
  setBusy(true);
  renderResult(undefined, { loading: true });
  try {
    const data = await post('/api/analyze', {
      dialogue: text, context: previousContext, profile: profile && { ...profile, cases }, ...options,
      ...(self ? { self } : {})
    }, request.signal);
    if (pending !== request) return;
    let savedId;
    renderResult(data, {
      live: true,
      selfUsed: Boolean(data.assessment && self),
      selfAuthority: self?.authority,
      profileName: profile?.name,
      cases,
      saveReview(reply) {
        const record = {
          result: { ...data, reply }, dialogue: text, context: previousContext, profileId: profile?.id,
          profileName: profile?.name, ...options
        };
        if (savedId && workspace.updateEntry(savedId, { result: record.result })) return true;
        savedId = workspace.saveReview(record);
        return Boolean(savedId);
      }
    });
    if (!$('analyze-view').hidden) $('result-heading').focus({ preventScroll: !matchMedia('(max-width: 760px)').matches });
  } catch (error) {
    if (pending !== request) return;
    renderResult();
    showError('analysis-error', error instanceof TypeError ? '暂时连接不上分析服务，请稍后重试。' : error.message);
  } finally {
    if (pending === request) {
      pending = undefined;
      setBusy(false);
    }
  }
}

function renderProfiles() {
  const list = $('profile-list');
  const search = $('profile-search').value.trim().toLowerCase();
  const found = profiles.filter(profile => !search ||
    [profile.name, profile.position, profile.priority, profile.observations, ...profile.traits,
      ...(profile.cases || []).flatMap(item => [item.habit, item.observed, ...item.evidence])].join(' ').toLowerCase().includes(search));
  list.replaceChildren();
  if (!profiles.length) {
    const empty = element('div', 'panel profile-card');
    empty.append(element('h2', '', '还没有上级档案'));
    empty.append(element('p', 'observations', '从一位常打交道的上级开始，记下一句原话和他最后明确的要求。'));
    list.append(empty);
    return;
  }
  if (!found.length) {
    list.append(element('p', 'empty-state', '没有找到匹配的上级档案。'));
    return;
  }
  for (const profile of found) {
    const box = element('article', 'panel profile-card');
    const head = element('header');
    const name = element('div');
    name.append(element('h2', '', profile.name), element('p', '', profile.position));
    head.append(element('span', 'avatar', [...profile.name][0]), name);
    if (profile.sample) head.append(element('span', 'status-pill', '示例'));
    box.append(head);
    if (profile.traits.length) {
      const tags = element('div', 'traits');
      for (const trait of profile.traits) tags.append(element('span', 'trait', trait));
      box.append(tags);
    }
    if (profile.priority) box.append(element('p', 'observations', profile.priority));
    if (profile.observations) box.append(element('p', 'observations', profile.observations));
    if (profile.cases?.length) box.append(renderProfileCases(profile));
    const count = workspace.profileReviewCount(profile.id);
    const pendingCount = workspace.pendingSuggestionCount(profile.id);
    if (count || pendingCount) {
      const links = element('div', 'audio-actions');
      const related = element('button', 'text-button profile-related', '查看 ' + count + ' 条复盘');
      related.type = 'button';
      related.addEventListener('click', () => workspace.goToReview({ profile: profile.id }));
      if (count) links.append(related);
      if (pendingCount) {
        const check = element('button', 'text-button profile-related', '审阅 ' + pendingCount + ' 条档案建议');
        check.type = 'button';
        check.addEventListener('click', () => workspace.goToReview({ profile: profile.id, status: 'suggested' }));
        links.append(check);
      }
      box.append(links);
    }
    const footer = element('footer');
    const edit = element('button', 'text-button', '编辑档案');
    edit.addEventListener('click', () => openProfile(profile));
    const use = element('button', 'button secondary', '用此档案解读');
    use.addEventListener('click', () => {
      syncSelect(profile.id);
      editDraft();
      location.hash = 'analyze';
      setTimeout(() => (source === 'audio' ? $('source-audio') : dialogue).focus({ preventScroll: true }), 0);
    });
    footer.append(edit, use);
    box.append(footer);
    list.append(box);
  }
}

function renderProfileCases(profile) {
  const list = element('details', 'case-references profile-cases');
  list.append(element('summary', '', '已收录案例 · ' + profile.cases.length));
  for (const item of profile.cases) {
    const card = element('article', 'case-reference');
    card.append(element('p', '', item.habit), element('span', 'evidence-label', '当时的原话'));
    for (const quote of item.evidence) card.append(element('blockquote', 'source', quote));
    card.append(element('span', 'evidence-label', '确认后的要求'), element('p', 'proposal-observed', item.observed));
    const remove = element('button', 'text-button danger', '移出档案');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (!confirm('从上级档案移除这个案例？原复盘会保留。')) return;
      try {
        storeProfiles(profiles.map(value => value.id === profile.id
          ? { ...value, cases: value.cases.filter(entry => entry.id !== item.id) } : value));
        workspace.dismissSuggestion(item.id);
        renderProfiles();
        if (select.value === profile.id) invalidate();
      } catch {
        showToast('暂时无法移除案例');
      }
    });
    card.append(remove);
    list.append(card);
  }
  return list;
}

function openProfile(profile) {
  clearHabits();
  editId = profile?.id;
  $('profile-title').textContent = profile ? '编辑上级档案' : '新建上级档案';
  $('profile-name').value = profile?.name ?? '';
  $('profile-position').value = profile?.position ?? '';
  $('profile-priority').value = profile?.priority ?? '';
  observations.value = profile?.observations ?? '';
  $('delete-profile').hidden = !profile;
  for (const option of profileForm.querySelectorAll('[type="checkbox"]')) {
    option.checked = !!profile?.traits.includes(option.value);
  }
  showError('profile-error');
  dialog.showModal();
}

function clearHabits() {
  pendingHabits?.abort();
  pendingHabits = undefined;
  readHabits.disabled = false;
  $('read-habits-label').textContent = '从例子梳理沟通习惯';
  $('habit-result').hidden = true;
}

function renderHabits(data) {
  const box = $('habit-result');
  box.replaceChildren(element('h3', '', '可能的沟通习惯'), element('p', '', data.pattern));
  addEvidence(box, data.evidence);
  if (data.uncertainty) box.append(element('p', 'profile-insight', data.uncertainty));
  if (data.preference) {
    box.append(element('p', 'profile-insight', '可记录的偏好：' + data.preference));
    const adopt = element('button', 'button secondary', '加到「他通常在意什么」');
    adopt.type = 'button';
    adopt.addEventListener('click', () => {
      const priority = $('profile-priority');
      const merged = [priority.value.trim(), data.preference].filter(Boolean).join('\n');
      if (merged.length > priority.maxLength) {
        showError('profile-error', '关注点最多 200 字，请先精简已有内容。');
        return;
      }
      priority.value = merged;
      priority.focus({ preventScroll: true });
      adopt.disabled = true;
      adopt.textContent = '已填入，可编辑后保存';
      showError('profile-error');
    });
    box.append(adopt);
  }
  box.hidden = false;
}

async function requestHabits() {
  showError('profile-error');
  if (!observations.value.trim()) {
    showError('profile-error', '请先记录至少一个具体例子。');
    observations.focus();
    return;
  }
  clearHabits();
  const request = new AbortController();
  pendingHabits = request;
  readHabits.disabled = true;
  $('read-habits-label').textContent = '正在梳理…';
  try {
    const data = await post('/api/profile-insight', { examples: observations.value }, request.signal);
    if (pendingHabits === request) renderHabits(data);
  } catch (error) {
    if (pendingHabits === request) showError('profile-error', error instanceof TypeError ? '暂时连接不上分析服务，请稍后重试。' : error.message);
  } finally {
    if (pendingHabits === request) {
      pendingHabits = undefined;
      readHabits.disabled = false;
      $('read-habits-label').textContent = '从例子梳理沟通习惯';
    }
  }
}

function saveProfile(event) {
  event.preventDefault();
  const name = $('profile-name').value.trim();
  if (!name) {
    showError('profile-error', '请输入这位上级的称呼。');
    return;
  }
  const profile = {
    id: editId || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
    name,
    position: $('profile-position').value.trim(),
    traits: [...profileForm.querySelectorAll(':checked')].map(option => option.value),
    priority: $('profile-priority').value.trim(),
    observations: observations.value.trim(),
    cases: profiles.find(item => item.id === editId)?.cases || []
  };
  const next = editId ? profiles.map(item => item.id === editId ? profile : item) : [...profiles, profile];
  try {
    storeProfiles(next);
  } catch {
    showError('profile-error', '当前浏览器无法保存，请允许本地存储后重试。');
    return;
  }
  syncSelect();
  if (select.value === profile.id) invalidate();
  renderProfiles();
  dialog.close();
  showToast('档案已保存');
}

function deleteProfile() {
  if (!confirm('确定删除这个上级档案？')) return;
  const selected = select.value === editId;
  try {
    storeProfiles(profiles.filter(item => item.id !== editId));
  } catch {
    showError('profile-error', '暂时无法删除档案，请重试。');
    return;
  }
  syncSelect();
  if (selected) invalidate();
  renderProfiles();
  dialog.close();
  showToast('档案已删除');
}

function route() {
  const hash = location.hash.slice(1);
  const showPersonal = hash === 'personal' && personalAvailable;
  const current = showPersonal ? 'settings' : ['profiles', 'history', 'settings'].includes(hash) ? hash : 'analyze';
  if (location.hash === '#audio') setSource('audio');
  if (current !== 'analyze') {
    audio.finishRecording();
    audio.pause();
  }
  $('analyze-view').hidden = current !== 'analyze';
  $('profiles-view').hidden = current !== 'profiles';
  $('history-view').hidden = current !== 'history';
  $('settings-view').hidden = current !== 'settings';
  if (current === 'history') workspace.showHistory();
  else if (current === 'profiles') renderProfiles();
  else if (current === 'analyze') workspace.renderOverview();
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  if (showPersonal) requestAnimationFrame(() => $('personal-heading').focus());
}

function restoreDraft({ focus = false } = {}) {
  if (draft) {
    const snapshot = draft;
    if (usingExample || (!dialogue.value && !context.value && !audio.selectedText())) {
      usingExample = false;
      setSource('text', false);
      dialogue.value = (snapshot.source === 'audio' && snapshot.audioText) || snapshot.dialogue || snapshot.audioText || '';
      context.value = snapshot.context || '';
      syncSelect(snapshot.profileId || '');
      workspace.setOptions(snapshot);
      invalidate();
    }
  }
  if (focus && draft && source === 'audio' && !audio.selectedText() && (draft.dialogue || draft.audioText)) {
    setSource('text', false);
    history.replaceState(null, '', '#analyze');
  }
  renderDraft();
  if (focus) (source === 'audio' ? $('record-audio') : dialogue).focus();
}

function newConversation() {
  if ((draft || dialogue.value || !$('audio-preview').hidden) && !confirm('清空当前编辑区并新建对话？已保存的复盘和录音会保留。')) return;
  if (!audio.clear()) return showToast('请先停止当前录音');
  usingExample = false;
  excludedCase = undefined;
  setSource('text', false);
  dialogue.value = '';
  context.value = '';
  syncSelect('');
  saveDraft();
  invalidate();
  history.replaceState(null, '', '#analyze');
  dialogue.focus();
}

function setUpPersonalProfile() {
  const form = $('personal-profile');
  const notice = $('personal-status');
  const fields = personalFields.map(name => [name, $('self-' + name)]);
  const exportButton = $('export-personal');
  const picker = $('personal-file');
  const status = (text, error = false) => {
    notice.hidden = false;
    notice.classList.toggle('form-error', error);
    notice.textContent = text;
  };
  const show = () => {
    const saved = personalFields.some(name => personal[name]);
    $('personal-toggle-label').hidden = !saved;
    $('personal-settings-link').textContent = saved ? '编辑个人信息' : '设置个人信息';
    exportButton.disabled = !saved;
    if (!saved) usePersonal.checked = false;
    updateAnalysisNotice();
  };
  for (const [name, input] of fields) input.value = typeof personal[name] === 'string' ? personal[name] : '';
  form.hidden = $('personal-use').hidden = $('context-guide').hidden = false;
  show();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = Object.fromEntries(fields.map(([name, input]) => [name, input.value.trim()]).filter(([, value]) => value));
    try {
      if (Object.keys(next).length) localStorage.setItem(personalKey, JSON.stringify(next));
      else localStorage.removeItem(personalKey);
      personal = next;
      status(Object.keys(next).length ? '个人信息已保存在本机。' : '已移除个人信息。');
      show();
      if (usePersonal.checked) invalidate();
    } catch {
      status('暂时无法保存，请检查本机存储权限。', true);
    }
  });
  exportButton.addEventListener('click', async () => {
    const text = JSON.stringify({ type: 'xianwai-personal', version: 1, profile: personal }, null, 2);
    try {
      if (!mobile) downloadJson(text, '弦外-个人信息.json');
      else if (await mobile.exportText(text, 'personal')) status('个人信息已导出。');
    } catch (error) { status(error.message, true); }
  });
  $('import-personal').addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    try {
      if (file.size > 8_000) throw new Error('File is too large.');
      const data = JSON.parse(await file.text());
      if (data?.type !== 'xianwai-personal' || data.version !== 1) throw new Error('Invalid personal export.');
      const values = fields.map(([name, input]) => typeof data.profile?.[name] === 'string'
        ? data.profile[name].trim().slice(0, input.maxLength) : '');
      if (!values.some(Boolean)) throw new Error('Empty personal profile.');
      fields.forEach(([, input], index) => { input.value = values[index]; });
      status('已载入个人信息，确认后点保存。');
    } catch {
      status('无法导入，请选择弦外导出的个人信息文件。', true);
    }
  });
  usePersonal.addEventListener('change', () => {
    updateAnalysisNotice();
    invalidate();
  });
}

for (const trait of traits) {
  const label = element('label', 'trait-option');
  const checkbox = element('input');
  checkbox.type = 'checkbox';
  checkbox.value = trait;
  label.append(checkbox, element('span', '', trait));
  $('trait-options').append(label);
}

$('new-profile').addEventListener('click', () => openProfile());
$('profile-search').addEventListener('input', renderProfiles);
$('open-profiles').addEventListener('click', () => { location.hash = 'profiles'; });
$('new-conversation').addEventListener('click', newConversation);
$('quick-import').addEventListener('click', () => {
  setSource('audio');
  history.replaceState(null, '', '#audio');
  audio.openPicker();
});
$('resume-draft').addEventListener('click', () => restoreDraft({ focus: true }));
$('export-profiles').addEventListener('click', exportProfiles);
$('import-profiles').addEventListener('click', () => $('profile-file').click());
$('profile-file').addEventListener('change', importProfiles);
$('close-profile').addEventListener('click', () => dialog.close());
$('cancel-profile').addEventListener('click', () => dialog.close());
$('delete-profile').addEventListener('click', deleteProfile);
readHabits.addEventListener('click', requestHabits);
observations.addEventListener('input', () => { clearHabits(); showError('profile-error'); });
dialog.addEventListener('close', clearHabits);
profileForm.addEventListener('submit', saveProfile);
$('analysis-form').addEventListener('submit', requestAnalysis);
$('source-text').addEventListener('click', () => {
  setSource('text');
  if (location.hash === '#audio') history.replaceState(null, '', '#analyze');
});
$('source-audio').addEventListener('click', () => {
  setSource('audio');
  history.replaceState(null, '', '#audio');
});
select.addEventListener('change', () => { syncSelect(); editDraft(); });
dialogue.addEventListener('input', editDraft);
context.addEventListener('input', editDraft);
$('load-example').addEventListener('click', () => {
  if (web && !usingExample && (dialogue.value.trim() || context.value.trim()) && !confirm('用示例替换编辑区？原来的本机草稿还能恢复。')) return;
  usingExample = true;
  dialogue.value = exampleDialogue;
  context.value = exampleContext;
  syncSelect(profiles.find(item => item.sample)?.id || '');
  renderDraft();
  invalidate();
});
window.addEventListener('hashchange', route);

syncSelect();
renderProfiles();
renderResult();
restoreDraft();
if (personalAvailable) setUpPersonalProfile();
route();
if (mobile) updateAnalysisNotice();
else if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
