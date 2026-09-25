import originalCpuFile from '../code/td4/cpu.sv?raw';
import originalRom from '../code/td4/rom.sv?raw';
import { caseBodyRange, compile, SvError, type Signals } from './sv';

export type State = { a: number; b: number; cf: number; ip: number; out: number };
export const stateKeys = ['a', 'b', 'cf', 'ip', 'out'] as const;
export const resetState = (): State => ({ a: 0, b: 0, cf: 0, ip: 0, out: 0 });
export const binary = (n: number, width = 4) => n.toString(2).padStart(width, '0');
export const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
export const instructions = [
  {
    op: 0,
    name: 'ADD A, Im',
    description: 'Aに即値を足す。CFに桁上がりを入れる。',
    difficult: true,
  },
  {
    op: 5,
    name: 'ADD B, Im',
    description: 'Bに即値を足す。CFに桁上がりを入れる。',
    difficult: true,
  },
  { op: 3, name: 'MOV A, Im', description: 'Aに即値を入れる。' },
  { op: 7, name: 'MOV B, Im', description: 'Bに即値を入れる。', reference: true },
  { op: 1, name: 'MOV A, B', description: 'AにBの値を入れる。', reference: true },
  { op: 4, name: 'MOV B, A', description: 'BにAの値を入れる。', reference: true },
  { op: 15, name: 'JMP Im', description: '即値の番地へジャンプする。', difficult: true },
  {
    op: 14,
    name: 'JNC Im',
    description: '現在のCFが0ならジャンプ。1なら次の番地へ。',
    difficult: true,
  },
  { op: 2, name: 'IN A', description: 'Aにスイッチの値を入れる。', reference: true },
  { op: 6, name: 'IN B', description: 'Bにスイッチの値を入れる。' },
  { op: 9, name: 'OUT B', description: 'OUTにBの値を入れる。' },
  { op: 11, name: 'OUT Im', description: 'OUTに即値を入れる。' },
];
export function instructionName(byte: number) {
  return (instructions.find((i) => i.op === byte >> 4)?.name ?? '未定義').replace(
    'Im',
    String(byte & 15),
  );
}
const originalCpu = originalCpuFile.replaceAll('\r\n', '\n');
const combStart = originalCpu.indexOf('    always_comb');
export const answerCode = originalCpu
  .slice(combStart, originalCpu.lastIndexOf('endmodule'))
  .trim()
  .replace(/^    /gm, '');
function createInitialCode(compact: boolean) {
  return answerCode.replace(
    /^(\s*4'b([01]{4}):)\s*(.*?)\s*\/\/\s*(.*)$/gm,
    (line, prefix, op, _expr, label) => {
      if ([7, 1, 4, 2].includes(parseInt(op, 2))) return line + '（参考：記入済み）';
      return compact
        ? `${prefix} ; // ${label}`
        : `${prefix} begin // ${label}\n            // TODO: 次の値を決めよう\n        end`;
    },
  );
}
export const initialCode = createInitialCode(true);
export const legacyInitialCode = createInitialCode(false);
export const initialRom = originalRom.replaceAll('\r\n', '\n');
const signals: Signals = {
  a: { width: 4 },
  b: { width: 4 },
  cf: { width: 1 },
  ip: { width: 4 },
  out: { width: 4 },
  opcode: { width: 4 },
  imm: { width: 4 },
  switch: { width: 4 },
  next_a: { width: 4, writable: true },
  next_b: { width: 4, writable: true },
  next_cf: { width: 1, writable: true },
  next_ip: { width: 4, writable: true },
  next_out: { width: 4, writable: true },
};
export function insertAnswer(source: string, op: number) {
  const answer = caseBodyRange(answerCode, signals, 'opcode', op);
  const target = caseBodyRange(source, signals, 'opcode', op);
  return {
    source:
      source.slice(0, target.from) +
      answerCode.slice(answer.from, answer.to) +
      source.slice(target.to),
    line: source.slice(0, target.from).split('\n').length,
  };
}
export function compileCpu(source: string) {
  const evaluator = compile(source, signals);
  return (state: State, instruction: number, input: number): State => {
    const next = evaluator({
      ...state,
      opcode: instruction >> 4,
      imm: instruction & 15,
      switch: input,
    });
    return {
      a: next.next_a,
      b: next.next_b,
      cf: next.next_cf,
      ip: next.next_ip,
      out: next.next_out,
    };
  };
}
export function compileRom(source: string): number[] {
  if (source.length > 20000) throw new SvError('ROMは20,000文字以内にしてください。');
  // Validate the fixed module wrapper, so extra processes aren't silently ignored.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
  const wrapper = stripped.match(
    /^\s*module\s+rom\s*\(\s*input\s+(?:logic|wire)\s*\[\s*3\s*:\s*0\s*\]\s*addr\s*,\s*output\s+(?:logic|reg)\s*\[\s*7\s*:\s*0\s*\]\s*data\s*\)\s*;([\s\S]*)endmodule\s*$/,
  );
  let body = stripped;
  if (/^\s*module\b/.test(stripped)) {
    if (!wrapper)
      throw new SvError(
        'ROMのポートは配布例のaddr[3:0]とdata[7:0]を使ってください。追加のモジュールや処理には対応していません。',
        1,
        'unsupported',
      );
    const offset = stripped.indexOf(';') + 1;
    body = '\n'.repeat(stripped.slice(0, offset).split('\n').length - 1) + wrapper[1];
  }
  const evaluator = compile(body, { addr: { width: 4 }, data: { width: 8, writable: true } });
  return Array.from({ length: 16 }, (_, addr) => evaluator({ addr }).data);
}

// Independent behavioral oracle: never use learner output to construct expectations.
export function expectedState(s: State, byte: number, input: number): State {
  const n = { ...s, cf: 0, ip: (s.ip + 1) % 16 },
    imm = byte % 16;
  switch (byte >> 4) {
    case 0: {
      const sum = s.a + imm;
      n.a = sum % 16;
      n.cf = Math.floor(sum / 16);
      break;
    }
    case 5: {
      const sum = s.b + imm;
      n.b = sum % 16;
      n.cf = Math.floor(sum / 16);
      break;
    }
    case 3:
      n.a = imm;
      break;
    case 7:
      n.b = imm;
      break;
    case 1:
      n.a = s.b;
      break;
    case 4:
      n.b = s.a;
      break;
    case 2:
      n.a = input;
      break;
    case 6:
      n.b = input;
      break;
    case 9:
      n.out = s.b;
      break;
    case 11:
      n.out = imm;
      break;
    case 15:
      n.ip = imm;
      break;
    case 14:
      if (s.cf === 0) n.ip = imm;
      break;
  }
  return n;
}
export type Failure = {
  before: State;
  byte: number;
  input: number;
  expected: State;
  actual?: State;
  error?: string;
};
export type TestResult = { op: number; passed: number; total: number; failures: Failure[] };
export function testInstruction(cpu: ReturnType<typeof compileCpu>, op: number): TestResult {
  const result: TestResult = { op, passed: 0, total: 0, failures: [] };
  // Cover every register/immediate pair, both carry states, regular and wraparound PC.
  // Input and OUT vary as well; every next_* is checked, including preserved values.
  for (let x = 0; x < 16; x++)
    for (let imm = 0; imm < 16; imm++)
      for (const cf of [0, 1])
        for (const ip of [6, 15]) {
          const before = { a: x, b: (x + 5) % 16, cf, ip, out: (x + imm + 9) % 16 },
            byte = (op << 4) | imm,
            input = (x + imm + 3) % 16;
          const expected = expectedState(before, byte, input);
          result.total++;
          let actual: State | undefined, error: string | undefined;
          try {
            actual = cpu(before, byte, input);
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }
          if (actual && stateKeys.every((k) => actual![k] === expected[k])) result.passed++;
          else if (result.failures.length < 3)
            result.failures.push({ before, byte, input, expected, actual, error });
        }
  return result;
}
export interface Frame {
  cycle: number;
  before: State;
  after: State;
  byte: number;
  input: number;
}
