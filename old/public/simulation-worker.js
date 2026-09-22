import initIvlpp from './engine/ivlpp.js';
import initIvl from './engine/ivl.js';
import initVvp from './engine/vvp.js';

self.onmessage = async ({ data: { files } }) => {
  const started = performance.now();
  const diagnostics = [];
  const output = [];
  let printed = 0;
  const collect = (array) => (line) => {
    printed += String(line).length;
    if (printed > 600000)
      throw new Error('表示する結果が多すぎます。ループや出力処理を確認してください。');
    array.push(String(line));
  };
  try {
    const code = [];
    self.postMessage({ stage: 'コンパイル中' });
    const pp = await initIvlpp({ print: collect(code), printErr: collect(diagnostics) });
    for (const file of files) pp.FS.writeFile('/' + file.name, file.source + '\n');
    if (pp.callMain(['-L', ...files.map((f) => '/' + f.name)]))
      throw new Error('Verilogの前処理に失敗しました。');
    const compiler = await initIvl({ print: collect(diagnostics), printErr: collect(diagnostics) });
    compiler.FS.writeFile(
      '/config',
      'basedir:/\ngeneration:2005\ngeneration:no-specify\nout:/out.vvp\niwidth:32\nwidthcap:65536\nfunctor:cprop\nfunctor:nodangle\nflag:DLL=vvp.tgt\n',
    );
    compiler.FS.writeFile('/input.v', code.join('\n') + '\n');
    if (compiler.callMain(['-C/config', '--', '/input.v']))
      throw new Error('コードの書き方を確認してください。');
    const bytes = compiler.FS.readFile('/out.vvp');
    self.postMessage({ stage: '回路を実行中' });
    const runtime = await initVvp({ print: collect(output), printErr: collect(diagnostics) });
    runtime.FS.writeFile('/program.vvp', bytes);
    if (runtime.callMain(['-m', 'system', '/program.vvp']))
      throw new Error('回路を実行できませんでした。');
    self.postMessage({ ok: true, output, diagnostics, totalMs: performance.now() - started });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: String(error instanceof Error ? error.message : error),
      diagnostics,
      output: [],
    });
  }
};
