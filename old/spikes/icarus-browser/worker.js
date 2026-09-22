import initIvlpp from './vendor/ivlpp.js';
import initIvl from './vendor/ivl.js';
import initVvp from './vendor/vvp.js';

// Fresh instances per job: an exited native main need not be reentrant.
self.onmessage = async ({ data: { files } }) => {
  const started = performance.now();
  const diagnostics = [];
  try {
    const preprocessed = [];
    const pp = await initIvlpp({
      print: line => preprocessed.push(line),
      printErr: line => diagnostics.push(line),
    });
    for (const file of files) pp.FS.writeFile('/' + file.name, file.source + '\n');
    const ppExit = pp.callMain(['-L', ...files.map(file => '/' + file.name)]);
    if (ppExit) throw new Error('Preprocessor exit: ' + ppExit);

    const compiler = await initIvl({
      print: line => diagnostics.push(line),
      printErr: line => diagnostics.push(line),
    });
    compiler.FS.writeFile('/config', [
      'basedir:/', 'generation:2005',
      'generation:no-specify', 'out:/out.vvp', 'iwidth:32',
      'widthcap:65536', 'functor:cprop', 'functor:nodangle',
      'flag:DLL=vvp.tgt', '',
    ].join('\n'));
    compiler.FS.writeFile('/input.v', preprocessed.join('\n') + '\n');
    const compileExit = compiler.callMain(['-C/config', '--', '/input.v']);
    if (compileExit) throw new Error('Compiler exit: ' + compileExit);
    const bytes = compiler.FS.readFile('/out.vvp');
    const compiled = performance.now();

    const output = [];
    const runtime = await initVvp({
      print: line => output.push(line),
      printErr: line => diagnostics.push(line),
    });
    runtime.FS.writeFile('/program.vvp', bytes);
    self.postMessage({ stage: 'simulate' });
    // This port registers its statically linked system tasks via -m system.
    // Loading system.vpi in the compiler instead causes a spurious dlopen error.
    const simulateExit = runtime.callMain(['-m', 'system', '/program.vvp']);
    if (simulateExit) throw new Error('Simulator exit: ' + simulateExit);
    let vcd = null;
    if (runtime.FS.analyzePath('/trace.vcd').exists) {
      vcd = runtime.FS.readFile('/trace.vcd', { encoding: 'utf8' });
    }
    self.postMessage({
      ok: true, output, diagnostics, vcd,
      compileMs: compiled - started, totalMs: performance.now() - started,
    });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error), diagnostics });
  }
};
