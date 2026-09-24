import { describe, expect, it } from 'vitest';
import { compile, SvError } from './sv';
import {
  answerCode,
  compileCpu,
  compileRom,
  cpuDownload,
  initialCode,
  initialRom,
  insertAnswer,
  legacyInitialCode,
  instructions,
  resetState,
  testInstruction,
} from './td4';
import { validateProject } from './storage';

describe('演習の命令テスト', () => {
  const answer = compileCpu(answerCode);
  it.each(instructions)('$name が保持する状態を含む1024ケースに合格する', ({ op }) => {
    const result = testInstruction(answer, op);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(1024);
  });
  it('配布コードは参考4命令だけが合格する', () => {
    const cpu = compileCpu(initialCode);
    const passing = instructions
      .filter((i) => {
        const r = testInstruction(cpu, i.op);
        return r.passed === r.total;
      })
      .map((i) => i.op);
    expect(passing).toEqual([7, 1, 4, 2]);
  });
  it('未実装の8命令を1行の空文で表示する', () => {
    expect(initialCode).toContain("4'b0000: ; // ADD A, IMM");
    expect(initialCode).toContain("4'b0110: ; // IN B");
    expect(initialCode).not.toContain('TODO');
    expect(initialCode.match(/^\s*4'b[01]{4}: ; \/\//gm)).toHaveLength(8);
  });
  it('別の正しい書き方も受け入れる', () => {
    const changed = answerCode
      .replace('{next_cf, next_a} = a + imm;', "{next_cf, next_a} = {1'b0, a} + {1'b0, imm};")
      .replace(
        "next_ip    = cf ? ip + 4'd1 : imm;",
        'begin if (cf == 0) next_ip = imm; else next_ip = ip + 1; end',
      );
    expect(changed).not.toBe(answerCode);
    const cpu = compileCpu(changed);
    expect(testInstruction(cpu, 0).failures).toEqual([]);
    expect(testInstruction(cpu, 14).failures).toEqual([]);
  });
  it('桁上がりの切り捨てと保持対象の破壊を見つける', () => {
    const cpu = compileCpu(answerCode.replace('{next_cf, next_a} = a + imm;', 'next_a = a + imm;'));
    expect(testInstruction(cpu, 0).failures[0].expected.cf).toBe(1);
    const destructive = compileCpu(
      answerCode.replace('next_a     = imm;', 'begin next_a = imm; next_b = 0; end'),
    );
    expect(testInstruction(destructive, 3).passed).toBeLessThan(1024);
  });
  it('JNCは古いCFを見て、実行後のCFは0になる', () => {
    const before = { a: 15, b: 7, cf: 0, ip: 15, out: 3 };
    const add = answer(before, 0x01, 0);
    expect(add).toEqual({ a: 0, b: 7, cf: 1, ip: 0, out: 3 });
    const jnc = answer(add, 0xe8, 0);
    expect(jnc.ip).toBe(1);
    expect(jnc.cf).toBe(0);
    expect(answer(jnc, 0xe8, 0).ip).toBe(8);
  });
  it('次状態への逐次代入とレジスタの同時更新を区別する', () => {
    const cpu = compileCpu(
      'always_comb begin next_a=b; next_b=a; next_cf=0; next_ip=ip+1; next_out=next_a; end',
    );
    expect(cpu({ a: 3, b: 9, cf: 1, ip: 15, out: 2 }, 0, 0)).toEqual({
      a: 9,
      b: 3,
      cf: 0,
      ip: 0,
      out: 9,
    });
  });
  it.each([8, 10, 12, 13])('未定義opcode %i は共通処理だけを行う', (op) => {
    expect(testInstruction(answer, op).passed).toBe(1024);
  });
});
describe('命令ごとの解答挿入', () => {
  it.each(instructions)('$name の処理だけを書き換えて命令テストに合格する', ({ op }) => {
    const result = insertAnswer(initialCode, op);
    expect(testInstruction(compileCpu(result.source), op).passed).toBe(1024);
    const changedLines = result.source.split('\n');
    const originalLines = initialCode.split('\n');
    expect(changedLines).toHaveLength(originalLines.length);
    for (let index = 0; index < originalLines.length; index++) {
      if (index !== result.line - 1) expect(changedLines[index]).toBe(originalLines[index]);
    }
    expect(insertAnswer(result.source, op).source).toBe(result.source);
  });
  it('コメントや改行コード、ほかの命令の編集を保持して複数行の処理を置き換える', () => {
    const source = initialCode
      .replace(
        "4'b0000: ;",
        "4'h0: begin\n // 4'b0101: ;\n if (cf) next_a=2; else next_a=3;\n case (imm) 0: next_a=4; default: next_a=5; endcase\n end",
      )
      .replace("4'b0110: ;", "4'b0110: next_b = 9;")
      .replaceAll('\n', '\r\n');
    const result = insertAnswer(source, 0).source;
    expect(result).toBe(
      source.replace(/4'h0: begin[\s\S]*?\r\n end/, "4'h0: {next_cf, next_a} = a + imm;"),
    );
    expect(result).toContain("4'b0110: next_b = 9;");
  });
  it('三項演算子を含むJNCと旧雛形のbegin/endも置き換える', () => {
    expect(testInstruction(compileCpu(insertAnswer(legacyInitialCode, 14).source), 14).passed).toBe(
      1024,
    );
    expect(insertAnswer(answerCode, 14).source).toBe(answerCode);
  });
  it.each([
    initialCode.replace("4'b0101:", "4'b0000:"),
    initialCode.replace("4'b0000:", "4'b0000, 4'b1100:"),
    initialCode.replace("4'b0000:", "4'b1100:"),
    initialCode.replace("4'b0000: ;", "4'b0000: next_a = ;"),
    initialCode.replace('case (opcode)', 'case (imm)'),
  ])('構文エラーや対象が曖昧なコードには挿入しない', (source) => {
    expect(() => insertAnswer(source, 0)).toThrow();
  });
});
describe('公開ROMとシミュレーション', () => {
  it('実際のrom.svを16バイトへ読み取り、未定義番地も保持する', () => {
    expect(compileRom(initialRom)).toEqual([
      0x60, 0x90, 0x3d, 0x01, 0xe3, 0x51, 0xe1, 0xb0, 0xbf, 0xf7, 0, 0, 0, 0, 0, 0,
    ]);
  });
  it('入力14から15まで数え、桁上がり後にLEDが0/15を繰り返す', () => {
    const cpu = compileCpu(answerCode),
      rom = compileRom(initialRom);
    let s = resetState();
    const outputs: number[] = [];
    for (let n = 0; n < 36; n++) {
      const byte = rom[s.ip];
      s = cpu(s, byte, 14);
      if ([9, 11].includes(byte >> 4)) outputs.push(s.out);
    }
    expect(outputs.slice(0, 7)).toEqual([14, 15, 0, 15, 0, 15, 0]);
  });
  it('ROMの書き換えを実際に反映する', () => {
    const rom = compileRom(
      "always_comb begin case(addr) 0: data=8'hB5; default: data=8'hF0; endcase end",
    );
    expect(compileCpu(answerCode)(resetState(), rom[0], 0).out).toBe(5);
  });
  it('未代入番地や追加プロセスを黙って無視しない', () => {
    expect(() => compileRom("always_comb begin if(addr==0) data=8'hB5; end")).toThrow(
      '値が決まっていません',
    );
    expect(() =>
      compileRom(initialRom.replace('endmodule', 'initial data=0; endmodule')),
    ).toThrow();
  });
  it('ダウンロード用CPUは固定ポート宣言を正し、参加者コードを組み込む', () => {
    expect(cpuDownload(initialCode)).not.toMatch(/led\s*;/);
    expect(cpuDownload(initialCode)).toContain("4'b0000: ; // ADD A, IMM");
  });
});
describe('SystemVerilogの対応範囲', () => {
  function expr(text: string, width = 8) {
    return compile(`always_comb begin result = ${text}; end`, {
      result: { width, writable: true },
    })({}).result;
  }
  it('代入先の文脈で加算を拡張し、連結の中では各式の幅を保持する', () => {
    expect(expr("4'd15 + 4'd1", 5)).toBe(16);
    expect(expr("{4'd15 + 4'd1}", 5)).toBe(0);
    expect(expr("~4'b0000", 8)).toBe(255);
    expect(expr("{~4'b0000}", 8)).toBe(15);
    expect(expr("1'b1 ? 4'd15 + 4'd1 : 4'd0", 5)).toBe(16);
  });
  it('符号付き定数、ビット選択、条件式、シフトを扱う', () => {
    expect(expr("4'shf < 4'sd1")).toBe(1);
    expect(expr("4'shf < 4'd1")).toBe(0);
    expect(expr("4'shf + 4'sd1", 8)).toBe(0);
    expect(expr("4'shf + 4'd1", 8)).toBe(16);
    expect(
      compile('always_comb result = data[7:4];', {
        data: { width: 8 },
        result: { width: 4, writable: true },
      })({ data: 0xa5 }).result,
    ).toBe(10);
    expect(expr("'1", 4)).toBe(15);
    expect(expr("4'd8 << 1", 8)).toBe(16);
    expect(expr("8'd128 >> 7")).toBe(1);
    expect(expr('3 > 2 && 1 != 0 ? 6 : 9')).toBe(6);
  });
  it('構文外のコードや未初期化、未対応演算を拒否する', () => {
    expect(() => expr('window.alert(1)')).toThrow(SvError);
    expect(() => expr('toString')).toThrow(SvError);
    expect(() => expr("8'hA5[7:4]")).toThrow(SvError);
    expect(() => expr("4'bxxxx")).toThrow('X/Z');
    expect(() => expr('8 / 2')).toThrow('対応構文');
    expect(() => compileCpu('always_comb begin next_a <= 0; end')).toThrow('= を使って');
    expect(() => compileCpu('always_comb begin a = 0; end')).toThrow('代入先');
    expect(() => compileCpu('always_comb begin next_a = next_b; end')(resetState(), 0, 0)).toThrow(
      '値を決める前',
    );
    expect(() => compileCpu('always_comb begin forever begin end end')).toThrow('対応していません');
    expect(() => compileCpu('always_comb begin /* not closed')).toThrow('コメント');
  });
  it('改行付きコメントの後でも元のエラー行を示す', () => {
    expect(() => compileCpu('always_comb begin\n// comment\nnext_a <= 0;\nend')).toThrow('3行目');
  });
  it('unique caseの重複を検出する', () => {
    expect(() =>
      compileRom(
        'always_comb begin unique case(addr) 0: data=1; 0: data=2; default: data=0; endcase end',
      ),
    ).toThrow('複数');
  });
  it('不正な保存ファイルを受け入れない', () => {
    expect(() => validateProject({ cpu: '', rom: '' })).toThrow();
    expect(validateProject({ version: 1, cpu: initialCode, rom: initialRom }).cpu).toBe(
      initialCode,
    );
  });
  it('未編集の旧雛形だけを1行形式へ移行する', async () => {
    const { legacyInitialCode } = await import('./td4');
    expect(validateProject({ version: 1, cpu: legacyInitialCode, rom: initialRom }).cpu).toBe(
      initialCode,
    );
    const edited = legacyInitialCode.replace('// TODO:', '// 自分のメモ:');
    expect(validateProject({ version: 1, cpu: edited, rom: initialRom }).cpu).toBe(edited);
  });
});
