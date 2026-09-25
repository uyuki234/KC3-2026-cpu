import { expectedState, stateKeys, type State } from './td4';

// This estimate applies only to the supplied count-up/blink program.
const timerProgram = [0x60, 0x90, 0x3d, 0x01, 0xe3, 0x51, 0xe1, 0xb0, 0xbf, 0xf7];
export const isTimerRom = (rom: number[]) =>
  rom.length === 16 && timerProgram.every((byte, addr) => rom[addr] === byte);

// IN B + ten instructions per increment + the first OUT 0 in the blink loop.
export const initialTimerSteps = (input: number) => 2 + (16 - input) * 10;
export const timerSeconds = (steps: number, speed: number) => Math.ceil((steps * speed) / 1000);
export type Countdown =
  | { kind: 'counting' | 'finished'; steps: number; displaySteps: number }
  | { kind: 'unavailable'; reason: 'rom' | 'cpu' };

export function createCountdown(rom: number[]) {
  let remaining: number | undefined;
  let displaySteps: number | undefined;
  let unavailable: 'rom' | 'cpu' | undefined = isTimerRom(rom) ? undefined : 'rom';
  return (before: State, after: State, byte: number, input: number): Countdown => {
    if (unavailable) return { kind: 'unavailable', reason: unavailable };
    const expected = expectedState(before, byte, input);
    if (!stateKeys.every((key) => after[key] === expected[key])) {
      unavailable = 'cpu';
      return { kind: 'unavailable', reason: unavailable };
    }
    // Capture the input when IN B actually executes, not when the worker is prepared.
    displaySteps ??= initialTimerSteps(input);
    remaining = Math.max(0, (remaining ?? initialTimerSteps(input)) - 1);
    // Keep the displayed estimate still between LED changes; finish at the first blink.
    if (before.out !== after.out || remaining === 0) displaySteps = remaining;
    return { kind: remaining === 0 ? 'finished' : 'counting', steps: remaining, displaySteps };
  };
}
