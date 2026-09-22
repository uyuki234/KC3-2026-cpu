import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  binary,
  cpuDownload,
  hex,
  initialCode,
  initialRom,
  instructionName,
  instructions,
  resetState,
  stateKeys,
  type Frame,
  type TestResult,
} from './td4';
import { loadProject, storageKey, validateProject, type Project } from './storage';
const Editor = lazy(() => import('./Editor'));
type Notice = { message: string; target?: 'cpu' | 'rom'; line?: number };
const newWorker = () => new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' });
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: name.endsWith('.json') ? 'application/json' : 'text/plain;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [loaded] = useState(loadProject),
    [project, setProject] = useState(loaded.project);
  const [notice, setNotice] = useState<Notice>({ message: loaded.warning }),
    [saved, setSaved] = useState('');
  const [results, setResults] = useState<Record<number, TestResult>>({}),
    [testing, setTesting] = useState(false),
    [selected, setSelected] = useState<number>();
  const [frame, setFrame] = useState<Frame>(),
    [romBytes, setRomBytes] = useState<number[]>([]),
    [running, setRunning] = useState(false),
    [ready, setReady] = useState(false),
    [preparing, setPreparing] = useState(false);
  const [input, setInput] = useState(0),
    [speed, setSpeed] = useState(400),
    [history, setHistory] = useState<Frame[]>([]);
  const [backup, setBackup] = useState<Project>(),
    [location, setLocation] = useState<{ target: string; line: number; key: number }>();
  const testWorker = useRef<Worker | null>(null),
    runWorker = useRef<Worker | null>(null),
    testTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    prepareTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    file = useRef<HTMLInputElement>(null);
  const state = frame?.after ?? resetState(),
    count = instructions.filter(
      (i) => results[i.op]?.passed === results[i.op]?.total && results[i.op],
    ).length;
  useEffect(() => {
    setSaved('保存中…');
    const timer = setTimeout(() => {
      try {
        validateProject(project);
        localStorage.setItem(storageKey, JSON.stringify(project));
        setSaved('このブラウザに保存済み');
      } catch {
        setSaved('保存できません。コードの長さやブラウザ設定を確認してください');
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(
    () => () => {
      testWorker.current?.terminate();
      runWorker.current?.terminate();
      clearTimeout(testTimer.current);
      clearTimeout(prepareTimer.current);
    },
    [],
  );
  function cancelTest() {
    clearTimeout(testTimer.current);
    testWorker.current?.terminate();
    testWorker.current = null;
    setTesting(false);
  }
  function invalidateRun() {
    clearTimeout(prepareTimer.current);
    runWorker.current?.terminate();
    runWorker.current = null;
    setRunning(false);
    setReady(false);
    setPreparing(false);
    setFrame(undefined);
    setRomBytes([]);
    setHistory([]);
  }
  function change(target: 'cpu' | 'rom', text: string) {
    if (project[target] === text) return;
    invalidateRun();
    if (target === 'cpu') {
      cancelTest();
      setResults({});
      setSelected(undefined);
    }
    setNotice({ message: '' });
    setProject((p) => ({ ...p, [target]: text }));
  }
  function replace(next: Project) {
    setBackup(project);
    cancelTest();
    invalidateRun();
    setResults({});
    setSelected(undefined);
    setProject(next);
    setNotice({ message: 'コードを置き換えました。「置き換えを取り消す」で戻せます。' });
  }
  function check(op?: number) {
    if (testing) return;
    cancelTest();
    setNotice({ message: '' });
    setTesting(true);
    setSelected(op);
    if (op === undefined) setResults({});
    else
      setResults((r) => {
        const next = { ...r };
        delete next[op];
        return next;
      });
    const worker = newWorker();
    testWorker.current = worker;
    testTimer.current = setTimeout(() => {
      if (testWorker.current === worker) {
        cancelTest();
        setNotice({
          message: '検証が30秒を超えたため中止しました。コードを短くして再実行してください。',
          target: 'cpu',
        });
      }
    }, 30000);
    worker.onerror = () => {
      cancelTest();
      setNotice({ message: '命令テストを開始できませんでした。ページを再読み込みしてください。' });
    };
    worker.onmessage = ({ data }) => {
      if (testWorker.current !== worker) return;
      if (data.type === 'test-result') {
        setResults((r) => ({ ...r, [data.result.op]: data.result }));
        if (data.result.failures.length) setSelected((current) => current ?? data.result.op);
      } else if (data.type === 'error') {
        cancelTest();
        setNotice({
          message: `${data.kind === 'unsupported' ? '対応していない構文' : data.kind === 'syntax' ? '構文エラー' : '実行エラー'} — ${data.message}`,
          target: 'cpu',
          line: data.line,
        });
      } else if (data.type === 'test-done') cancelTest();
    };
    worker.postMessage({ type: 'test', source: project.cpu, op });
  }
  function prepare(run: boolean) {
    invalidateRun();
    setNotice({ message: '' });
    setPreparing(true);
    const worker = newWorker();
    runWorker.current = worker;
    prepareTimer.current = setTimeout(() => {
      if (runWorker.current === worker) {
        invalidateRun();
        setNotice({ message: 'コードの準備に時間がかかりすぎたため中止しました。' });
      }
    }, 5000);
    worker.onerror = () => {
      invalidateRun();
      setNotice({ message: 'CPUを開始できませんでした。ページを再読み込みしてください。' });
    };
    worker.onmessage = ({ data }) => {
      if (runWorker.current !== worker) return;
      if (data.type === 'ready') {
        clearTimeout(prepareTimer.current);
        setPreparing(false);
        setReady(true);
        setRunning(run);
        setRomBytes(data.rom);
      } else if (data.type === 'frame') {
        setFrame(data.frame);
        setHistory((h) => [...h.slice(-15), data.frame]);
      } else if (data.type === 'stopped') setRunning(false);
      else if (data.type === 'running') setRunning(true);
      else if (data.type === 'error') {
        clearTimeout(prepareTimer.current);
        worker.terminate();
        runWorker.current = null;
        setRunning(false);
        setPreparing(false);
        setReady(false);
        setNotice({
          message: `実行できません — ${data.message}`,
          target: data.target,
          line: data.line,
        });
      }
    };
    worker.postMessage({
      type: 'prepare',
      source: project.cpu,
      rom: project.rom,
      input,
      speed,
      run,
    });
  }
  function play() {
    if (ready && runWorker.current) {
      setRunning(true);
      runWorker.current.postMessage({ type: 'run' });
    } else prepare(true);
  }
  function stop() {
    runWorker.current?.postMessage({ type: 'stop' });
    setRunning(false);
  }
  async function importProject(selected?: File) {
    if (!selected) return;
    try {
      if (selected.size > 500000) throw new Error('500KB以内のプロジェクトを選んでください。');
      replace(validateProject(JSON.parse(await selected.text())));
    } catch (e) {
      setNotice({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (file.current) file.current.value = '';
    }
  }
  const selectedResult = selected === undefined ? undefined : results[selected];
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top">
          <span className="chip-logo">▦</span>
          <strong>
            TD4<span> / HANDS-ON</span>
          </strong>
        </a>
        <span className="event-label">KC3 2026 · uyuki</span>
        <div className="file-actions">
          <span className="saved">{saved}</span>
          <button onClick={() => download('td4-project.json', JSON.stringify(project, null, 2))}>
            保存用JSON
          </button>
          <button onClick={() => file.current?.click()}>読み込む</button>
          <input
            hidden
            ref={file}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void importProject(e.target.files?.[0])}
          />
        </div>
      </header>
      <main id="top">
        <section className="intro">
          <div>
            <p className="eyebrow">VERILOGで学ぶCPU自作入門</p>
            <h1>
              命令を書こう。
              <br />
              <span>自分のCPUを動かそう。</span>
            </h1>
            <p>
              次の値を決める回路を、あなたの手で。
              <br />
              8つの命令処理を埋めて、ROMのプログラムを実行しよう。
            </p>
          </div>
          <div className="intro-guide">
            <span className="edition">4 BIT CPU / 12 INSTRUCTIONS</span>
            <ol>
              <li>
                <b>01</b> 命令表を見ながらコードを書く
              </li>
              <li>
                <b>02</b> 各命令の動きをテストする
              </li>
              <li>
                <b>03</b> ROMを実行してLEDを観察する
              </li>
            </ol>
            <a href="#simulator">実行画面へ ↓</a>
          </div>
        </section>
        {notice.message && (
          <div className="notice" role="alert">
            <span>{notice.message}</span>
            {notice.line && (
              <button
                onClick={() => {
                  setLocation({ target: notice.target!, line: notice.line!, key: Date.now() });
                  document
                    .getElementById(notice.target === 'rom' ? 'rom-editor' : 'cpu-editor')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                該当行を見る
              </button>
            )}
            <button aria-label="通知を閉じる" onClick={() => setNotice({ message: '' })}>
              ×
            </button>
          </div>
        )}
        {backup && (
          <div className="undo">
            <button
              onClick={() => {
                const previous = backup;
                replace(previous);
                setBackup(undefined);
                setNotice({ message: '置き換える前のコードに戻しました。' });
              }}
            >
              置き換えを取り消す
            </button>
          </div>
        )}
        <div className="build-grid">
          <section id="cpu-editor" className="code-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">01 / WRITE</p>
                <h2>命令処理をつくる</h2>
              </div>
              <span className="badge">8問 + 4つの参考例</span>
            </div>
            <p className="section-description">
              <code>always_comb</code> に、次の値 <code>next_*</code> を決める処理を書きます。
              <br />
              初期ROMで使わない4命令は、参考として解答を入れてあります。
            </p>
            <div className="editor-caption">
              <span>
                <i />
                cpu.sv <small>always_comb</small>
              </span>
              <span>SystemVerilog · 演習用の対応構文</span>
            </div>
            <Suspense fallback={<div className="editor-loading">エディタを読み込み中…</div>}>
              <Editor
                value={project.cpu}
                label="CPUのalways_comb"
                onChange={(v) => change('cpu', v)}
                onRun={() => check()}
                location={location?.target === 'cpu' ? location : undefined}
              />
            </Suspense>
            <div className="code-toolbar">
              <button className="primary" disabled={testing} onClick={() => check()}>
                {testing ? '検証中…' : '▷ すべての命令をテスト'}
              </button>
              {testing ? (
                <button onClick={cancelTest}>テストを中止</button>
              ) : (
                <span>Ctrl / ⌘ + Enter</span>
              )}
            </div>
            <div className="sub-actions">
              <button onClick={() => replace({ ...project, cpu: initialCode })}>
                配布コードに戻す
              </button>
              <button onClick={() => download('cpu.sv', cpuDownload(project.cpu))}>
                cpu.svをダウンロード ↗
              </button>
            </div>
            <div className="hints">
              <details>
                <summary>ヒント：次の値に代入する</summary>
                <p>
                  <code>next_b = a;</code>{' '}
                  は、今のAを「次にBへ記憶する値」にします。記憶する処理は用意済みです。共通処理で値を決めてから、命令に応じて必要なものだけ上書きします。
                </p>
              </details>
              <details>
                <summary>ヒント：加算と桁上がり</summary>
                <p>
                  <code>{'{上位1bit, 下位4bit}'}</code> と連結すると、5bitの結果を受け取れます。15 +
                  1 は <code>1_0000</code>。結果の下位4bitは0、桁上がりは1です。
                </p>
              </details>
              <details>
                <summary>ヒント：条件で次の番地を選ぶ</summary>
                <p>
                  <code>条件 ? 真のときの値 : 偽のときの値</code>。JNCで見るのは現在の{' '}
                  <code>cf</code> です。<code>next_cf</code>{' '}
                  は次のクロックで記憶する値なので、区別しましょう。
                </p>
              </details>
              <details>
                <summary>対応するSystemVerilogの構文</summary>
                <p>
                  この教材は <code>always_comb</code>{' '}
                  の対応構文を解析して実行する、0/1の信号を対象としたシミュレーターです。
                </p>
                <p>
                  <code>begin/end</code>、<code>case / unique case / default</code>、
                  <code>if/else</code>、代入 <code>=</code>
                  、連結、定数による右辺のビット選択、三項演算子に対応します。演算子は{' '}
                  <code>
                    + - * ~ ! &amp; | ^ &lt;&lt; &gt;&gt; == != &lt; &gt; &lt;= &gt;= &amp;&amp; ||
                  </code>
                  。2・8・10・16進の定数と <code>'0 / '1</code> を使えます。
                </p>
                <p>
                  変数の追加宣言、ループ、関数、遅延、X/Z、非ブロッキング代入、左辺の部分選択には対応していません。対応外の記述はエラーで知らせます。汎用のSystemVerilogコンパイラやFPGA合成ツールではありません。
                </p>
                <p>
                  講義コードの <code>opecode</code> と標準的な綴りの <code>opcode</code>{' '}
                  は、同じ入力として使えます。CPU全体のダウンロードには、用意済みの同期リセットと記憶処理が含まれます。
                </p>
              </details>
            </div>
          </section>
          <section className="tests-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">02 / CHECK</p>
                <h2>命令表と動作テスト</h2>
              </div>
              <strong className="completion" data-testid="completion">
                {count}
                <span> / 12</span>
              </strong>
            </div>
            <p className="section-description">
              期待した次の値になるか、命令ごとに確認。
              <br />
              「参考」の4命令も編集・テストできます。
            </p>
            <div className="instruction-list">
              {instructions.map((i) => {
                const r = results[i.op],
                  passed = r && r.passed === r.total;
                return (
                  <div
                    key={i.op}
                    className={`instruction-row ${selected === i.op ? 'selected' : ''}`}
                  >
                    <div className="instruction-meta">
                      <code>{binary(i.op)}</code>
                      {i.reference && <span className="reference">参考</span>}
                    </div>
                    <div className="instruction-body">
                      <strong>{i.name}</strong>
                      <p>{i.description}</p>
                    </div>
                    <div className="instruction-actions">
                      <button
                        aria-label={`${i.name}をテスト`}
                        disabled={testing}
                        onClick={() => check(i.op)}
                      >
                        テスト
                      </button>
                      <button
                        className={`test-status ${r ? (passed ? 'pass' : 'fail') : ''}`}
                        disabled={!r}
                        onClick={() => setSelected(i.op)}
                        data-testid={`status-${i.op}`}
                      >
                        {r ? (passed ? '✓ 成功' : '要確認') : '未検証'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="common-note">
              共通処理：A・B・OUTは保持、IPは+1、CFは0。ADDだけがCFを上書きし、JNCは現在のCFを使います。
            </p>
            <div className="test-detail" aria-live="polite">
              <h3>
                {selectedResult
                  ? `${instructions.find((i) => i.op === selected)?.name ?? '未定義命令'} の結果`
                  : 'テストで何を確認する？'}
              </h3>
              {selectedResult ? (
                <>
                  <p className={selectedResult.passed === selectedResult.total ? 'pass' : 'fail'}>
                    {selectedResult.passed} / {selectedResult.total} ケース成功
                  </p>
                  {selectedResult.failures.map((f, idx) => (
                    <div className="failure" key={idx}>
                      <p>
                        <code>{binary(f.byte, 8)}</code> · Im={f.byte & 15} · switch={f.input}
                      </p>
                      {f.error && <p className="fail">{f.error}</p>}
                      <table>
                        <thead>
                          <tr>
                            <th>信号</th>
                            <th>現在</th>
                            <th>期待する次の値</th>
                            <th>実際</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stateKeys.map((k) => (
                            <tr
                              key={k}
                              className={
                                f.actual && f.actual[k] !== f.expected[k] ? 'mismatch' : ''
                              }
                            >
                              <th>{k.toUpperCase()}</th>
                              <td>{f.before[k]}</td>
                              <td>{f.expected[k]}</td>
                              <td>{f.actual?.[k] ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {!selectedResult.failures.length && (
                    <p>検証した入力では、すべてのレジスタが期待どおりに更新されました。</p>
                  )}
                </>
              ) : (
                <p>
                  値0〜15、CFの0/1、IPの通常進行と15→0を確認します。書き換える値だけでなく、保持する値も比較します。失敗例は最大3件表示します。
                </p>
              )}
              {[8, 10, 12, 13].some((op) => results[op]) && (
                <details>
                  <summary>未定義命令の共通処理</summary>
                  {[8, 10, 12, 13].map(
                    (op) =>
                      results[op] && (
                        <button
                          key={op}
                          className={results[op].passed === results[op].total ? 'pass' : 'fail'}
                          onClick={() => setSelected(op)}
                        >
                          {binary(op)}: {results[op].passed}/{results[op].total}
                        </button>
                      ),
                  )}
                </details>
              )}
            </div>
          </section>
        </div>
        <section id="simulator" className="simulation">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / RUN</p>
              <h2>書いたCPUで、プログラムを動かす</h2>
            </div>
            <span className="badge">
              {count === 12 ? '12命令を検証済み' : '未完成でも実行できます'}
            </span>
          </div>
          <p className="section-description">
            左のROMを、あなたの命令処理で実行します。コードやROMを編集すると停止し、次の実行はリセットから始まります。
          </p>
          <div className="run-grid">
            <section id="rom-editor" className="rom-panel">
              <div className="editor-caption">
                <span>
                  <i />
                  rom.sv <small>自由に編集できます</small>
                </span>
                <button onClick={() => replace({ ...project, rom: initialRom })}>
                  配布ROMに戻す
                </button>
              </div>
              <Suspense fallback={<div className="editor-loading">ROMエディタを読み込み中…</div>}>
                <Editor
                  label="ROMコード"
                  value={project.rom}
                  onChange={(v) => change('rom', v)}
                  location={location?.target === 'rom' ? location : undefined}
                />
              </Suspense>
              <div className="rom-description">
                <h3>配布ROMの動き</h3>
                <p>
                  最初にスイッチの値をBに読み込みます。待ちループを挟みながらBを増やしてLEDへ出力し、桁上がり後は全消灯と全点灯を繰り返します。
                </p>
                <p>
                  番地は0〜15、命令は8bit。たとえば <code>8'b1011_0101</code> は <code>OUT 5</code>
                  。ROMでは <code>addr</code> を読み、全番地で <code>data</code> を決めてください。
                </p>
                <button className="text-button" onClick={() => download('rom.sv', project.rom)}>
                  rom.svをダウンロード ↗
                </button>
              </div>
            </section>
            <section className="cpu-view">
              <div className="board">
                <div className="board-heading">
                  <span>YOUR TD4 / OUTPUT</span>
                  <span className="run-indicator">
                    {running
                      ? '● RUNNING'
                      : preparing
                        ? 'PREPARING'
                        : ready
                          ? 'STOPPED'
                          : 'READY TO START'}
                  </span>
                </div>
                <div
                  className="led-bank"
                  data-testid="leds"
                  aria-label={`LED ${binary(state.out)}`}
                >
                  {[3, 2, 1, 0].map((bit) => (
                    <div key={bit}>
                      <span className={`led ${(state.out >> bit) & 1 ? 'on' : ''}`}>
                        {(state.out >> bit) & 1}
                      </span>
                      <small>BIT {bit}</small>
                    </div>
                  ))}
                </div>
                <div className="register-bank">
                  {stateKeys.map((k) => (
                    <div key={k} className={frame && frame.before[k] !== state[k] ? 'changed' : ''}>
                      <label>{k.toUpperCase()}</label>
                      <strong data-testid={`register-${k}`}>{state[k]}</strong>
                      <code>{binary(state[k], k === 'cf' ? 1 : 4)}</code>
                    </div>
                  ))}
                </div>
                <div className="current-instruction">
                  <span data-testid="cycle">{frame?.cycle ?? 0} 命令実行</span>
                  <strong>
                    {frame
                      ? `${frame.before.ip}番地: ${instructionName(frame.byte)}`
                      : 'リセット状態'}
                  </strong>
                </div>
              </div>
              <div className="playback">
                <button className="primary" disabled={running || preparing} onClick={play}>
                  {ready ? '▷ 再開' : '▷ 実行'}
                </button>
                <button disabled={!running} onClick={stop}>
                  停止
                </button>
                <button disabled={preparing} onClick={() => prepare(false)}>
                  リセット
                </button>
                <label>
                  速度
                  <select
                    aria-label="実行速度"
                    value={speed}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setSpeed(n);
                      runWorker.current?.postMessage({ type: 'speed', value: n });
                    }}
                  >
                    <option value={1000}>1命令 / 秒</option>
                    <option value={400}>2.5命令 / 秒</option>
                    <option value={100}>10命令 / 秒</option>
                  </select>
                </label>
              </div>
              <div className="inputs">
                <div>
                  <h3>入力スイッチ</h3>
                  <p>IN命令が、この時点の値を読みます。</p>
                </div>
                <div className="switches">
                  {[3, 2, 1, 0].map((bit) => (
                    <button
                      key={bit}
                      aria-label={`入力ビット${bit}`}
                      aria-pressed={!!(input & (1 << bit))}
                      onClick={() => {
                        const next = input ^ (1 << bit);
                        setInput(next);
                        runWorker.current?.postMessage({ type: 'input', value: next });
                      }}
                    >
                      <small>{bit}</small>
                      {(input >> bit) & 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="live-rom">
                <div className="live-rom-title">
                  <h3>ROMと実行位置</h3>
                  <span>青い行が次に実行する命令</span>
                </div>
                {romBytes.length ? (
                  <div className="rom-words">
                    {romBytes.map((byte, addr) => (
                      <div key={addr} className={state.ip === addr ? 'current' : ''}>
                        <span>{addr.toString().padStart(2, '0')}</span>
                        <code>{hex(byte)}</code>
                        <strong>{instructionName(byte)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">実行またはリセットで、編集したROMを読み込みます。</p>
                )}
              </div>
              <details className="history">
                <summary>実行履歴（直近16命令）</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>回</th>
                        <th>番地 / 命令</th>
                        <th>A</th>
                        <th>B</th>
                        <th>CF</th>
                        <th>IP</th>
                        <th>OUT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((f) => (
                        <tr key={f.cycle}>
                          <td>{f.cycle}</td>
                          <td>
                            {f.before.ip}: {instructionName(f.byte)}
                          </td>
                          {stateKeys.map((k) => (
                            <td key={k}>{f.after[k]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          </div>
        </section>
        <footer>
          <span>KC3 2026 · Verilogで学ぶCPU自作入門</span>
          <span>コードの処理と実行は、このブラウザ内で完結します。</span>
          <a href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>ライブラリのライセンス</a>
        </footer>
      </main>
    </>
  );
}
