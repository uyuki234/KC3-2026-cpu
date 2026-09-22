import { initialSources } from './lessons';
import { fillRom, programs } from './cpu';
import type { SavedProject } from './types';

export const storageKey = 'td4-lab-project-v1';
export function validateProject(value: unknown): SavedProject {
  if (!value || typeof value !== 'object') throw new Error('プロジェクト形式が正しくありません。');
  const data = value as SavedProject;
  if (
    data.version !== 1 ||
    !data.sources ||
    typeof data.sources !== 'object' ||
    !data.passed ||
    typeof data.passed !== 'object' ||
    Array.isArray(data.passed) ||
    !Array.isArray(data.rom) ||
    data.rom.length !== 16 ||
    !data.rom.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  )
    throw new Error('対応していないプロジェクト形式です。');
  for (const id of ['adder', 'register', 'pc'] as const) {
    if (typeof data.sources[id] !== 'string' || data.sources[id].length > 20000)
      throw new Error('コードは各ファイル20,000文字以内で保存してください。');
    if (data.passed[id] !== undefined && typeof data.passed[id] !== 'string')
      throw new Error('進捗データが正しくありません。');
  }
  return {
    version: 1,
    sources: { ...data.sources },
    passed: { ...data.passed },
    rom: [...data.rom],
  };
}
export function loadProject(): { project: SavedProject; warning?: string } {
  const fallback: SavedProject = {
    version: 1,
    sources: { ...initialSources },
    passed: {},
    rom: fillRom(programs[0].bytes),
  };
  try {
    const raw = localStorage.getItem(storageKey);
    return { project: raw ? validateProject(JSON.parse(raw)) : fallback };
  } catch {
    return {
      project: fallback,
      warning: '保存データを読み込めませんでした。初期コードで開始します。',
    };
  }
}
