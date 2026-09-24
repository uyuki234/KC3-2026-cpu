import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { compile, type Signals } from '../src/sv';

// Optional independent validation using the previous local spike. These GPL
// assets are served by Playwright routing only and never enter the deployment.
const vendor = 'old/spikes/icarus-browser/vendor/';
test('対応する式とCPUの次状態をIcarus Verilogと照合する', async ({ page, context }) => {
  test.skip(!existsSync(vendor + 'ivl.wasm'), 'ローカルのIcarus WASMがある場合のみ実行');
  const worker = readFileSync('old/public/simulation-worker.js', 'utf8')
    .replaceAll('./engine/', './')
    .replace('generation:2005', 'generation:2012');
  await context.route('**/__test_engine/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === 'worker.js')
      return route.fulfill({ contentType: 'text/javascript', body: worker });
    if (!/^(ivlpp|ivl|vvp)\.(js|wasm)$/.test(name)) return route.abort();
    return route.fulfill({
      contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      body: readFileSync(vendor + name),
    });
  });
  const cpu = readFileSync('code/td4/cpu.sv', 'utf8');
  const comb = cpu.slice(cpu.indexOf('    always_comb'), cpu.lastIndexOf('endmodule')).trim();
  const signals: Signals = {};
  for (const name of ['a', 'b', 'cf', 'ip', 'out', 'imm', 'switch', 'opcode'])
    signals[name] = { width: name === 'cf' ? 1 : 4 };
  for (const name of ['next_a', 'next_b', 'next_cf', 'next_ip', 'next_out'])
    signals[name] = { width: name === 'next_cf' ? 1 : 4, writable: true };
  const evaluator = compile(comb, signals);
  const expected: string[] = [],
    stimulus: string[] = [];
  for (let byte = 0; byte < 256; byte++) {
    let packed = 0n;
    for (let x = 0; x < 16; x++) {
      const input = {
        a: x,
        b: (x + 5) % 16,
        cf: x % 2,
        ip: x,
        out: (x + 7) % 16,
        imm: byte & 15,
        switch: (x + 3) % 16,
        opcode: byte >> 4,
      };
      const result = evaluator(input);
      const keys = ['next_a', 'next_b', 'next_cf', 'next_ip', 'next_out'];
      for (const key of keys) packed = (packed << BigInt(signals[key].width)) | BigInt(result[key]);
    }
    expected.push(`CPU,${packed.toString(16).padStart(68, '0')}`);
  }
  stimulus.push(`for (byte_index=0; byte_index<256; byte_index=byte_index+1) begin
    packed_results=0;
    for (x=0; x<16; x=x+1) begin
      a=x; b=(x+5)%16; cf=x%2; ip=x; out=(x+7)%16;
      imm=byte_index%16; switch=(x+3)%16; opcode=byte_index/16;
      #1; packed_results={packed_results[254:0],next_a,next_b,next_cf,next_ip,next_out};
    end
    $display("CPU,%068h",packed_results);
  end`);
  const expressions = [
    "4'd15 + 4'd1",
    "{4'd15 + 4'd1}",
    "~4'b0000",
    "{~4'b0000}",
    "1'b1 ? 4'd15 + 4'd1 : 4'd0",
    "1'b0 ? 4'd0 : 4'd15 + 4'd1",
    "4'shf < 4'sd1",
    "4'shf < 4'd1",
    "4'shf + 4'sd1",
    "4'shf + 4'd1",
    "4'shf",
    "-4'sd1",
    "4'd8 << 1",
    "8'd128 >> 7",
    "'1",
    "'0",
    '3 > 2 && 1 != 0 ? 6 : 9',
    "4'd15 * 4'd15",
    "4'd0 - 4'd1",
    "{1'b0,4'd15} + {1'b0,4'd1}",
    "4'd1 << 32",
    "4'd7 ^ 4'd3",
    "1'b1 ? 4'shf : 4'd0",
    "1'b1 ? 4'shf : 4'sd0",
    "!(4'd3 & 4'd1)",
    "4'd8 >> (4'd15 + 4'd1)",
    "(4'd15 + 4'd1) == 4'd0",
    "(4'd15 + 4'd1) == 5'd16",
    "1'b1 ? '1 : 4'd0",
    "{4'd9,4'd6}",
  ];
  for (const expr of expressions) {
    const result = compile(`always_comb result=${expr};`, { result: { width: 8, writable: true } })(
      {},
    ).result;
    expected.push(`EXPR,${result}`);
    stimulus.push(`result=${expr}; $display("EXPR,%0d", result);`);
  }
  const source = `module tb;
logic [3:0] a,b,ip,out,imm,switch,opcode,next_a,next_b,next_ip,next_out;
logic cf,next_cf; logic [7:0] result;
logic [271:0] packed_results; integer byte_index,x;
${comb}
initial begin
${stimulus.join('\n')}
$finish;
end
endmodule`;
  await page.goto('./');
  const result = await page.evaluate(async (source) => {
    return new Promise<{ ok: boolean; output: string[]; error?: string; diagnostics: string[] }>(
      (resolve, reject) => {
        const worker = new Worker(new URL('__test_engine/worker.js', location.href), {
          type: 'module',
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Icarus timed out'));
        }, 45000);
        worker.onerror = (e) => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(e.message));
        };
        worker.onmessage = ({ data }) => {
          if (data.ok === undefined) return;
          clearTimeout(timeout);
          worker.terminate();
          resolve(data);
        };
        worker.postMessage({ files: [{ name: 'tb.sv', source }] });
      },
    );
  }, source);
  expect(result.ok, JSON.stringify(result.diagnostics) + result.error).toBe(true);
  const actual = result.output.filter((line) => /^(CPU|EXPR),/.test(line));
  expect(actual.length, result.diagnostics.join('\n')).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) expect(actual[i], `ベクトル${i}`).toBe(expected[i]);
});
