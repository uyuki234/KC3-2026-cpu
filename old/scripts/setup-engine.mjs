import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, 'spikes/icarus-browser/vendor-manifest.json'), 'utf8'),
);
const target = path.join(root, 'public/engine');
await mkdir(target, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const entry of manifest.files) {
  const dest = path.join(target, entry.name);
  let bytes;
  try {
    bytes = await readFile(dest);
  } catch {
    /* First setup. */
  }
  if (!bytes || hash(bytes) !== entry.sha256) {
    try {
      bytes = await readFile(path.join(root, 'spikes/icarus-browser/vendor', entry.name));
    } catch {
      bytes = undefined;
    }
    if (!bytes || hash(bytes) !== entry.sha256) {
      const response = await fetch(
        `https://raw.githubusercontent.com/senolgulgonul/verisim/${manifest.revision}/${entry.name}`,
      );
      if (!response.ok)
        throw new Error(`Engine download failed: ${entry.name} (${response.status})`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (hash(bytes) !== entry.sha256 || bytes.length !== entry.bytes)
      throw new Error(`Engine checksum mismatch: ${entry.name}`);
    await writeFile(dest, bytes);
  }
}
for (const name of ['LICENSE', 'README.md']) {
  const dest = path.join(target, name);
  try {
    await readFile(dest);
    continue;
  } catch {
    /* Download attribution once. */
  }
  try {
    await copyFile(path.join(root, 'spikes/icarus-browser/vendor', name), dest);
  } catch {
    const response = await fetch(
      `https://raw.githubusercontent.com/senolgulgonul/verisim/${manifest.revision}/${name}`,
    );
    if (!response.ok) throw new Error(`Attribution download failed: ${name}`);
    await writeFile(dest, await response.text());
  }
}
await writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));
// Keep the reference material available on the same static site.
await mkdir(path.join(root, 'public/materials'), { recursive: true });
for (const name of ['lecture-slides.md', 'lecture-appendix.md']) {
  await copyFile(path.join(root, 'docs', name), path.join(root, 'public/materials', name));
}
console.log('Icarus WASM: 6 files verified. Lecture materials copied.');
