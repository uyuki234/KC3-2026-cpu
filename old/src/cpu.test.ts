import { describe, expect, it } from 'vitest';
import {
  binaryValue,
  branchInputs,
  cpuFiles,
  fillRom,
  inputAt,
  parseFrames,
  programs,
} from './cpu';
import { answerSources } from './lessons';
import { validateProject } from './storage';

describe('実行履歴とプロジェクトの境界', () => {
  it('過去で入力を変えたら、過去を残して未来の入力を捨てる', () => {
    const events = branchInputs(
      [
        { cycle: 0, value: 1 },
        { cycle: 8, value: 3 },
        { cycle: 20, value: 7 },
      ],
      8,
      15,
    );
    expect(inputAt(events, 7)).toBe(1);
    expect(inputAt(events, 8)).toBe(15);
    expect(inputAt(events, 25)).toBe(15);
  });
  it('未確定値を0に変換しない', () => {
    const frames = parseFrames(
      [
        'FRAME 0 xxxx xxxxxxxx 0000 0000 0000 0000 0 0000 00000',
        'FRAME 1 0000 00110000 0001 xxxx zzzz 0000 x 0000 xxxxx',
      ],
      1,
    );
    expect(frames[1].state.a).toBe('xxxx');
    expect(binaryValue(frames[1].state.b)).toBeNull();
  });
  it('途中終了した履歴や欠けたフレームを受け付けない', () => {
    expect(() =>
      parseFrames(['FRAME 0 xxxx xxxxxxxx 0000 0000 0000 0000 0 0000 00000'], 3),
    ).toThrow('途中');
    expect(() => parseFrames(['FRAME 0 xxxx'], 0)).toThrow('読み取れません');
  });
  it('実行上限やROMの範囲外を拒否する', () => {
    expect(() => cpuFiles(answerSources, fillRom(programs[0].bytes), [], 4097)).toThrow('4096');
    expect(() => cpuFiles(answerSources, fillRom([256]), [], 1)).toThrow('ROM');
  });
  it('壊れたインポートを拒否し、Verilogはそのまま保持する', () => {
    const valid = {
      version: 1,
      sources: answerSources,
      passed: {},
      rom: fillRom(programs[0].bytes),
    };
    expect(validateProject(valid).sources).toEqual(answerSources);
    expect(() => validateProject({ ...valid, rom: [0] })).toThrow();
    expect(() => validateProject({ ...valid, sources: { ...answerSources, pc: 4 } })).toThrow();
    expect(() => validateProject({ ...valid, passed: 'wrong' })).toThrow();
  });
});
