import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const address = process.argv[2];
if (isIP(address) !== 4) throw new Error('Provide the computer’s Wi-Fi IPv4 address.');
const base = resolve(process.env.TLS_DIR || fileURLToPath(new URL('./.runtime/tls', import.meta.url)));

function opensslCommand() {
  if (process.env.OPENSSL) return process.env.OPENSSL;
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore', windowsHide: true });
    return 'openssl';
  } catch {
    if (process.platform !== 'win32') throw new Error('OpenSSL is required to prepare the phone HTTPS certificate.');
    const paths = execFileSync('where.exe', ['git'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
    const supplied = paths.map(git => resolve(dirname(git), '../usr/bin/openssl.exe')).find(existsSync);
    if (!supplied) throw new Error('Use Git for Windows or set OPENSSL to the path of openssl.exe.');
    return supplied;
  }
}

const openssl = opensslCommand();
const command = (directory, ...args) => execFileSync(openssl, args, { cwd: directory, windowsHide: true, stdio: 'pipe' });
const live = join(base, address);
if (['root.pem', 'root.cer', 'server.pem', 'server.key'].every(name => existsSync(join(live, name)))) {
  try {
    command(live, 'x509', '-in', 'server.pem', '-checkend', '86400', '-noout');
    process.stdout.write(live);
    process.exit(0);
  } catch {
    renameSync(live, join(base, address + '-expired-' + Date.now()));
  }
}

mkdirSync(base, { recursive: true });
const staging = mkdtempSync(join(base, address + '-new-'));
try {
  command(staging, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30',
    '-keyout', 'root.key', '-out', 'root.pem', '-subj', '/CN=Xianwai Local Phone Preview ' + address,
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  command(staging, 'x509', '-in', 'root.pem', '-outform', 'DER', '-out', 'root.cer');
  command(staging, 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key',
    '-out', 'server.csr', '-subj', '/CN=' + address);
  writeFileSync(join(staging, 'server.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:' + address + '\n');
  command(staging, 'x509', '-req', '-sha256', '-days', '30', '-in', 'server.csr', '-CA', 'root.pem',
    '-CAkey', 'root.key', '-CAcreateserial', '-extfile', 'server.ext', '-out', 'server.pem');
} finally {
  for (const file of ['root.key', 'root.srl', 'server.csr', 'server.ext']) {
    const path = join(staging, file);
    if (existsSync(path)) unlinkSync(path);
  }
}
renameSync(staging, live);
process.stdout.write(live);
