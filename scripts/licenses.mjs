// Keep upstream copyright notices with the published browser bundle.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const seen = new Set();
const notices = ['Third-party software notices\nGenerated from installed runtime dependencies.'];
function visit(name, from = root) {
  let dir = from,
    pkg;
  while (true) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      pkg = candidate;
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Cannot locate ${name}`);
    dir = parent;
  }
  if (seen.has(pkg)) return;
  seen.add(pkg);
  const metadata = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  const license = readdirSync(pkg).find((file) => /^licen[sc]e(?:\..*)?$/i.test(file));
  if (!license) throw new Error(`Missing license text: ${metadata.name}`);
  notices.push(
    `${metadata.name} ${metadata.version}\n${readFileSync(join(pkg, license), 'utf8').trim()}`,
  );
  for (const dep of Object.keys(metadata.dependencies ?? {})) visit(dep, pkg);
}
const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const name of Object.keys(project.dependencies)) visit(name);
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(
  join(root, 'public/third-party-notices.txt'),
  notices.join('\n\n' + '='.repeat(72) + '\n\n') + '\n',
);
