import { cp, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareVoiceAssets } from '../voice-assets.mjs';

const output = resolve(process.argv[2]);
const project = fileURLToPath(new URL('../', import.meta.url));
await cp(join(project, 'public'), join(output, 'web'), { recursive: true });
await cp(join(project, 'licenses'), join(output, 'licenses'), { recursive: true });
for (const asset of await prepareVoiceAssets()) {
  const target = join(output, 'web', 'voice-model', 'whisper-base', asset.name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(asset.path, target);
}
