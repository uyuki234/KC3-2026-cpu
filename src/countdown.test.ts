import { describe, expect, it } from 'vitest';
import { answerCode, compileCpu, compileRom, initialCode, initialRom, resetState } from './td4';
import { createCountdown, initialTimerSteps, isTimerRom, timerSeconds } from './countdown';

describe('配布ROMの残り時間', () => {
  const rom = compileRom(initialRom);
  const cpu = compileCpu(answerCode);
  it.each(Array.from({ length: 16 }, (_, i) => i))(
    '入力 %i の終了と最初の消灯が一致する',
    (input) => {
      const advance = createCountdown(rom);
      let state = resetState();
      const total = initialTimerSteps(input);
      for (let cycle = 1; cycle <= total + 6; cycle++) {
        const before = state;
        const byte = rom[state.ip];
        // 入力は最初のINだけで取り込まれる。
        const currentInput = cycle === 1 ? input : 15 - input;
        state = cpu(before, byte, currentInput);
        expect(advance(before, state, byte, currentInput)).toEqual({
          kind: cycle < total ? 'counting' : 'finished',
          steps: Math.max(0, total - cycle),
        });
        if (cycle === total - 1) expect(state.out).toBe(15);
        if (cycle === total) {
          expect(byte).toBe(0xb0);
          expect(state.out).toBe(0);
        }
      }
    },
  );
  it('実行速度を反映し、残り1命令以上なら0秒にしない', () => {
    expect(timerSeconds(initialTimerSteps(0), 1000)).toBe(162);
    expect(timerSeconds(initialTimerSteps(15), 1000)).toBe(12);
    expect(timerSeconds(12, 400)).toBe(5);
    expect(timerSeconds(1, 100)).toBe(1);
    expect(timerSeconds(0, 100)).toBe(0);
  });
  it('未完成のCPUでは不正確な秒数を表示しない', () => {
    const advance = createCountdown(rom);
    const state = resetState();
    const after = compileCpu(initialCode)(state, rom[0], 15);
    expect(advance(state, after, rom[0], 15)).toEqual({ kind: 'unavailable', reason: 'cpu' });
    expect(advance(state, cpu(state, rom[0], 15), rom[0], 15)).toEqual({
      kind: 'unavailable',
      reason: 'cpu',
    });
  });
  it('異なるROMの時間を推測しない', () => {
    const changed = [...rom];
    changed[2] = 0x30;
    expect(isTimerRom(changed)).toBe(false);
    expect(createCountdown(changed)(resetState(), resetState(), 0, 0)).toEqual({
      kind: 'unavailable',
      reason: 'rom',
    });
  });
});
