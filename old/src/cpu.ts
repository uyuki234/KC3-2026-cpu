import type { CpuState, Frame, InputEvent, LessonId, SourceFile, Sources, TestRow } from './types';

export const instructions = [
  { opcode: 0x0, label: 'ADD A,', immediate: true },
  { opcode: 0x1, label: 'MOV A, B', immediate: false },
  { opcode: 0x2, label: 'IN A', immediate: false },
  { opcode: 0x3, label: 'MOV A,', immediate: true },
  { opcode: 0x4, label: 'MOV B, A', immediate: false },
  { opcode: 0x5, label: 'ADD B,', immediate: true },
  { opcode: 0x6, label: 'IN B', immediate: false },
  { opcode: 0x7, label: 'MOV B,', immediate: true },
  { opcode: 0x9, label: 'OUT B', immediate: false },
  { opcode: 0xb, label: 'OUT', immediate: true },
  { opcode: 0xe, label: 'JNC', immediate: true },
  { opcode: 0xf, label: 'JMP', immediate: true },
];
export const programs = [
  {
    id: 'counter',
    name: 'LEDカウンタ',
    description: 'Bに1を足して出力。3つの命令を繰り返します。',
    bytes: [0x51, 0x90, 0xf0],
  },
  {
    id: 'branch',
    name: 'キャリーと分岐',
    description: '14から数え、桁上がりしたらLEDをすべて点灯します。',
    bytes: [0x3e, 0x01, 0xe1, 0xbf, 0xf4],
  },
  {
    id: 'input',
    name: '入力をLEDへ',
    description: '入力スイッチの値をBに取り込み、LEDへ出します。',
    bytes: [0x60, 0x90, 0xf0],
  },
];
export const fillRom = (bytes: number[]) => Array.from({ length: 16 }, (_, i) => bytes[i] ?? 0x30);
export function binaryValue(bits: string): number | null {
  return /^[01]+$/.test(bits) ? parseInt(bits, 2) : null;
}
export const bits = (value: number, width = 4) => value.toString(2).padStart(width, '0');
export const hex = (value: number, width = 1) =>
  value.toString(16).toUpperCase().padStart(width, '0');
export function instructionText(byte: number) {
  const op = instructions.find((i) => i.opcode === byte >> 4);
  return op ? op.label + (op.immediate ? ` ${byte & 15}` : '') : '未定義の命令';
}
export function inputAt(events: InputEvent[], cycle: number) {
  return events.filter((e) => e.cycle <= cycle).at(-1)?.value ?? 0;
}
export function branchInputs(events: InputEvent[], cycle: number, value: number): InputEvent[] {
  return [...events.filter((e) => e.cycle < cycle), { cycle, value }];
}
export const emptyState: CpuState = { a: '0000', b: '0000', pc: '0000', out: '0000', carry: '0' };

const filenames: Record<LessonId, string> = {
  adder: 'adder4.v',
  register: 'register4.v',
  pc: 'pc4.v',
};
export const sourceFiles = (sources: Sources): SourceFile[] =>
  (Object.keys(filenames) as LessonId[]).map((id) => ({
    name: filenames[id],
    source: sources[id],
  }));
export const cpuSource = `module td4 (
  input wire clk, reset_n,
  input wire [7:0] instruction,
  input wire [3:0] in_port,
  output wire [3:0] a, b, pc, out_port,
  output reg carry,
  output wire [4:0] sum
);
  wire [1:0] select_input = instruction[7:6] == 2'b11 ? 2'b11 : instruction[5:4];
  wire [3:0] operand = select_input == 0 ? a : select_input == 1 ? b : select_input == 2 ? in_port : 4'b0000;
  wire [3:0] result;
  wire next_carry;
  wire jump = instruction[7:6] == 2'b11 && (instruction[4] || !carry);
  adder4 adder(.x(operand), .y(instruction[3:0]), .result(result), .carry(next_carry));
  assign sum = {next_carry, result};
  register4 ra(.clk(clk), .reset_n(reset_n), .load(instruction[7:6] == 0), .d(result), .q(a));
  register4 rb(.clk(clk), .reset_n(reset_n), .load(instruction[7:6] == 1), .d(result), .q(b));
  register4 ro(.clk(clk), .reset_n(reset_n), .load(instruction[7:6] == 2), .d(result), .q(out_port));
  pc4 counter(.clk(clk), .reset_n(reset_n), .jump(jump), .target(result), .pc(pc));
  always @(posedge clk or negedge reset_n) begin
    if (!reset_n) carry <= 1'b0;
    else carry <= next_carry;
  end
endmodule`;

export function cpuFiles(
  sources: Sources,
  rom: number[],
  events: InputEvent[],
  cycles: number,
): SourceFile[] {
  if (rom.length !== 16 || !rom.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new Error('ROMは8ビットの命令16個で指定してください。');
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 4096)
    throw new Error('実行数は1〜4096命令です。');
  if (
    !events.every(
      (e) =>
        Number.isInteger(e.cycle) &&
        e.cycle >= 0 &&
        e.cycle < 4096 &&
        Number.isInteger(e.value) &&
        e.value >= 0 &&
        e.value <= 15,
    )
  )
    throw new Error('入力履歴が正しくありません。');
  return [
    ...sourceFiles(sources),
    { name: 'td4.v', source: cpuSource },
    {
      name: 'tb.v',
      source: `module tb;
reg clk=0, reset_n=1;
reg [3:0] in_port=0;
reg [7:0] rom[0:15];
wire [3:0] a,b,pc,out_port;
wire carry; wire [4:0] sum;
wire [7:0] instruction=rom[pc];
reg [3:0] executed_pc; reg [7:0] executed_instruction; reg [4:0] executed_sum;
integer i;
td4 dut(clk,reset_n,instruction,in_port,a,b,pc,out_port,carry,sum);
initial begin
${rom.map((byte, i) => `rom[${i}]=8'h${hex(byte, 2)};`).join('\n')}
#1;reset_n=0;#1;reset_n=1;#1;
$display("FRAME 0 xxxx xxxxxxxx %b %b %b %b %b 0000 00000",pc,a,b,out_port,carry);
for(i=0;i<${cycles};i=i+1) begin
${events.map((e) => `if(i==${e.cycle}) in_port=4'd${e.value};`).join('\n')}
#1;executed_pc=pc;executed_instruction=instruction;executed_sum=sum;
clk=1;#1;
$display("FRAME %0d %b %b %b %b %b %b %b %b %b",i+1,executed_pc,executed_instruction,pc,a,b,out_port,carry,in_port,executed_sum);
clk=0;#1;
end
$finish;
end
endmodule`,
    },
  ];
}

export function parseFrames(lines: string[], expectedCycles: number): Frame[] {
  const frames = lines
    .filter((line) => line.startsWith('FRAME '))
    .map((line) => {
      const p = line.trim().split(/\s+/);
      if (p.length !== 11 || !/^\d+$/.test(p[1]) || !p.slice(2).every((s) => /^[01xz]+$/i.test(s)))
        throw new Error('実行履歴を読み取れませんでした。');
      return {
        cycle: Number(p[1]),
        executedPc: p[2],
        instruction: p[3],
        state: { pc: p[4], a: p[5], b: p[6], out: p[7], carry: p[8] },
        input: p[9],
        sum: p[10],
      };
    });
  if (frames.length !== expectedCycles + 1 || frames.some((f, i) => f.cycle !== i))
    throw new Error(
      '実行が途中で終了しました。コード内の終了処理やテストベンチとの接続を確認してください。',
    );
  return frames;
}

export function lessonFiles(id: LessonId, source: string): SourceFile[] {
  let testbench: string;
  if (id === 'adder')
    testbench = `module tb;
reg [3:0] x,y;wire [3:0] result;wire carry;reg [4:0] expected;integer i,j;
adder4 dut(x,y,result,carry);
initial begin
for(i=0;i<16;i=i+1) for(j=0;j<16;j=j+1) begin
x=i;y=j;expected=i+j;#1;
$display("CHECK|加算と桁上がり|%0d + %0d|%b|%b",i,j,expected,{carry,result});
end $finish;end endmodule`;
  else if (id === 'register')
    testbench = `module tb;
reg clk=0,reset_n=1,load=0;reg [3:0] d=0;wire [3:0] q;integer i;reg [3:0] expected;
register4 dut(clk,reset_n,load,d,q);
initial begin
#1;reset_n=0;#1;$display("CHECK|リセット|reset_n=0|0000|%b",q);reset_n=1;
for(i=0;i<16;i=i+1) begin
d=i;load=1;#1;clk=1;#1;expected=i;
$display("CHECK|値を保存|d=%0d, load=1, 立ち上がり|%b|%b",i,expected,q);
clk=0;#1;d=15-i;#1;
$display("CHECK|クロック間の保持|入力だけ変更|%b|%b",expected,q);
load=0;#1;clk=1;#1;
$display("CHECK|書き込み許可なし|load=0, 立ち上がり|%b|%b",expected,q);clk=0;#1;
end
reset_n=0;#1;$display("CHECK|再リセット|クロックなし|0000|%b",q);
$finish;end endmodule`;
  else
    testbench = `module tb;
reg clk=0,reset_n=1,jump=0;reg [3:0] target=0;wire [3:0] pc;integer i;reg [3:0] expected;
pc4 dut(clk,reset_n,jump,target,pc);
initial begin
#1;reset_n=0;#1;$display("CHECK|リセット|reset_n=0|0000|%b",pc);reset_n=1;
for(i=0;i<16;i=i+1) begin
jump=1;target=i;expected=i;#1;clk=1;#1;
$display("CHECK|ジャンプ|target=%0d|%b|%b",i,expected,pc);clk=0;#1;
jump=0;expected=i+1;#1;clk=1;#1;
$display("CHECK|通常進行・周回|PC=%0d → 次へ|%b|%b",i,expected,pc);clk=0;#1;
end
reset_n=0;#1;$display("CHECK|再リセット|クロックなし|0000|%b",pc);
$finish;end endmodule`;
  return [
    { name: filenames[id], source },
    { name: 'tb.v', source: testbench },
  ];
}
export function parseTests(lines: string[], id: LessonId): TestRow[] {
  const rows = lines
    .filter((line) => line.startsWith('CHECK|'))
    .map((line) => {
      const [, name, input, expected, actual] = line.split('|');
      if (!actual || !expected) throw new Error('検証結果を読み取れませんでした。');
      return { name, input, expected, actual, pass: /^[01]+$/.test(actual) && actual === expected };
    });
  const count = { adder: 256, register: 50, pc: 34 }[id];
  if (rows.length !== count)
    throw new Error(`検証が途中で終了しました（${rows.length}/${count}件）。`);
  return rows;
}
