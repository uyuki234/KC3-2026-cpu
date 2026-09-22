import { initialCode, initialRom } from './td4';
export const storageKey = 'kc3-td4-instructions-v1';
export interface Project {
  version: 1;
  cpu: string;
  rom: string;
}
export function validateProject(input: unknown): Project {
  const p = input as Project;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.cpu !== 'string' ||
    typeof p.rom !== 'string' ||
    p.cpu.length > 20000 ||
    p.rom.length > 20000
  )
    throw new Error('この教材のプロジェクトJSONを選んでください（各コード20,000文字以内）。');
  return { version: 1, cpu: p.cpu, rom: p.rom };
}
export function loadProject(): { project: Project; warning: string } {
  const fresh: Project = { version: 1, cpu: initialCode, rom: initialRom };
  try {
    const raw = localStorage.getItem(storageKey);
    return { project: raw ? validateProject(JSON.parse(raw)) : fresh, warning: '' };
  } catch {
    return {
      project: fresh,
      warning: '保存したコードを読み込めませんでした。配布時のコードで表示しています。',
    };
  }
}
