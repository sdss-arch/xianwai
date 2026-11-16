const maximumBytes = 40 * 1024 * 1024;
const maximumSeconds = 120;
const sampleRate = 16000;
const element = id => document.getElementById(id);

function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
}

function describeError(id, message = '') {
  const node = element(id);
  node.hidden = !message;
  node.textContent = message;
}

async function decodeAudio(file) {
  const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Context) throw new Error('当前浏览器不支持本机音频解码，可改用新版 Safari 或 Chrome。');
  let decoded;
  try {
    decoded = await new Context(1, 1, sampleRate).decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('无法读取这段音频，请尝试导入 MP3、M4A 或 WAV 格式。');
  }
  if (decoded.duration > maximumSeconds + 0.3) throw new Error('单段音频最长 2 分钟，请截取要分析的片段后重试。');
  if (decoded.duration < 0.5) throw new Error('音频太短，请录下一句完整的话。');
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const input = decoded.getChannelData(channel);
    for (let index = 0; index < input.length; index++) mono[index] += input[index] / decoded.numberOfChannels;
  }
  if (!mono.some(sample => Math.abs(sample) > 0.004)) throw new Error('这段音频没有检测到清晰的声音。');
  return mono;
}

function rowsFrom({ text, chunks }) {
  const segments = chunks?.length ? chunks : [{ text, timestamp: [null] }];
  return segments.flatMap(segment => (segment.text || '').split(/(?<=[。！？!?；;])|\r?\n/u).map(value => ({
    text: value.trim(),
    start: segment.timestamp?.[0],
    selected: false
  }))).filter(row => row.text);
}

export function setupAudio(onSelectionChange, native, browserLibrary) {
  const panel = element('audio-input');
  const player = element('audio-player');
  const picker = element('audio-file');
  const record = element('record-audio');
  const recordLabel = element('record-label');
  const timer = element('recording-time');
  const importButton = element('import-audio');
  const clearButton = element('clear-audio');
  const transcribe = element('transcribe-audio');
  const cancel = element('cancel-transcription');
  const transcript = element('transcript');
  const lines = element('transcript-lines');
  const toggle = element('toggle-all-lines');
  const saveAudio = element('save-audio');
  const canRecord = !!(native || (navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
  let file;
  let fileMeta;
  let mediaUrl;
  let recording;
  let stopping = false;
  let requestingMic = false;
  let ticker;
  let worker;
  let activeJob;
  let localWork = false;
  let rows = [];

  const selectedText = () => rows.filter(row => row.selected && row.text.trim()).map(row => row.text.trim()).join('\n');

  function refreshSelection() {
    const selected = rows.filter(row => row.selected && row.text.trim()).length;
    const size = selectedText().length;
    element('selection-count').textContent = '已选 ' + selected + ' / ' + rows.length + ' 句 · ' + size + ' / 2500 字';
    element('selection-count').classList.toggle('over-limit', size > 2500);
    toggle.textContent = rows.every(row => row.selected) ? '取消全选' : '全选';
    onSelectionChange();
  }

  function updateControls() {
    record.disabled = !canRecord || requestingMic || stopping || !!activeJob || localWork;
    recordLabel.textContent = recording ? '停止录音' : requestingMic ? '等待麦克风授权…' : '开始录音';
    record.classList.toggle('is-recording', !!recording);
    timer.hidden = !recording;
    importButton.disabled = requestingMic || !!recording || !!activeJob || localWork;
    clearButton.disabled = requestingMic || !!recording;
    transcribe.disabled = requestingMic || !!recording || !!activeJob || localWork;
    cancel.hidden = !activeJob;
  }

  function setFile(next, name, meta) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    file = next;
    fileMeta = meta;
    mediaUrl = next ? URL.createObjectURL(next) : undefined;
    if (mediaUrl) {
      player.src = mediaUrl;
      saveAudio.href = mediaUrl;
      saveAudio.download = name;
    } else {
      saveAudio.removeAttribute('href');
    }
    element('audio-name').textContent = name || '';
    saveAudio.hidden = !!native && !meta;
    element('audio-preview').hidden = !next;
    describeError('transcription-state');
    rows = [];
    renderRows();
  }

  function showAudio(next, name, meta) {
    describeError('audio-error');
    if (!next.size || next.size > maximumBytes) {
      describeError('audio-error', '请选择一段非空、40 MB 以内的音频。');
      return false;
    }
    abortJob();
    setFile(next, name, meta);
    return true;
  }

  async function loadRecording(meta) {
    if (!meta) return;
    try {
      if (!native) {
        return showAudio(await browserLibrary.open(meta.id), meta.name, meta);
      }
      const url = new URL(meta.url, location.origin);
      if (url.origin !== location.origin || !url.pathname.startsWith('/recordings-local/')) throw new Error();
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      return showAudio(await response.blob(), meta.name, meta);
    } catch {
      describeError('audio-error', '这段本机录音已移除或无法读取。');
    }
  }

  function beginTimer() {
    const started = Date.now();
    timer.textContent = '录音中 ' + clock(0);
    ticker = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000;
      timer.textContent = '录音中 ' + clock(Math.min(elapsed, maximumSeconds));
      if (elapsed >= maximumSeconds) finishRecording();
    }, 200);
  }

  function endRecording() {
    clearInterval(ticker);
    recording = undefined;
    stopping = false;
    updateControls();
  }

  function finishRecording() {
    if (recording?.recorder?.state === 'recording') recording.recorder.stop();
    if (recording?.native && !stopping) {
      stopping = true;
      updateControls();
      native.stop().then(meta => {
        endRecording();
        return loadRecording(meta);
      }).catch(error => {
        endRecording();
        describeError('audio-error', error.message);
      });
    }
  }

  async function recordAudio() {
    if (recording) {
      finishRecording();
      return;
    }
    describeError('audio-error');
    requestingMic = true;
    updateControls();
    let stream;
    try {
      if (native) {
        await native.start();
        recording = { native: true };
        if (panel.hidden || panel.closest('section[hidden]')) finishRecording();
        else beginTimer();
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (panel.hidden || panel.closest('section[hidden]')) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const parts = [];
      recorder.addEventListener('dataavailable', event => { if (event.data.size) parts.push(event.data); });
      recorder.addEventListener('error', () => {
        describeError('audio-error', '录音中断，请检查麦克风后重试。');
      });
      recorder.addEventListener('stop', async () => {
        stream.getTracks().forEach(track => track.stop());
        endRecording();
        if (!parts.length) {
          describeError('audio-error', '没有录到音频，请重试。');
          return;
        }
        const format = recorder.mimeType || parts[0].type;
        const extension = format.includes('mp4') ? 'm4a' : format.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(parts, { type: format });
        if (!showAudio(blob, '弦外录音.' + extension)) return;
        try {
          const meta = await browserLibrary.save(blob, extension);
          if (file === blob) {
            fileMeta = meta;
            element('audio-name').textContent = meta.name;
            saveAudio.download = meta.name;
            if (!activeJob) describeError('transcription-state', '已保存到本机录音。');
          }
        } catch {
          if (file === blob && !activeJob) describeError('transcription-state', '这段录音仍在当前页，可以立即导出保存。');
        }
      });
      recorder.start();
      recording = { recorder, stream };
      beginTimer();
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      describeError('audio-error', native ? error.message : error.name === 'NotAllowedError'
        ? '麦克风授权未开启。可在浏览器的站点设置中允许，或直接导入音频。'
        : '无法开始录音。请检查麦克风是否可用，也可以直接导入音频。');
    } finally {
      requestingMic = false;
      updateControls();
    }
  }

  function renderRows() {
    transcript.hidden = !rows.length;
    lines.replaceChildren();
    rows.forEach((row, index) => {
      const item = document.createElement('div');
      item.className = 'transcript-line';
      const header = document.createElement('div');
      header.className = 'transcript-line-header';
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = row.selected;
      checkbox.addEventListener('change', () => { row.selected = checkbox.checked; refreshSelection(); });
      label.append(checkbox, '选中第 ' + (index + 1) + ' 句');
      header.append(label);
      if (Number.isFinite(row.start)) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'text-button timestamp';
        jump.textContent = '回听 ' + clock(row.start);
        jump.addEventListener('click', () => {
          player.currentTime = row.start;
          player.play().catch(() => {});
        });
        header.append(jump);
      }
      const editor = document.createElement('textarea');
      editor.rows = 2;
      editor.value = row.text;
      editor.setAttribute('aria-label', '校对第 ' + (index + 1) + ' 句');
      editor.addEventListener('input', () => { row.text = editor.value; refreshSelection(); });
      item.append(header, editor);
      lines.append(item);
    });
    refreshSelection();
  }

  function endJob() {
    activeJob = undefined;
    updateControls();
    describeError('transcription-state');
  }

  function abortJob() {
    if (!activeJob) return;
    worker?.terminate();
    worker = undefined;
    endJob();
  }

  function reportPhase(phase) {
    if (phase === 'loading') {
      describeError('transcription-state', native ? '正在加载安装包里的本机模型…' : '正在准备本机转写模型。首次约 100 MB，之后可复用缓存。');
    } else if (phase === 'transcribing') {
      describeError('transcription-state', '正在此设备转写。请保持页面打开。');
    }
  }

  function finishTranscript(data) {
    rows = rowsFrom(data);
    renderRows();
    endJob();
    if (rows.length && !panel.hidden && !panel.closest('section[hidden]')) element('transcript-heading').focus();
    if (!rows.length) describeError('audio-error', '没有识别到有效文字，可换一段清晰的音频重试。');
  }

  function createWorker() {
    const instance = new Worker('/asr-worker.js', { type: 'module' });
    instance.onmessage = ({ data }) => {
      if (worker !== instance || !activeJob) return;
      if (data.phase === 'done') finishTranscript(data);
      else if (data.phase === 'error') failWorker(instance);
      else reportPhase(data.phase);
    };
    instance.onerror = event => {
      console.error(event.message || 'Could not start the speech worker.');
      failWorker(instance);
    };
    return instance;
  }

  function failWorker(instance) {
    if (worker !== instance || !activeJob) return;
    abortJob();
    describeError('audio-error', '本机转写未完成。请确认模型可以下载、浏览器为较新版本，然后重试。');
  }

  async function recognizeOnPhone(samples, job) {
    localWork = true;
    try {
      reportPhase('loading');
      const { recognize } = await import('./asr-engine.mjs');
      if (activeJob !== job) return;
      const output = await recognize(samples, phase => { if (activeJob === job) reportPhase(phase); });
      if (activeJob === job) finishTranscript(output);
    } catch (error) {
      if (activeJob === job) {
        console.error(error);
        endJob();
        describeError('audio-error', '本机转写未完成。请更新 Android System WebView 或换一段较短的音频重试。');
      }
    } finally {
      localWork = false;
      updateControls();
    }
  }

  async function runTranscription() {
    if (!file || activeJob || localWork) return;
    const job = {};
    activeJob = job;
    rows = [];
    renderRows();
    updateControls();
    describeError('audio-error');
    describeError('transcription-state', '正在读取音频…');
    player.pause();
    try {
      const samples = await decodeAudio(file);
      if (activeJob !== job) return;
      if (native) await recognizeOnPhone(samples, job);
      else {
        worker ||= createWorker();
        worker.postMessage({ samples }, [samples.buffer]);
      }
    } catch (error) {
      if (activeJob !== job) return;
      endJob();
      describeError('audio-error', error.message);
    }
  }

  record.addEventListener('click', recordAudio);
  importButton.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    const input = picker.files[0];
    if (input && showAudio(input, input.name)) runTranscription();
    picker.value = '';
  });
  transcribe.addEventListener('click', runTranscription);
  cancel.addEventListener('click', () => {
    abortJob();
    describeError('transcription-state', '已取消转写，音频仍在当前页面。');
  });
  function clear() {
    if (recording || requestingMic) return false;
    abortJob();
    setFile();
    describeError('audio-error');
    return true;
  }
  clearButton.addEventListener('click', clear);
  toggle.addEventListener('click', () => {
    const selected = !rows.every(row => row.selected);
    rows.forEach(row => { row.selected = selected; });
    lines.querySelectorAll('[type="checkbox"]').forEach(checkbox => { checkbox.checked = selected; });
    refreshSelection();
  });
  window.addEventListener('pagehide', () => {
    recording?.stream?.getTracks().forEach(track => track.stop());
    finishRecording();
    abortJob();
  });
  if (native) {
    saveAudio.textContent = '导出原音频';
    saveAudio.addEventListener('click', async event => {
      event.preventDefault();
      if (!fileMeta) return;
      try { if (await native.export(fileMeta.id)) describeError('transcription-state', '原音频已导出。'); }
      catch (error) { describeError('audio-error', error.message); }
    });
    globalThis.XianwaiNativeRecording = meta => { endRecording(); loadRecording(meta); };
    globalThis.XianwaiNativeRecordingError = message => { endRecording(); describeError('audio-error', message); };
  }

  if (!canRecord) describeError('microphone-note', location.protocol === 'http:' && !window.isSecureContext
    ? '手机浏览器需要通过 HTTPS 使用麦克风。当前页面仍可导入音频。'
    : '当前浏览器未开放录音，可用系统录音后导入。');
  updateControls();
  return {
    selectedText, finishRecording, loadRecording, clear, runTranscription,
    openPicker: () => importButton.click(),
    pause: () => player.pause()
  };
}
