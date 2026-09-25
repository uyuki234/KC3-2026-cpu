import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  binary,
  compileRom,
  hex,
  initialCode,
  initialRom,
  insertAnswer,
  instructionName,
  instructions,
  resetState,
  stateKeys,
  type Frame,
  type TestResult,
} from './td4';
import { loadProject, storageKey, validateProject, type Project } from './storage';
import ResourceIcon from './ResourceIcon';
import RomTips from './RomTips';
import { initialTimerSteps, isTimerRom, timerSeconds, type Countdown } from './countdown';
const Editor = lazy(() => import('./Editor'));
type Notice = { message: string; target?: 'cpu' | 'rom'; line?: number };
const newWorker = () => new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' });
export default function App() {
  const [loaded] = useState(loadProject),
    [project, setProject] = useState(loaded.project);
  const [notice, setNotice] = useState<Notice>({ message: loaded.warning });
  const [saveError, setSaveError] = useState('');
  const [results, setResults] = useState<Record<number, TestResult>>({}),
    [testing, setTesting] = useState(false);
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
  const [fullscreen, setFullscreen] = useState(false);
  const [countdown, setCountdown] = useState<Countdown>();
  const [sampledInput, setSampledInput] = useState<number>();
  const timerSupported = useMemo(() => {
    try {
      return isTimerRom(compileRom(project.rom));
    } catch {
      return false;
    }
  }, [project.rom]);
  const remaining =
    !timerSupported || countdown?.kind === 'unavailable'
      ? undefined
      : timerSeconds(countdown?.displaySteps ?? initialTimerSteps(input), speed);
  const timerFinished = countdown?.kind === 'finished';

  const cpuWorkspace = useRef<HTMLDivElement>(null),
    fullscreenButton = useRef<HTMLButtonElement>(null);
  const testWorker = useRef<Worker | null>(null),
    runWorker = useRef<Worker | null>(null),
    testTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    prepareTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const state = frame?.after ?? resetState(),
    count = instructions.filter(
      (i) => results[i.op]?.passed === results[i.op]?.total && results[i.op],
    ).length;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        validateProject(project);
        localStorage.setItem(storageKey, JSON.stringify(project));
        setSaveError('');
      } catch {
        setSaveError('コードを自動保存できません。必要なコードをコピーしておいてください。');
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
  useEffect(() => {
    if (!fullscreen) return;
    const workspace = cpuWorkspace.current!;
    // Keep the same editor mounted so selections and undo history survive resizing.
    const background: { element: HTMLElement; inert: boolean }[] = [];
    for (let node: HTMLElement = workspace; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    workspace
      .querySelector<HTMLElement>('[contenteditable="true"]')
      ?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFullscreen(false);
      } else if (event.key === 'Tab') {
        const focusable = Array.from(
          workspace.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [tabindex="0"], [contenteditable="true"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    workspace.addEventListener('keydown', onKeyDown, true);
    return () => {
      workspace.removeEventListener('keydown', onKeyDown, true);
      for (const { element, inert } of background) element.inert = inert;
      document.body.style.overflow = overflow;
      fullscreenButton.current?.focus({ preventScroll: true });
    };
  }, [fullscreen]);
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
    setCountdown(undefined);
    setSampledInput(undefined);
    setRomBytes([]);
    setHistory([]);
  }
  function change(target: 'cpu' | 'rom', text: string) {
    if (project[target] === text) return;
    invalidateRun();
    if (target === 'cpu') {
      cancelTest();
      setResults({});
    }
    setNotice({ message: '' });
    setProject((p) => ({ ...p, [target]: text }));
  }
  function replace(next: Project) {
    setBackup(project);
    cancelTest();
    invalidateRun();
    setResults({});
    setProject(next);
    setNotice({ message: 'コードを置き換えました。「置き換えを取り消す」で戻せます。' });
  }
  function check(op?: number) {
    if (testing) return;
    cancelTest();
    setNotice({ message: '' });
    setTesting(true);
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
        if (data.frame.cycle === 1) setSampledInput(data.frame.input);
        setCountdown(data.countdown);
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
        setCountdown({ kind: 'unavailable', reason: 'cpu' });
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
  function fillAnswer(op: number) {
    try {
      const answer = insertAnswer(project.cpu, op);
      if (answer.source !== project.cpu) {
        setBackup(project);
        invalidateRun();
        setProject((current) => ({ ...current, cpu: answer.source }));
      }
    } catch (error) {
      setNotice({
        message: `解答を入れられませんでした。コードは変更していません。 ${error instanceof Error ? error.message : String(error)}`,
        target: 'cpu',
      });
    }
  }
  return (
    <>
      <main id="top">
        <section className="intro">
          <div className="intro-copy">
            <h1>
              <span>Verilogで学ぶ</span>
              <wbr />
              <span>CPU自作入門</span>
            </h1>
            <p className="intro-description">「CPUの自作」を体験しよう！</p>
            <div className="intro-guide">
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
            </div>
            <nav className="resource-links" aria-label="講義の関連リンク">
              <a
                className="resource-link"
                href="https://x.com/uyuki234"
                target="_blank"
                rel="noreferrer"
              >
                <ResourceIcon name="x" />
                <small>X</small>
                <strong>作者SNS</strong>
                <span aria-hidden="true">↗</span>
              </a>
              <a
                className="resource-link"
                href="https://speakerdeck.com/uyuki234/verilog-de-manabu-cpu-jisaku-nyuumon"
                target="_blank"
                rel="noreferrer"
              >
                <ResourceIcon name="slides" />
                <small>SLIDES</small>
                <strong>講義スライド</strong>
                <span aria-hidden="true">↗</span>
              </a>
              <a
                className="resource-link"
                href="https://github.com/uyuki234/KC3-2026-cpu"
                target="_blank"
                rel="noreferrer"
              >
                <ResourceIcon name="github" />
                <small>GITHUB</small>
                <strong>リポジトリ</strong>
                <span aria-hidden="true">↗</span>
              </a>
              <a
                className="resource-link"
                href="https://kc3.me/study/4246/"
                target="_blank"
                rel="noreferrer"
              >
                <ResourceIcon name="event" />
                <small>KC3</small>
                <strong>講義ページ</strong>
                <span aria-hidden="true">↗</span>
              </a>
            </nav>
          </div>
        </section>
        {!fullscreen && saveError && (
          <div className="notice" role="alert">
            {saveError}
          </div>
        )}
        {!fullscreen && notice.message && (
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
            <div
              ref={cpuWorkspace}
              className={`cpu-workspace${fullscreen ? ' is-fullscreen' : ''}`}
              role={fullscreen ? 'dialog' : undefined}
              aria-modal={fullscreen ? true : undefined}
              aria-label={fullscreen ? '命令処理をつくる' : undefined}
            >
              <div className="editor-caption">
                <span>
                  <i />
                  cpu.sv（一部抜粋） <small>always_comb</small>
                </span>
              </div>
              <Suspense fallback={<div className="editor-loading">エディタを読み込み中…</div>}>
                <Editor
                  value={project.cpu}
                  label="CPUのalways_comb"
                  onChange={(v) => change('cpu', v)}
                  location={location?.target === 'cpu' ? location : undefined}
                />
              </Suspense>
              {fullscreen && (
                <div className="fullscreen-feedback" aria-live="polite">
                  {notice.message || saveError ? (
                    <span role="alert">{notice.message || saveError}</span>
                  ) : (
                    <span>{testing ? '検証中…' : `${count} / 12 命令成功`}</span>
                  )}
                  {!testing && Object.keys(results).length > 0 && (
                    <button
                      onClick={() => {
                        setFullscreen(false);
                        requestAnimationFrame(() =>
                          document
                            .querySelector('.instruction-list')
                            ?.scrollIntoView({ block: 'center' }),
                        );
                      }}
                    >
                      命令表を見る
                    </button>
                  )}
                </div>
              )}
              <div className="code-toolbar">
                <div className="test-buttons">
                  <button className="primary" disabled={testing} onClick={() => check()}>
                    {testing ? '検証中…' : '▷ すべての命令をテスト'}
                  </button>
                  {testing && <button onClick={cancelTest}>テストを中止</button>}
                </div>
                <button
                  ref={fullscreenButton}
                  className="fullscreen-toggle"
                  aria-expanded={fullscreen}
                  onClick={() => setFullscreen((current) => !current)}
                >
                  {fullscreen ? '元に戻す' : '全画面'}
                </button>
              </div>
            </div>
            <div className="sub-actions">
              <button
                style={{ visibility: backup ? 'visible' : 'hidden' }}
                disabled={!backup}
                onClick={() => {
                  if (!backup) return;
                  replace(backup);
                  setBackup(undefined);
                  setNotice({ message: '置き換える前のコードに戻しました。' });
                }}
              >
                置き換えを取り消す
              </button>
              <button onClick={() => replace({ ...project, cpu: initialCode })}>
                配布コードに戻す
              </button>
            </div>
            <div className="hints">
              <details>
                <summary>
                  ヒント：次の値に代入する{' '}
                  <span className="hint-instructions">
                    （<code>MOV A, Im</code>、<code>JMP Im</code>、<code>IN B</code>、
                    <code>OUT B</code>、<code>OUT Im</code>）
                  </span>
                </summary>
                <p>
                  <code>next_b = a;</code>{' '}
                  は、今のAを「次にBへ記憶する値」にします。記憶する処理は用意済みです。共通処理で値を決めた後に、命令に応じて必要なものだけ上書きします。
                </p>
              </details>
              <details>
                <summary>
                  ヒント：加算と桁上がり{' '}
                  <span className="hint-instructions">
                    （<code>ADD A, Im</code>、<code>ADD B, Im</code>）
                  </span>
                </summary>
                <p>
                  <code>{'{上位1bit, 下位4bit}'}</code> と連結すると、5bitの結果を受け取れます。15 +
                  1 は <code>1_0000</code>。結果の下位4bitは0、桁上がりは1です。
                </p>
              </details>
              <details>
                <summary>
                  ヒント：条件で次の番地を選ぶ{' '}
                  <span className="hint-instructions">
                    （<code>JNC Im</code>）
                  </span>
                </summary>
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
                  命令コードには <code>opcode</code>{' '}
                  を使います。記憶処理は用意済みなので、次の値を決める処理を記述します。
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
              <br />
              正解を見たいときは「解答を入れる」を押すと、その命令の解答がコードに反映されます。
            </p>
            <div className="instruction-list">
              {instructions.map((i) => {
                const r = results[i.op],
                  passed = r && r.passed === r.total;
                return (
                  <div
                    key={i.op}
                    className={`instruction-row ${r ? (passed ? 'passed' : 'failed') : ''}`}
                    data-testid={`instruction-${i.op}`}
                    role="group"
                    aria-label={`${i.name}：${r ? (passed ? 'テスト成功' : 'テスト失敗') : '未検証'}`}
                  >
                    <div className="instruction-meta">
                      <code>{binary(i.op)}</code>
                      {i.reference && <span className="reference">参考</span>}
                      {i.difficult && <span className="difficulty">難しい</span>}
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
                        aria-label={`${i.name}の解答を入れる`}
                        disabled={testing}
                        onClick={() => fillAnswer(i.op)}
                      >
                        解答を入れる
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="common-note">
              共通処理：A・B・OUTは保持、IPは+1、CFは0。ADDだけがCFを上書きし、JNCは現在のCFを使います。
            </p>
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
                  スイッチで数え始める値を設定できるタイマーです。LEDの数字が増えるタイミングで、表示される残り時間も減ります。15を超えると残り時間が0になり、LEDと時間表示の点滅で終了を知らせます。
                </p>
                <p>
                  速度が「1命令／秒」のとき、開始から終了までの時間は約12〜162秒です。スイッチの値が大きいほど短くなります。途中でスイッチを変更した場合は、リセットして実行し直すと反映されます。
                </p>
              </div>
              <div className="rom-description">
                <h3>ROMコードの説明</h3>
                <p>
                  <code>addr</code> は命令を読み出す番地（0〜15）、<code>data</code>
                  はその番地の8bitの命令です。CPUが指定した番地に応じて、実行する命令を返します。使わない番地の値は{' '}
                  <code>default</code> で指定します。
                </p>
                <p>
                  たとえば、<code>8'b1011_0101</code> は、LEDに5を表示する命令 <code>OUT 5</code>{' '}
                  です。
                </p>
                <RomTips />
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
                <div className="input-description">
                  <h3>入力スイッチ</h3>
                  <p>
                    数え始める値を設定します。値が大きいほど、LEDが点滅するまでの待ち時間が短くなります。実行前に設定してください。
                  </p>
                </div>
                <div
                  className={`timer-readout ${timerFinished ? 'finished' : ''}`}
                  data-testid="timer"
                >
                  <span>残り時間（目安）</span>
                  <strong data-testid="remaining-time">
                    {remaining === undefined ? '—' : `${remaining}秒`}
                  </strong>
                  <span role="status">
                    {timerFinished ? (
                      <>
                        <i
                          className={`timer-light ${state.out === 15 ? 'lit' : ''}`}
                          aria-hidden="true"
                        />
                        時間です
                      </>
                    ) : !timerSupported ? (
                      '配布ROMで利用できます'
                    ) : countdown?.kind === 'unavailable' ? (
                      '命令の動作を確認してください'
                    ) : preparing ? (
                      '準備中…'
                    ) : !frame ? (
                      '実行前'
                    ) : running ? (
                      'カウント中'
                    ) : (
                      '停止中'
                    )}
                  </span>
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
                <p
                  className="switch-notice"
                  role="status"
                  style={{
                    visibility:
                      timerSupported && sampledInput !== undefined && input !== sampledInput
                        ? 'visible'
                        : 'hidden',
                  }}
                >
                  スイッチを反映する場合はリセット
                </p>
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
