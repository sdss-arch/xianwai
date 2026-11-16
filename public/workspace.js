import { scenarios, replyTones, numberedLines } from './analysis-core.mjs';
import { confirmedObservation, caseFingerprint, fallbackSuggestion } from './casebook.mjs';

const $ = id => document.getElementById(id);
const historyKey = 'xianwai.review.v1';
const preferencesKey = 'xianwai.preferences.v1';
const states = { open: '待跟进', confirmed: '已确认', revised: '解读有偏差' };
const checklist = { delivery: '交付物', deadline: '截止时间', priority: '优先级', owner: '负责人' };
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const displayDay = value => shortDate.format(new Date(value + 'T12:00:00'));

function localDay(now) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(value => String(value).padStart(2, '0')).join('-');
}

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content) element.textContent = content;
  if (className) element.className = className;
  return element;
}

function button(text, action, className = 'button secondary') {
  const element = node('button', text, className);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

function label(text, field) {
  const wrapper = node('label', text, 'review-field');
  wrapper.append(field);
  return wrapper;
}

function input(value = '', type = 'text', maxLength = 100) {
  const field = node('input');
  field.type = type;
  if (type === 'text') field.maxLength = maxLength;
  field.value = value;
  return field;
}

function appendOptions(select, choices) {
  for (const [key, name] of Object.entries(choices)) select.append(new Option(name, key));
}

function summaryTitle(item) {
  return item.title || item.result?.stated?.text || item.dialogue?.trim().slice(0, 32) || '对话解读';
}

function empty(container, text, linkText, href) {
  const box = node('div', '', 'empty-state');
  box.append(node('p', text));
  if (linkText) {
    const link = node('a', linkText, 'text-button');
    link.href = href;
    box.append(link);
  }
  container.replaceChildren(box);
}

export function setupWorkspace({ library, notify, review, adopt, suggest, openRecording, onOptionsChange, getProfiles }) {
  const scenario = $('mobile-scenario');
  const tone = $('mobile-tone');
  const statusFilter = $('review-filter');
  const profileFilter = $('review-profile-filter');
  const query = $('review-search');
  appendOptions(scenario, scenarios);
  appendOptions(tone, Object.fromEntries(Object.entries(replyTones).map(([key, value]) => [key, value.label])));

  function getOptions() { return { scenario: scenario.value, tone: tone.value }; }
  function setOptions(value) {
    scenario.value = Object.hasOwn(scenarios, value?.scenario) ? value.scenario : '';
    tone.value = Object.hasOwn(replyTones, value?.tone) ? value.tone : 'neutral';
  }
  setOptions(readLocal(preferencesKey, {}));
  for (const element of [scenario, tone]) {
    element.addEventListener('change', () => {
      try { localStorage.setItem(preferencesKey, JSON.stringify(getOptions())); } catch {}
      onOptionsChange();
    });
  }

  const prior = readLocal(historyKey, []);
  let entries = Array.isArray(prior) ? prior.filter(item => item?.id && item.result) : [];
  let recordingsTab = false;
  let recordingRefresh = 0;
  let expandedId;
  const suggestionRequests = new Map();

  function persist(next) {
    try {
      localStorage.setItem(historyKey, JSON.stringify(next));
      entries = next;
      renderOverview();
      return true;
    } catch {
      notify('暂时无法保存复盘，请检查设备存储');
      return false;
    }
  }

  function renderOverview() {
    const now = new Date();
    $('desk-date').textContent = fullDate.format(now);
    const pending = entries.filter(item => item.status === 'open');
    const due = pending.filter(item => item.due && item.due <= localDay(now)).length;
    $('followup-title').textContent = '待跟进' + (pending.length ? ' · ' + pending.length : '');
    $('followup-description').textContent = due ? due + ' 条到期或逾期' : (pending.length ? '查看待确认事项' : '暂无待确认记录');
    $('followup-description').classList.toggle('has-due', due > 0);
    const count = getProfiles().filter(item => !item.sample).length;
    $('profile-overview-title').textContent = '上级档案' + (count ? ' · ' + count : '');
    const recent = $('recent-list');
    if (!entries.length) {
      empty(recent, '保存一次解读后，可在这里回看和跟进。');
      return;
    }
    recent.replaceChildren();
    for (const item of entries.slice().sort((a, b) => b.date - a.date).slice(0, 3)) {
      const action = button('', () => goToReview({ id: item.id }), 'recent-row');
      const meta = [item.profileName, item.date ? shortDate.format(new Date(item.date)) : undefined].filter(Boolean).join(' · ');
      const title = node('span', '', 'recent-content');
      title.append(node('strong', summaryTitle(item)), node('small', meta));
      action.append(title, node('span', states[item.status] || states.open, 'status-pill'));
      recent.append(action);
    }
  }

  function refreshProfiles() {
    const value = profileFilter.value;
    const profiles = new Map(getProfiles().map(item => [item.id, item.name]));
    for (const item of entries) {
      if (item.profileId && !profiles.has(item.profileId)) profiles.set(item.profileId, item.profileName || '已移除档案');
    }
    profileFilter.replaceChildren(new Option('全部档案', ''));
    for (const [id, name] of profiles) profileFilter.append(new Option(name, id));
    profileFilter.value = profiles.has(value) ? value : '';
  }

  function updateEntry(id, delta) {
    return entries.some(item => item.id === id) && persist(entries.map(item => item.id === id ? { ...item, ...delta } : item));
  }

  function proposalFor(entry) {
    const observed = confirmedObservation(entry);
    if (!observed || !getProfiles().some(profile => profile.id === entry.profileId) || !entry.dialogue?.trim()) return null;
    const key = caseFingerprint(entry, observed);
    if (entry.proposal?.key === key) return entry.proposal;
    return {
      key, state: 'pending',
      ...fallbackSuggestion(entry, numberedLines(entry.dialogue), observed)
    };
  }

  async function refineProposal(entry, proposal) {
    if (!proposal || proposal.state !== 'pending' || proposal.refined) return;
    if (suggestionRequests.get(entry.id)?.key === proposal.key) return;
    const controller = new AbortController();
    suggestionRequests.get(entry.id)?.controller.abort();
    suggestionRequests.set(entry.id, { key: proposal.key, controller });
    try {
      const result = await suggest(entry, proposal.observed, controller.signal);
      if (controller.signal.aborted) return;
      const latest = entries.find(value => value.id === entry.id);
      const open = latest && proposalFor(latest);
      if (!open || open.key !== proposal.key || open.state !== 'pending') return;
      const currentLines = new Set(numberedLines(latest.dialogue).map(line => line.text));
      const evidence = Array.isArray(result.evidence) ? result.evidence.filter(line => currentLines.has(line)).slice(0, 2) : [];
      if (!evidence.length || !result.habit?.trim()) return;
      const refined = { ...open, habit: result.habit.trim().slice(0, 260), evidence, refined: true };
      if (!updateEntry(entry.id, { proposal: refined })) return;
      const view = document.getElementById('proposal-' + entry.id);
      if (view && !view.querySelector('textarea')?.dataset.edited) {
        renderProposal(view, { ...latest, proposal: refined });
      }
    } catch {
      // The locally generated suggestion stays available if the configured model is unavailable.
    } finally {
      if (suggestionRequests.get(entry.id)?.controller === controller) suggestionRequests.delete(entry.id);
    }
  }

  function renderProposal(container, entry) {
    const proposal = proposalFor(entry);
    container.replaceChildren();
    container.hidden = !proposal;
    if (!proposal) return;
    container.append(node('h3', '档案更新建议'));
    if (proposal.state === 'accepted') {
      container.append(node('p', '已收录到这位上级的档案。', 'proposal-note'));
      return;
    }
    if (proposal.state === 'dismissed') {
      container.append(node('p', '这次已略过。', 'proposal-note'), button('重新查看建议', () => {
        const value = { ...proposal, state: 'pending' };
        if (updateEntry(entry.id, { proposal: value })) renderProposal(container, { ...entry, proposal: value });
      }, 'text-button'));
      return;
    }
    const editor = node('textarea');
    editor.rows = 3;
    editor.maxLength = 260;
    editor.value = proposal.habit;
    editor.addEventListener('input', () => { editor.dataset.edited = 'true'; });
    if (!proposal.refined) container.append(node('p', '这是根据本条复盘拟出的初稿，可先修改再收录。', 'proposal-note'));
    container.append(label('建议记录的沟通习惯', editor), node('span', '当时的原话', 'evidence-label'));
    for (const quote of proposal.evidence) container.append(node('blockquote', quote, 'source'));
    container.append(node('span', '后来确认的要求', 'evidence-label'), node('p', proposal.observed, 'proposal-observed'));
    const actions = node('div', '', 'audio-actions');
    actions.append(button('加入上级档案', () => {
      const habit = editor.value.trim();
      if (!habit) return notify('请先填写要收录的沟通习惯');
      if (!adopt(entry, { ...proposal, habit })) return;
      const accepted = { ...proposal, habit, state: 'accepted' };
      updateEntry(entry.id, { proposal: accepted });
      if (statusFilter.value === 'suggested') renderReviews();
      else renderProposal(container, { ...entry, proposal: accepted });
    }, 'button primary'), button('略过', () => {
      const dismissed = { ...proposal, state: 'dismissed' };
      if (!updateEntry(entry.id, { proposal: dismissed })) return;
      if (statusFilter.value === 'suggested') renderReviews();
      else renderProposal(container, { ...entry, proposal: dismissed });
    }, 'text-button'));
    if (!proposal.refined) actions.append(button('用模型提炼', () => {
      if (editor.dataset.edited) return notify('你已修改建议，可直接收录');
      refineProposal(entry, proposal);
    }, 'text-button'));
    container.append(actions);
  }

  function renderReview(item) {
    const card = node('details', '', 'panel review-card');
    card.open = item.id === expandedId;
    card.addEventListener('toggle', () => {
      if (card.open) expandedId = item.id;
      else if (expandedId === item.id) expandedId = undefined;
    });
    const summary = node('summary');
    const identity = node('span', '', 'review-identity');
    const meta = [item.profileName, scenarios[item.scenario], item.date ? shortDate.format(new Date(item.date)) : undefined].filter(Boolean).join(' · ');
    identity.append(node('strong', summaryTitle(item)), node('small', meta));
    summary.append(identity, node('span', states[item.status] || states.open, 'status-pill status-' + item.status));
    card.append(summary);
    const annotations = node('div', '', 'review-annotations');
    if (item.pinned) annotations.append(node('span', '已置顶', 'marker'));
    if (item.due) annotations.append(node('span', displayDay(item.due) + ' 跟进', 'marker'));
    for (const tag of item.tags || []) annotations.append(node('span', tag, 'marker'));
    if (annotations.childElementCount) identity.append(annotations);

    const details = node('div', '', 'review-body');
    const title = input(item.title, 'text', 80);
    title.placeholder = '例如：客户评审前的方案修改';
    const tags = input(item.tags?.join('、'), 'text', 90);
    tags.placeholder = '例如：客户评审、方案交付';
    const state = node('select');
    appendOptions(state, states);
    state.value = item.status || 'open';
    const due = input(item.due, 'date');
    const form = node('div', '', 'review-fields');
    form.append(label('记录标题', title), label('标签（用顿号分隔）', tags),
      label('复盘状态', state), label('跟进日期', due));
    details.append(form);

    const confirmed = node('fieldset', '', 'confirmation-fields');
    confirmed.append(node('legend', '确认清单'));
    const grid = node('div', '', 'review-fields');
    const fields = Object.entries(checklist).map(([key, text]) => {
      const field = input(item.confirmed?.[key]);
      grid.append(label(text, field));
      return [key, field];
    });
    confirmed.append(grid);
    details.append(confirmed);

    const note = node('textarea');
    note.maxLength = 300;
    note.rows = 2;
    note.value = item.note || '';
    note.placeholder = '记下实际发生的事，或下次准备怎么追问';
    details.append(label('后来确认的情况', note));
    if (item.profileId) details.append(node('p', '保存已确认的要求后，会用当前模型提炼档案建议。', 'proposal-note'));
    const proposalView = node('section', '', 'profile-proposal');
    proposalView.id = 'proposal-' + item.id;
    renderProposal(proposalView, item);
    details.append(proposalView);

    const saved = node('details', '', 'review-original');
    saved.append(node('summary', '当时的对话与解读'));
    const material = node('div', '', 'review-material');
    material.append(node('h3', '原话'), node('p', item.dialogue, 'review-source'));
    const assessment = item.result.assessment;
    if (assessment) {
      material.append(node('h3', assessment.label + ' · ' + assessment.status),
        node('p', assessment.signal, 'review-source'), node('h3', '当时建议的下一步'),
        node('p', assessment.next, 'review-source'));
      for (const line of assessment.contextEvidence || []) material.append(node('blockquote', line, 'source'));
    }
    for (const interpretation of assessment ? [] : item.result.interpretations || []) {
      const reading = node('div', '', 'review-quote');
      reading.append(node('strong', interpretation.title), node('p', interpretation.explanation));
      for (const evidence of interpretation.evidence || []) reading.append(node('blockquote', evidence, 'source'));
      material.append(reading);
    }
    material.append(node('h3', '保存的回复'), node('p', item.result.reply, 'review-reply'));
    saved.append(material);
    details.append(saved);

    const actions = node('div', '', 'audio-actions review-actions');
    actions.append(button('保存复盘', () => {
      const updated = {
        title: title.value.trim(),
        tags: [...new Set(tags.value.split(/[、，,]/u).map(tag => tag.trim().slice(0, 20)).filter(Boolean))].slice(0, 6),
        status: state.value,
        due: due.value,
        note: note.value.trim(),
        confirmed: Object.fromEntries(fields.map(([key, field]) => [key, field.value.trim()]))
      };
      const entry = { ...item, ...updated };
      const suggestion = proposalFor(entry);
      if (!updateEntry(item.id, { ...updated, proposal: suggestion })) return;
      expandedId = item.id;
      renderReviews();
      notify('复盘已保存');
      if (suggestion && suggestion.key !== item.proposal?.key) {
        document.getElementById('proposal-' + item.id)?.scrollIntoView({ block: 'nearest' });
        refineProposal(entry, suggestion);
      }
    }, 'button primary'), button('重新解读', () => review(item)));
    actions.append(button(item.pinned ? '取消置顶' : '置顶', () => {
      if (updateEntry(item.id, { pinned: !item.pinned })) {
        expandedId = item.id;
        renderReviews();
      }
    }, 'text-button'), button('删除记录', () => {
      if (confirm('删除这条复盘记录？') && persist(entries.filter(entry => entry.id !== item.id))) renderReviews();
    }, 'text-button danger'));
    details.append(actions);
    card.append(details);
    return card;
  }

  function renderReviews() {
    const search = query.value.trim().toLowerCase();
    const status = statusFilter.value;
    const filtered = entries.filter(entry => {
      if (status === 'suggested' ? proposalFor(entry)?.state !== 'pending' : (status && (entry.status || 'open') !== status)) return false;
      if (profileFilter.value && entry.profileId !== profileFilter.value) return false;
      const searchable = [summaryTitle(entry), entry.profileName, entry.context, entry.dialogue, entry.note,
        entry.result.reply, ...(entry.tags || []), ...Object.values(entry.confirmed || {})];
      return !search || searchable.join(' ').toLowerCase().includes(search);
    }).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
      || (statusFilter.value === 'open' ? (a.due || '9999').localeCompare(b.due || '9999') : 0)
      || b.date - a.date);
    const target = $('review-list');
    $('review-count').textContent = filtered.length + ' 条记录';
    if (filtered.length) target.replaceChildren(...filtered.map(renderReview));
    else if (entries.length) empty(target, '没有符合条件的记录。');
    else empty(target, '解读完成后，点「保存到复盘」即可在这里回看。', '去工作台', '#analyze');
  }

  async function renderRecordings() {
    const target = $('recordings-list');
    const current = ++recordingRefresh;
    empty(target, '正在读取本机录音…');
    try {
      const files = await library.listRecordings();
      if (current !== recordingRefresh) return;
      if (!files.length) return empty(target, '在工作台录完一段，原音频会自动存到这里。', '录制一段', '#audio');
      target.replaceChildren();
      for (const file of files) {
        const row = node('article', '', 'panel recording-card');
        const heading = node('div', '', 'recording-identity');
        heading.append(node('h2', '录音 · ' + new Date(file.time).toLocaleString()), node('p', Math.ceil(file.size / 1024) + ' KB'));
        const actions = node('div', '', 'audio-actions');
        actions.append(button('打开转写', () => openRecording(file), 'button primary'), button('导出', async () => {
          try { if (await library.export(file.id)) notify('录音已导出'); }
          catch (error) { notify(error.message); }
        }), button('删除', async () => {
          if (!confirm('从本机移除这段录音？')) return;
          try { await library.deleteRecording(file.id); renderRecordings(); }
          catch (error) { notify(error.message); }
        }, 'text-button danger'));
        row.append(heading, actions);
        target.append(row);
      }
    } catch (error) {
      if (current === recordingRefresh) empty(target, error.message);
    }
  }

  function showHistory(recordings = recordingsTab) {
    recordingsTab = recordings;
    $('review-area').hidden = recordings;
    $('recordings-list').hidden = !recordings;
    $('show-reviews').setAttribute('aria-pressed', String(!recordings));
    $('show-recordings').setAttribute('aria-pressed', String(recordings));
    if (recordings) renderRecordings();
    else {
      refreshProfiles();
      renderReviews();
    }
  }

  function goToReview({ status = '', profile = '', id } = {}) {
    refreshProfiles();
    statusFilter.value = status;
    profileFilter.value = profile;
    query.value = '';
    expandedId = id;
    recordingsTab = false;
    if (location.hash === '#history') showHistory();
    else location.hash = 'history';
  }

  $('show-reviews').addEventListener('click', () => showHistory(false));
  $('show-recordings').addEventListener('click', () => showHistory(true));
  statusFilter.addEventListener('change', renderReviews);
  profileFilter.addEventListener('change', renderReviews);
  query.addEventListener('input', renderReviews);
  $('open-followups').addEventListener('click', () => goToReview({ status: 'open' }));

  return {
    getOptions, setOptions, renderOverview, showHistory, goToReview, updateEntry,
    profileReviewCount: id => entries.filter(item => item.profileId === id).length,
    pendingSuggestionCount: id => entries.filter(item => item.profileId === id && proposalFor(item)?.state === 'pending').length,
    dismissSuggestion(id) {
      const item = entries.find(value => value.id === id);
      if (item?.proposal?.state === 'accepted') updateEntry(id, { proposal: { ...item.proposal, state: 'dismissed' } });
    },
    saveReview(entry) {
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      return persist([{ ...entry, id, date: Date.now(), status: 'open', note: '' }, ...entries]) ? id : '';
    }
  };
}
