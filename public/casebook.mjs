const trim = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const confirmationLabels = { delivery: '交付物', deadline: '截止时间', priority: '优先级', owner: '负责人' };
const generic = new Set(['这个', '那个', '一下', '这个事', '一下吧', '先看', '可以', '这个方', '对方', '我先', '需要', '请你', '你先', '我们']);

function terms(text) {
  const found = new Set();
  for (const word of (text.toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]+/gu) || [])) {
    if (/^[a-z0-9]/u.test(word)) {
      if (word.length >= 2) found.add(word);
      continue;
    }
    for (let index = 0; index + 1 < word.length; index++) {
      const pair = word.slice(index, index + 2);
      if (!generic.has(pair)) found.add(pair);
    }
  }
  return found;
}

function similarity(left, right) {
  let count = 0;
  for (const word of left) if (right.has(word)) count++;
  return count;
}

export function cleanCase(item) {
  if (!item || typeof item !== 'object') return null;
  const id = trim(item.id, 64);
  const observed = trim(item.observed, 720);
  const habit = trim(item.habit, 260);
  const evidence = Array.isArray(item.evidence)
    ? [...new Set(item.evidence.filter(line => typeof line === 'string' && line.trim() && line.length <= 2500))].slice(0, 2) : [];
  if (!/^[a-z\d-]{1,64}$/u.test(id) || !observed || !habit || !evidence.length) return null;
  return {
    id, observed, habit, evidence,
    scenario: trim(item.scenario, 24),
    context: trim(item.context, 160),
    date: Number.isFinite(item.date) ? item.date : 0
  };
}

export function matchingCases(entries, query, limit = 3) {
  if (!Array.isArray(entries)) return [];
  const queryWords = terms([trim(query.dialogue, 2500), trim(query.context, 700), trim(query.observed, 720)].join(' '));
  const scored = [];
  for (const entry of entries) {
    const item = cleanCase(entry);
    if (!item || item.id === query.excludeId) continue;
    const phraseMatches = similarity(queryWords, terms(item.evidence.join(' ') + ' ' + item.context));
    const overlaps = phraseMatches * 2 + similarity(queryWords, terms(item.observed + ' ' + item.habit));
    const scene = query.scenario && item.scenario === query.scenario;
    if (overlaps >= 3 || scene) scored.push({ item, score: overlaps + (scene ? 4 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score || b.item.date - a.item.date).slice(0, limit).map(entry => entry.item);
}

export function confirmedObservation(entry) {
  const note = trim(entry?.note, 300);
  const parts = Object.entries(confirmationLabels).flatMap(([key, label]) => {
    const value = trim(entry?.confirmed?.[key], 100);
    return value ? [label + '：' + value] : [];
  });
  const finalStatus = entry?.status === 'confirmed' || entry?.status === 'revised';
  if (!parts.length && !finalStatus) return '';
  return trim([note, ...parts].filter(Boolean).join('\n'), 720);
}

export function caseFingerprint(entry, observed) {
  const signature = [entry.profileId, entry.dialogue, entry.context, entry.scenario, observed].join('\u001f');
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index++) hash = Math.imul(hash ^ signature.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function fallbackSuggestion(entry, lines, observed) {
  const observationTerms = terms(observed);
  const candidates = Array.isArray(entry?.result?.stated?.evidence) ? entry.result.stated.evidence : [];
  const ranked = lines.slice().sort((a, b) => {
    const score = row => (candidates.includes(row.text) ? 3 : 0) + similarity(observationTerms, terms(row.text));
    return score(b) - score(a) || a.id - b.id;
  });
  const excerpt = observed.split('\n')[0].replace(/^(?:我确认|后来确认|真正的要求是|实际要求是)[，：:\s]*/u, '').replace(/[。；;]+$/u, '');
  return {
    habit: trim('这次沟通中，最终确认是「' + excerpt.slice(0, 120) + '」。遇到类似表达，可以先确认对应的交付要求或行动边界。', 260),
    evidence: ranked.slice(0, 1).map(line => line.text),
    observed
  };
}
