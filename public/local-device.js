let connection;

function database() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('浏览器未开放本机存储。'));
      const opening = indexedDB.open('xianwai-device', 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore('settings');
        opening.result.createObjectStore('recordings', { keyPath: 'id' });
      };
      opening.onsuccess = () => {
        const db = opening.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => reject(new Error('本机存储正在被另一个弦外页面占用。'));
    }).catch(error => { connection = undefined; throw error; });
  }
  return connection;
}

async function transact(name, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const operation = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(operation.result);
    tx.onabort = () => reject(tx.error || operation.error || new Error('无法保存本机数据。'));
  });
}

const setting = key => transact('settings', 'readonly', store => store.get(key));

async function encryptionKey() {
  const saved = await setting('encryption-key');
  if (saved) return saved;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  try {
    await transact('settings', 'readwrite', store => store.add(key, 'encryption-key'));
    return key;
  } catch (error) {
    const concurrent = await setting('encryption-key');
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function loadWebModel() {
  const data = await setting('provider');
  if (!data) return null;
  const { iv, ciphertext, ...config } = data;
  if (!ciphertext) return { ...config, key: '' };
  const key = await setting('encryption-key');
  if (!key) throw new Error('无法读取已保存的密钥，请重新填写。');
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return { ...config, key: new TextDecoder().decode(clear) };
}

export async function saveWebModel({ key, ...config }) {
  const data = { ...config };
  if (key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    data.iv = iv;
    data.ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(key));
  }
  await transact('settings', 'readwrite', store => store.put(data, 'provider'));
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const getRecording = id => transact('recordings', 'readonly', store => store.get(id));

export const browserRecordings = {
  async save(blob, extension) {
    const time = Date.now();
    const stamp = new Date(time).toLocaleString('sv-SE').replace(/[: ]/gu, '-');
    const id = time.toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    const record = { id, time, name: '弦外录音-' + stamp + '.' + extension, size: blob.size };
    await transact('recordings', 'readwrite', store => store.add({ ...record, blob }));
    return record;
  },
  async listRecordings() {
    const records = await transact('recordings', 'readonly', store => store.getAll());
    return records.map(({ blob, ...info }) => info).sort((a, b) => b.time - a.time);
  },
  async open(id) {
    const record = await getRecording(id);
    if (!record) throw new Error('这段录音已移除。');
    return record.blob;
  },
  async export(id) {
    const record = await getRecording(id);
    if (!record) throw new Error('这段录音已移除。');
    downloadBlob(record.blob, record.name);
    return true;
  },
  deleteRecording: id => transact('recordings', 'readwrite', store => store.delete(id))
};
