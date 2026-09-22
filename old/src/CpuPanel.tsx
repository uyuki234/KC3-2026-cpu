import { useEffect, useRef, useState } from 'react';
import {
  binaryValue,
  bits,
  branchInputs,
  cpuFiles,
  fillRom,
  hex,
  inputAt,
  instructions,
  instructionText,
  parseFrames,
  programs,
} from './cpu';
import { simulate } from './engine';
import type { CpuState, Frame, InputEvent, Sources } from './types';

function valueLabel(value: string) {
  const n = binaryValue(value);
  return n === null ? value.toUpperCase() : String(n);
}
function Circuit({ state }: { state: CpuState }) {
  return (
    <svg
      viewBox="0 0 600 260"
      role="img"
      aria-label="PCがROMの命令を選び、入力選択と加算器を通じてレジスタを更新するCPUの構成図"
      className="circuit"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8da1bf" />
        </marker>
      </defs>
      <g fill="none" stroke="#7185a7" strokeWidth="2" markerEnd="url(#arrow)">
        <path d="M100 76H157" />
        <path d="M390 76H451" />
        <path d="M515 108V154" />
        <path d="M199 108V154" />
        <path d="M199 44V30H515V43" />
        <path d="M578 188H590V131H341V109" />
        <path d="M100 186H120V137H308V109" />
      </g>
      <g
        fill="none"
        stroke="#7b86b1"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        markerEnd="url(#arrow)"
      >
        <path d="M250 187H449" />
        <path d="M225 155V123H365V109" />
        <path d="M175 155V123H60V109" />
      </g>
      <g>
        {[
          { x: 20, y: 44, w: 80, title: 'PC', value: valueLabel(state.pc) },
          { x: 158, y: 44, w: 82, title: 'ROM', value: '16 × 8 bit' },
          { x: 292, y: 44, w: 98, title: '入力選択', value: 'A / B / IN / 0' },
          { x: 452, y: 44, w: 126, title: '加算器', value: '+ 即値' },
          {
            x: 450,
            y: 155,
            w: 128,
            title: 'レジスタ A / B / OUT',
            value: `${valueLabel(state.a)} / ${valueLabel(state.b)} / ${valueLabel(state.out)}`,
          },
          { x: 20, y: 155, w: 80, title: '入力', value: 'IN' },
          { x: 150, y: 155, w: 100, title: 'デコーダ', value: '命令を解釈' },
        ].map((n) => (
          <g key={n.title}>
            <rect x={n.x} y={n.y} width={n.w} height="64" rx="10" />
            <text x={n.x + n.w / 2} y={n.y + 23} textAnchor="middle" className="node-title">
              {n.title}
            </text>
            <text x={n.x + n.w / 2} y={n.y + 46} textAnchor="middle">
              {n.value}
            </text>
          </g>
        ))}
      </g>
      <text x="30" y="24" className="circuit-caption">
        TD4 / 4-BIT CPU
      </text>
      <text x="355" y="22" textAnchor="middle" className="circuit-caption">
        即値
      </text>
      <text x="300" y="244" textAnchor="middle" className="circuit-caption">
        データ経路の概略（実線）/ 制御（点線）· 一部の配線を省略
      </text>
    </svg>
  );
}

export function CpuPanel({
  sources,
  rom,
  onRom,
  own,
}: {
  sources: Sources;
  rom: number[];
  onRom: (rom: number[]) => void;
  own: boolean;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [cursor, setCursor] = useState(0);
  const [events, setEvents] = useState<InputEvent[]>([]);
  const [limit, setLimit] = useState(256);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(650);
  const job = useRef<ReturnType<typeof simulate> | null>(null);
  const request = useRef(0);
  async function execute(nextEvents: InputEvent[], nextCursor = 0, nextLimit = limit) {
    job.current?.cancel();
    const ticket = ++request.current;
    setPlaying(false);
    setError('');
    setStage('実行エンジンを準備中…');
    setFrames([]);
    try {
      const task = simulate(cpuFiles(sources, rom, nextEvents, nextLimit), setStage);
      job.current = task;
      const result = await task.promise;
      if (ticket !== request.current) return;
      if (!result.ok) throw new Error([result.error, ...result.diagnostics].join('\n'));
      setFrames(parseFrames(result.output, nextLimit));
      setCursor(nextCursor);
      setDirty(false);
    } catch (e) {
      if (ticket === request.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (ticket === request.current) {
        job.current = null;
        setStage('');
      }
    }
  }
  useEffect(() => {
    void execute([]);
    return () => {
      request.current++;
      job.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setCursor((n) => {
          if (n >= frames.length - 1) {
            setPlaying(false);
            return n;
          }
          return n + 1;
        }),
      speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, frames.length]);
  function editRom(next: number[]) {
    request.current++;
    job.current?.cancel();
    job.current = null;
    setStage('');
    setPlaying(false);
    setFrames([]);
    setCursor(0);
    setEvents([]);
    setError('');
    setDirty(true);
    onRom(next);
  }
  const frame = frames[cursor];
  const state = frame?.state;
  const previous = frames[Math.max(0, cursor - 1)]?.state;
  const currentInput = inputAt(events, cursor);
  const currentPc = state ? binaryValue(state.pc) : null;
  const executed = frame ? binaryValue(frame.instruction) : null;
  const ready = !!frame && !stage && !dirty;
  return (
    <div className="simulation-grid">
      <section className="simulation-main">
        <div className="cpu-display">
          <div className="display-top">
            <span className="eyebrow">{own ? 'YOUR CPU' : 'EXAMPLE CPU'} / LIVE VIEW</span>
            <span className="clock-count" data-testid="cycle">
              CLOCK {cursor.toString().padStart(3, '0')}
            </span>
          </div>
          <div className="led-section">
            <div>
              <p className="eyebrow">OUTPUT</p>
              <h2>
                4つのLEDへ、
                <br />
                計算の結果を。
              </h2>
            </div>
            <div
              className="led-bank"
              aria-label={`出力LED ${state?.out ?? '未実行'}`}
              data-testid="leds"
            >
              {[3, 2, 1, 0].map((bit, i) => (
                <div key={bit}>
                  <span
                    className={`led ${state?.out[i] === '1' ? 'on' : state?.out[i] && state.out[i] !== '0' ? 'unknown' : ''}`}
                  >
                    {state ? state.out[i].toUpperCase() : '–'}
                  </span>
                  <small>BIT {bit}</small>
                </div>
              ))}
            </div>
          </div>
          {state ? (
            <Circuit state={state} />
          ) : (
            <div className="circuit-placeholder">
              {stage ||
                (dirty
                  ? 'ROMを反映すると、CPUをリセットして実行できます。'
                  : '実行結果を待っています。')}
            </div>
          )}
          <div className="registers">
            {(['pc', 'a', 'b', 'out', 'carry'] as const).map((key) => (
              <div
                key={key}
                className={previous && state && previous[key] !== state[key] ? 'changed' : ''}
              >
                <span>{key === 'carry' ? 'CARRY' : key.toUpperCase()}</span>
                <strong data-testid={`register-${key}`}>
                  {state ? valueLabel(state[key]) : '–'}
                </strong>
                <code>{state?.[key] ?? (key === 'carry' ? '–' : '––––')}</code>
              </div>
            ))}
          </div>
        </div>
        <div className="playback">
          <div className="transport">
            <button
              aria-label="リセット"
              onClick={() => {
                setEvents([]);
                setCursor(0);
                void execute([]);
              }}
            >
              ↺ リセット
            </button>
            <button
              disabled={!ready || cursor === 0}
              aria-label="1命令戻る"
              onClick={() => {
                setPlaying(false);
                setCursor((n) => n - 1);
              }}
            >
              ←
            </button>
            <button
              className="primary"
              disabled={!ready || cursor >= limit}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? 'Ⅱ 一時停止' : '▷ 自動再生'}
            </button>
            <button
              disabled={!ready || cursor >= limit}
              onClick={() => {
                setPlaying(false);
                setCursor((n) => n + 1);
              }}
            >
              1命令進む →
            </button>
          </div>
          <label className="speed">
            速さ
            <select
              aria-label="再生速度"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={1200}>ゆっくり</option>
              <option value={650}>ふつう</option>
              <option value={200}>はやく</option>
            </select>
          </label>
        </div>
        <div className="run-status" aria-live="polite">
          {stage && (
            <p className="loading">
              {stage}{' '}
              <button
                onClick={() => {
                  request.current++;
                  job.current?.cancel();
                  job.current = null;
                  setStage('');
                  setError('実行を中止しました。リセットで再実行できます。');
                }}
              >
                中止
              </button>
            </p>
          )}
          {error && <pre className="error">{error}</pre>}
          {dirty && (
            <button className="primary" onClick={() => void execute([])}>
              ROMを反映してリセット
            </button>
          )}
          {cursor >= limit && ready && (
            <p>
              {limit}命令まで実行しました。
              {limit < 4096 ? (
                <button
                  onClick={() => {
                    const n = Math.min(limit * 2, 4096);
                    setLimit(n);
                    void execute(events, cursor, n);
                  }}
                >
                  続きを準備する
                </button>
              ) : (
                '上限の4096命令に達しました。リセットで最初から実行できます。'
              )}
            </p>
          )}
        </div>
        <section className="instruction-card">
          <div className="section-label">このクロックで起きたこと</div>
          {frame && cursor > 0 ? (
            <>
              <h3>
                <span className="address">{valueLabel(frame.executedPc)}番地</span>{' '}
                {executed === null ? '命令が未確定です' : instructionText(executed)}
              </h3>
              <div className="transitions">
                {(['pc', 'a', 'b', 'out', 'carry'] as const).map((key) => (
                  <span key={key} className={previous?.[key] !== state?.[key] ? 'changed' : ''}>
                    {key.toUpperCase()}{' '}
                    <code>
                      {previous ? valueLabel(previous[key]) : '–'} →{' '}
                      {state ? valueLabel(state[key]) : '–'}
                    </code>
                  </span>
                ))}
              </div>
              <p className="muted">
                加算器の出力: <code>{frame.sum}</code>（左端がキャリー） / 入力:{' '}
                <code>{frame.input}</code>
              </p>
            </>
          ) : (
            <p className="muted">リセット直後です。「1命令進む」で、最初の命令を実行しよう。</p>
          )}
          <p className="next-instruction">
            次の命令{' '}
            <strong>
              {currentPc !== null ? `${currentPc}番地 · ${instructionText(rom[currentPc])}` : '—'}
            </strong>
          </p>
        </section>
        <section className="input-card">
          <div>
            <h3>入力スイッチ</h3>
            <p className="muted">IN命令で読み取る4ビットの値。</p>
          </div>
          <div className="switches">
            {[3, 2, 1, 0].map((bit) => (
              <button
                key={bit}
                aria-label={`入力ビット${bit}`}
                aria-pressed={!!(currentInput & (1 << bit))}
                disabled={!ready || cursor >= 4096}
                onClick={() => {
                  const next = branchInputs(events, cursor, currentInput ^ (1 << bit));
                  setEvents(next);
                  void execute(next, cursor);
                }}
              >
                <small>{bit}</small>
                {(currentInput >> bit) & 1}
              </button>
            ))}
          </div>
          <p className="muted input-note">
            現在の時点から入力を変更します。前へ戻って変更すると、その先の入力履歴を置き換えます。
          </p>
        </section>
        <details className="history">
          <summary>命令の実行履歴を見る（直近32命令）</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>時点</th>
                  <th>実行した命令</th>
                  <th>PC</th>
                  <th>A</th>
                  <th>B</th>
                  <th>OUT</th>
                  <th>C</th>
                </tr>
              </thead>
              <tbody>
                {frames.slice(Math.max(1, cursor - 31), cursor + 1).map((f) => (
                  <tr key={f.cycle}>
                    <td>
                      <button
                        onClick={() => {
                          setPlaying(false);
                          setCursor(f.cycle);
                        }}
                      >
                        {f.cycle}
                      </button>
                    </td>
                    <td>
                      {binaryValue(f.instruction) === null
                        ? 'X'
                        : instructionText(binaryValue(f.instruction)!)}
                    </td>
                    {(['pc', 'a', 'b', 'out', 'carry'] as const).map((k) => (
                      <td key={k}>{valueLabel(f.state[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <aside className="rom-panel">
        <div className="section-label">
          PROGRAM ROM <span>16 WORDS / 8 BIT</span>
        </div>
        <h3>CPUが読むプログラム</h3>
        <label>
          サンプルを読み込む
          <select
            aria-label="サンプルプログラム"
            value=""
            onChange={(e) => {
              const program = programs.find((p) => p.id === e.target.value);
              if (program) editRom(fillRom(program.bytes));
            }}
          >
            <option value="" disabled>
              プログラムを選択
            </option>
            {programs.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          左の4ビットが命令、右の4ビットが即値です。値と番地は10進数で入力します。
        </p>
        <div className="rom-table">
          <div className="rom-heading">
            <span>番地</span>
            <span>命令 / 即値</span>
            <span>機械語</span>
          </div>
          {rom.map((byte, i) => {
            const op = instructions.find((o) => o.opcode === byte >> 4);
            return (
              <div key={i} className={`rom-row ${currentPc === i && !dirty ? 'active' : ''}`}>
                <span className="rom-address">{i.toString().padStart(2, '0')}</span>
                <div className="rom-edit">
                  <select
                    aria-label={`${i}番地の命令`}
                    value={byte >> 4}
                    onChange={(e) => {
                      const code = Number(e.target.value);
                      editRom(
                        rom.map((b, j) =>
                          i === j
                            ? (code << 4) |
                              (instructions.find((o) => o.opcode === code)?.immediate
                                ? byte & 15
                                : 0)
                            : b,
                        ),
                      );
                    }}
                  >
                    {!op && <option value={byte >> 4}>未定義</option>}
                    {instructions.map((o) => (
                      <option key={o.opcode} value={o.opcode}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`${i}番地の即値`}
                    type="number"
                    min="0"
                    max="15"
                    disabled={!op?.immediate}
                    value={byte & 15}
                    onChange={(e) => {
                      const n = e.target.valueAsNumber;
                      if (Number.isInteger(n) && n >= 0 && n <= 15)
                        editRom(rom.map((b, j) => (j === i ? (byte & 240) | n : b)));
                    }}
                  />
                </div>
                <code title={bits(byte, 8)}>{hex(byte, 2)}</code>
              </div>
            );
          })}
        </div>
        <p className="muted">青い行は次に実行する命令。機械語は16進数です。</p>
        <details>
          <summary>TD4の約束</summary>
          <p>
            レジスタは4ビット（0〜15）、ROMは16命令。Cは桁上がりで1になり、すべての命令で更新されます。JNCは更新前のCが0ならジャンプします。
          </p>
          <p>X / Zは未確定の信号です。0とは区別して表示します。</p>
        </details>
      </aside>
    </div>
  );
}
