const target = document.querySelector('#result');
const checks = [];
const source = await (await fetch('./td4.v')).text();
const environment = { userAgent: navigator.userAgent, crossOriginIsolated };

function run(files, { cancel = false } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { type: 'module' });
    let cancellation;
    let heartbeat;
    let ticks = 0;
    const finish = (result, error) => {
      clearTimeout(timeout);
      clearTimeout(cancellation);
      clearInterval(heartbeat);
      worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const timeout = setTimeout(() => finish(null, new Error('15 second timeout')), 15000);
    worker.onerror = event => finish(null, new Error(event.message));
    worker.onmessage = ({ data }) => {
      if (data.stage === 'simulate') {
        if (cancel) {
          heartbeat = setInterval(() => ticks++, 10);
          cancellation = setTimeout(() => finish({ cancelled: true, ticks }), 250);
        }
        return;
      }
      finish(data);
    };
    worker.postMessage({ files });
  });
}

function bench(program, cycles, inputs = {}) {
  return `module tb;
reg clk = 0, reset_n = 1;
reg [3:0] in_port = 10;
reg [7:0] rom [0:15];
wire [3:0] a, b, pc, out_port;
wire carry;
wire [4:0] sum;
wire [7:0] instruction = rom[pc];
integer i;
reg [3:0] executed_pc;
reg [7:0] executed_instruction;
td4 dut(clk, reset_n, instruction, in_port, a, b, pc, out_port, carry, sum);
initial begin
  $dumpfile("trace.vcd"); $dumpvars(0, tb);
  ${Array.from({ length: 16 }, (_, i) => `rom[${i}] = 8'h${(program[i] ?? 0x30).toString(16).padStart(2, '0')};`).join('\n  ')}
  #1; reset_n = 0; #1; reset_n = 1; #1;
  $display("RESET %d %d %d %d %d", pc, a, b, out_port, carry);
  for (i = 0; i < ${cycles}; i = i + 1) begin
    ${Object.entries(inputs).map(([cycle, value]) => `if (i == ${Number(cycle)}) in_port = 4'd${value};`).join('\n    ')}
    #1; executed_pc = pc; executed_instruction = instruction;
    clk = 1; #1;
    $display("TRACE %d %d %d %d %d %d %d %d", i, executed_pc, executed_instruction, pc, a, b, out_port, carry);
    clk = 0; #1;
  end
  reset_n = 0; #1;
  $display("RESET %d %d %d %d %d", pc, a, b, out_port, carry);
  $finish;
end
endmodule`;
}

const files = (tb, cpu = source) => [
  { name: 'td4.v', source: cpu }, { name: 'tb.v', source: tb },
];
const traces = result => result.output.filter(line => line.startsWith('TRACE '))
  .map(line => line.trim().split(/\s+/).slice(1).map(Number));
const states = result => traces(result).map(row => row.slice(3));
function assert(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
async function check(name, operation) {
  try { checks.push({ name, pass: true, ...await operation() }); }
  catch (error) { checks.push({ name, pass: false, error: String(error) }); }
  target.textContent = JSON.stringify({ status: 'RUNNING', environment, checks }, null, 2);
}

// Explicit expectations, independent of the Verilog decoder.
const program = [0x3e, 0x01, 0x01, 0xe6, 0xe6, 0x30, 0x75, 0x50, 0x10, 0x40, 0x20, 0x60, 0x90, 0xb3, 0xf0];
const expected = [
  [1,14,0,0,0], [2,15,0,0,0], [3,0,0,0,1], [4,0,0,0,0], [6,0,0,0,0],
  [7,0,5,0,0], [8,0,5,0,0], [9,5,5,0,0], [10,5,5,0,0],
  [11,10,5,0,0], [12,10,10,0,0], [13,10,10,10,0], [14,10,10,3,0], [0,10,10,3,0],
];
let baseline;
await check('12 instruction forms, both JNC branches, reset and VCD', async () => {
  baseline = await run(files(bench(program, 14)));
  assert(baseline.ok, JSON.stringify(baseline));
  assert(!baseline.diagnostics.some(line => /error:|failed/i.test(line)), JSON.stringify(baseline.diagnostics));
  assert(equal(states(baseline), expected), JSON.stringify(states(baseline)));
  const resets = baseline.output.filter(line => line.startsWith('RESET '))
    .map(line => line.trim().split(/\s+/).slice(1).map(Number));
  assert(equal(resets, [[0,0,0,0,0], [0,0,0,0,0]]), 'Reset mismatch');
  assert(baseline.vcd?.includes('$enddefinitions'), 'VCD missing');
  for (const signal of ['pc', 'a', 'b', 'carry', 'out_port', 'sum']) {
    assert(new RegExp('\\$var[^\\n]*\\s' + signal + '\\s').test(baseline.vcd), 'Missing signal: ' + signal);
  }
  return { compileMs: baseline.compileMs, totalMs: baseline.totalMs, vcdBytes: baseline.vcd.length, states: states(baseline) };
});
await check('B overflow and MOV clearing carry before JNC', async () => {
  const result = await run(files(bench([0x7f, 0x51, 0x30, 0xe5], 4)));
  assert(result.ok && equal(states(result), [[1,0,15,0,0],[2,0,0,0,1],[3,0,0,0,0],[5,0,0,0,0]]), JSON.stringify(result));
});
await check('PC wraps from 15 to 0', async () => {
  const result = await run(files(bench(Array(16).fill(0x30), 16)));
  assert(result.ok && equal(states(result).map(row => row[0]), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0]), 'PC mismatch');
});
await check('Replay input history changes only the subsequent states', async () => {
  const result = await run(files(bench(program, 14, { 10: 6 })));
  const altered = expected.map(row => [...row]);
  altered[10] = [12,10,6,0,0]; altered[11] = [13,10,6,6,0];
  altered[12] = [14,10,6,3,0]; altered[13] = [0,10,6,3,0];
  assert(result.ok && equal(states(result), altered), JSON.stringify(states(result)));
  return { totalMs: result.totalMs };
});
await check('Wrong learner addition changes real simulation output', async () => {
  const wrong = source.replace("{1'b0, operand} +", "{1'b0, operand} -");
  const result = await run(files(bench(program, 14), wrong));
  assert(result.ok && !equal(states(result), expected), 'Mutation was not reflected');
});
await check('Syntax error reports original source filename and line', async () => {
  const result = await run(files(bench(program, 1), source.replace('assign sum =', 'assign sum = ;')));
  assert(!result.ok && /td4\.v:\d+/.test(result.diagnostics.join('\n')), JSON.stringify(result));
  return { diagnostics: result.diagnostics };
});
await check('All 256 adder input pairs including carry', async () => {
  const result = await run(files(`module tb;
reg clk = 0, reset_n = 1;
reg [3:0] in_port;
reg [7:0] instruction;
wire [3:0] a,b,pc,out_port; wire carry; wire [4:0] sum;
integer x,y;
td4 dut(clk,reset_n,instruction,in_port,a,b,pc,out_port,carry,sum);
initial begin
  for(x=0;x<16;x=x+1) for(y=0;y<16;y=y+1) begin
    in_port=x; instruction=8'h20+y; #1;
    $display("ADD %d %d %d",x,y,sum);
  end
  $finish;
end
endmodule`));
  assert(result.ok, JSON.stringify(result));
  const rows = result.output.filter(line => line.startsWith('ADD '));
  assert(rows.length === 256, 'Missing adder cases');
  for (const row of rows) {
    const [x,y,sum] = row.trim().split(/\s+/).slice(1).map(Number);
    assert(sum === x + y, row);
  }
});
await check('Register holds between rising edges and when not selected', async () => {
  const result = await run(files(`module tb;
reg clk=0, reset_n=1; reg [7:0] instruction=8'h35; reg [3:0] in_port=0;
wire [3:0] a,b,pc,out_port; wire carry; wire [4:0] sum;
td4 dut(clk,reset_n,instruction,in_port,a,b,pc,out_port,carry,sum);
initial begin
  #1; reset_n=0; #1; reset_n=1; #1; clk=1; #1;
  $display("HOLD %d",a);
  instruction=8'h39; #1; $display("HOLD %d",a);
  clk=0; #1; $display("HOLD %d",a);
  instruction=8'h72; #1; clk=1; #1; $display("HOLD %d",a);
  $finish;
end
endmodule`));
  assert(result.ok, JSON.stringify(result));
  assert(equal(result.output.filter(line => line.startsWith('HOLD ')).map(line => Number(line.trim().split(/\s+/)[1])), [5,5,5,5]), 'Register did not hold');
});
await check('4096-cycle bounded trace', async () => {
  const result = await run(files(bench([0x51,0x90,0xf0], 4096)));
  assert(result.ok && traces(result).length === 4096, 'Incomplete trace');
  const last = states(result).at(-1);
  assert(equal(last, [1,0,6,5,0]), JSON.stringify(last));
  return { compileMs: result.compileMs, totalMs: result.totalMs, vcdBytes: result.vcd.length };
});
await check('Infinite simulation can be terminated while UI remains responsive', async () => {
  const result = await run([{ name: 'loop.v', source: 'module tb; reg clk=0; always #1 clk=~clk; endmodule' }], { cancel: true });
  assert(result.cancelled && result.ticks > 0, JSON.stringify(result));
  return result;
});
const report = {
  status: checks.every(check => check.pass) ? 'PASS' : 'FAIL',
  environment, checks,
  resources: performance.getEntriesByType('resource').map(entry => entry.name),
};
target.textContent = JSON.stringify(report, null, 2);
document.title = report.status + ' — TD4 browser probe';
await fetch('/__result', { method: 'POST', body: JSON.stringify(report, null, 2) });
