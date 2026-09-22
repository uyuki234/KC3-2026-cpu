import type { LessonId, Sources } from './types';

export interface Lesson {
  id: LessonId;
  number: string;
  title: string;
  english: string;
  minutes: number;
  summary: string;
  question: string;
  conditions: string[];
  hints: string[];
  ports: [string, string, string][];
  example: string;
  initial: string;
  answer: string;
}

export const lessons: Lesson[] = [
  {
    id: 'adder',
    number: '01',
    title: '加算器',
    english: 'ADDER',
    minutes: 8,
    summary: '2つの4ビットの値を足して、結果と桁上がりを取り出そう。',
    question: '15 + 1。4ビットに入りきらない値は、どこへ行く？',
    conditions: [
      'result に和の下位4ビットを出す',
      'carry に桁上がりの1ビットを出す',
      '入力が変わると、計算結果も変わる',
    ],
    ports: [
      ['x, y', '入力 / 4 bit', '足す2つの値'],
      ['result', '出力 / 4 bit', '計算結果の下位4ビット'],
      ['carry', '出力 / 1 bit', '桁上がり'],
    ],
    example: '15 + 1 = 1 0000 → carry: 1 / result: 0000',
    hints: [
      '15 + 1 を2進数で筆算してみよう。4ビットの結果の左に、もう1桁必要になります。',
      "{1'b0, x} は、xの左に0を付けた5ビットの値です。両方の入力を5ビットに広げて足しましょう。",
      "assign {carry, result} = {1'b0, ___} + {1'b0, ___};\n空欄に、2つの入力信号を入れてみよう。",
    ],
    initial:
      "module adder4 (\n  input wire [3:0] x, y,\n  output wire [3:0] result,\n  output wire carry\n);\n  // TODO: 加算する回路に置き換えよう\n  assign {carry, result} = 5'b00000;\nendmodule\n",
    answer:
      "module adder4 (\n  input wire [3:0] x, y,\n  output wire [3:0] result,\n  output wire carry\n);\n  assign {carry, result} = {1'b0, x} + {1'b0, y};\nendmodule\n",
  },
  {
    id: 'register',
    number: '02',
    title: 'レジスタ',
    english: 'REGISTER',
    minutes: 9,
    summary: 'クロックのタイミングで、許可された値を保存しよう。',
    question: '入力を変えただけで、保存している値も変わる？',
    conditions: [
      'reset_n が0のとき、クロックを待たず0へ戻す',
      'クロックの立ち上がりで、load が1なら d を保存する',
      'それ以外は前の値を保持する',
    ],
    ports: [
      ['clk', '入力 / 1 bit', '保存のタイミング'],
      ['reset_n', '入力 / 1 bit', '0でリセット'],
      ['load', '入力 / 1 bit', '1で書き込み許可'],
      ['d', '入力 / 4 bit', '保存する値'],
      ['q', '出力 / 4 bit', '保存した値'],
    ],
    example: 'd: 3 → 7   /   クロック前 q: 3 → クロック後 q: 7',
    hints: [
      '入力dと保存先qは別の信号です。書き込み許可loadがあるときだけ、dをqへ取り込みます。',
      '雛形にはクロックとリセット、loadの判定が用意されています。値の保存にはノンブロッキング代入 <= を使います。',
      'end else if (load) begin\n  q <= ___;\nend\n入力信号の名前を入れよう。loadが0のときは代入せず、値を保持します。',
    ],
    initial:
      "module register4 (\n  input wire clk, reset_n, load,\n  input wire [3:0] d,\n  output reg [3:0] q\n);\n  always @(posedge clk or negedge reset_n) begin\n    if (!reset_n) begin\n      q <= 4'b0000;\n    end else if (load) begin\n      // TODO: 入力を保存しよう\n      q <= 4'b0000;\n    end\n  end\nendmodule\n",
    answer:
      "module register4 (\n  input wire clk, reset_n, load,\n  input wire [3:0] d,\n  output reg [3:0] q\n);\n  always @(posedge clk or negedge reset_n) begin\n    if (!reset_n) begin\n      q <= 4'b0000;\n    end else if (load) begin\n      q <= d;\n    end\n  end\nendmodule\n",
  },
  {
    id: 'pc',
    number: '03',
    title: 'プログラムカウンタ',
    english: 'PROGRAM COUNTER',
    minutes: 8,
    summary: '次に実行する命令の番地を、クロックごとに更新しよう。',
    question: '普通の命令の次と、ジャンプの次。どこへ進む？',
    conditions: [
      'reset_n が0なら、PCを0へ戻す',
      'jump が1なら、クロックで target を保存する',
      '通常はPCを1増やす。15番地の次は0番地',
    ],
    ports: [
      ['clk, reset_n', '入力 / 1 bit', 'クロックとリセット'],
      ['jump', '入力 / 1 bit', '1でジャンプ'],
      ['target', '入力 / 4 bit', 'ジャンプ先'],
      ['pc', '出力 / 4 bit', '現在の命令番地'],
    ],
    example: '通常: 0 → 1 → 2    /    ジャンプ: 2 → target',
    hints: [
      '次の番地には「今のPC + 1」と「指定されたtarget」の2つの候補があります。',
      'jumpは命令デコーダが作った信号です。この部品では、命令コードやキャリーを判定し直す必要はありません。',
      "end else if (jump) begin\n  pc <= ___;\nend else begin\n  pc <= pc + 4'b0001;\nend\nジャンプ時は、指定された番地をそのまま使います。",
    ],
    initial:
      "module pc4 (\n  input wire clk, reset_n, jump,\n  input wire [3:0] target,\n  output reg [3:0] pc\n);\n  always @(posedge clk or negedge reset_n) begin\n    if (!reset_n) begin\n      pc <= 4'b0000;\n    end else begin\n      // TODO: 次の番地を選ぼう\n      pc <= pc;\n    end\n  end\nendmodule\n",
    answer:
      "module pc4 (\n  input wire clk, reset_n, jump,\n  input wire [3:0] target,\n  output reg [3:0] pc\n);\n  always @(posedge clk or negedge reset_n) begin\n    if (!reset_n) begin\n      pc <= 4'b0000;\n    end else if (jump) begin\n      pc <= target;\n    end else begin\n      pc <= pc + 4'b0001;\n    end\n  end\nendmodule\n",
  },
];
export const initialSources = Object.fromEntries(lessons.map((l) => [l.id, l.initial])) as Sources;
export const answerSources = Object.fromEntries(lessons.map((l) => [l.id, l.answer])) as Sources;
