import {
  compileCpu,
  compileRom,
  instructions,
  resetState,
  testInstruction,
  type State,
} from './td4';
import { SvError } from './sv';
let cpu: ReturnType<typeof compileCpu> | undefined,
  rom: number[] = [],
  current: State = resetState();
let timer: ReturnType<typeof setInterval> | undefined,
  cycle = 0,
  input = 0,
  speed = 400;
const stop = () => {
  clearInterval(timer);
  timer = undefined;
};
function fail(e: unknown, target = 'cpu') {
  stop();
  self.postMessage({
    type: 'error',
    message: e instanceof Error ? e.message : String(e),
    line: e instanceof SvError ? e.line : 1,
    kind: e instanceof SvError ? e.kind : 'runtime',
    target,
  });
}
function start() {
  stop();
  timer = setInterval(() => {
    try {
      const before = current,
        byte = rom[current.ip];
      current = cpu!(current, byte, input);
      self.postMessage({
        type: 'frame',
        frame: { cycle: ++cycle, before, after: current, byte, input },
      });
    } catch (e) {
      fail(e);
    }
  }, speed);
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'test') {
      const evaluator = compileCpu(data.source);
      const ops: number[] =
        data.op === undefined ? instructions.map((i) => i.op).concat([8, 10, 12, 13]) : [data.op];
      for (const op of ops)
        self.postMessage({ type: 'test-result', result: testInstruction(evaluator, op) });
      self.postMessage({ type: 'test-done' });
    } else if (data.type === 'prepare') {
      stop();
      cpu = compileCpu(data.source);
      try {
        rom = compileRom(data.rom);
      } catch (e) {
        fail(e, 'rom');
        return;
      }
      current = resetState();
      cycle = 0;
      input = data.input;
      speed = data.speed;
      self.postMessage({ type: 'ready', rom });
      if (data.run) start();
    } else if (data.type === 'run') {
      if (!cpu) throw new Error('実行するコードを準備してください。');
      start();
      self.postMessage({ type: 'running' });
    } else if (data.type === 'stop') {
      stop();
      self.postMessage({ type: 'stopped' });
    } else if (data.type === 'input') {
      input = data.value;
    } else if (data.type === 'speed') {
      speed = data.value;
      if (timer) start();
    }
  } catch (e) {
    fail(e);
  }
};
