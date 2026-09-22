import { useEffect, useRef, useState } from 'react';
import { Editor } from './Editor';
import { lessons } from './lessons';
import { lessonFiles, parseTests } from './cpu';
import { simulate } from './engine';
import type { LessonId, TestRow } from './types';

export function LessonPanel({
  id,
  source,
  passed,
  onChange,
  onPass,
  onNext,
}: {
  id: LessonId;
  source: string;
  passed: boolean;
  onChange: (s: string) => void;
  onPass: (s: string) => void;
  onNext: () => void;
}) {
  const lesson = lessons.find((l) => l.id === id)!;
  const [rows, setRows] = useState<TestRow[]>([]);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [previous, setPrevious] = useState<string>();
  const [location, setLocation] = useState<{ line: number; key: number }>();
  const job = useRef<ReturnType<typeof simulate> | null>(null);
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
      job.current?.cancel();
    },
    [],
  );
  function edit(s: string) {
    version.current++;
    job.current?.cancel();
    job.current = null;
    setStage('');
    setRows([]);
    setError('');
    setDiagnostics([]);
    onChange(s);
  }
  async function run() {
    job.current?.cancel();
    const ticket = ++version.current;
    setRows([]);
    setError('');
    setDiagnostics([]);
    setStage('実行エンジンを準備中…');
    try {
      const task = simulate(lessonFiles(id, source), setStage);
      job.current = task;
      const result = await task.promise;
      if (ticket !== version.current) return;
      setDiagnostics(result.diagnostics);
      if (!result.ok) throw new Error(result.error || 'コンパイルに失敗しました。');
      const tests = parseTests(result.output, id);
      setRows(tests);
      if (tests.every((row) => row.pass)) onPass(source);
    } catch (e) {
      if (ticket === version.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (ticket === version.current) {
        setStage('');
        job.current = null;
      }
    }
  }
  function replace(s: string) {
    setPrevious(source);
    edit(s);
  }
  const failed = rows.filter((r) => !r.pass);
  return (
    <div className="lesson-grid">
      <section className="lesson-notes">
        <p className="eyebrow">
          CHALLENGE {lesson.number} / {lesson.minutes} MIN
        </p>
        <h2>{lesson.title}をつくる</h2>
        <p>{lesson.summary}</p>
        <div className="question">{lesson.question}</div>
        <h3>この回路がすること</h3>
        <ol className="conditions">
          {lesson.conditions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <details>
          <summary>入出力の信号を確認する</summary>
          <table>
            <tbody>
              {lesson.ports.map(([port, width, description]) => (
                <tr key={port}>
                  <th>
                    <code>{port}</code>
                  </th>
                  <td>
                    {width}
                    <small>{description}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <pre className="example">{lesson.example}</pre>
        <h3>困ったときは</h3>
        {lesson.hints.map((hint, i) => (
          <details key={hint} className="hint">
            <summary>
              ヒント {i + 1}
              <span>{['考え方', 'Verilogの書き方', 'あと一歩'][i]}</span>
            </summary>
            <p className="preserve">{hint}</p>
          </details>
        ))}
        <details className="hint">
          <summary>解答例を見る</summary>
          <p>コードの動きを確かめてから、もう一度自分で書いてみよう。</p>
          <pre>{lesson.answer}</pre>
          <button onClick={() => replace(lesson.answer)}>解答例をエディタに入れる</button>
        </details>
      </section>
      <section className="workspace">
        <div className="editor-title">
          <span>
            <i className="file-dot" />
            {id === 'register' ? 'register4' : id === 'adder' ? 'adder4' : 'pc4'}.v
          </span>
          <span>Verilog · TODOを編集</span>
        </div>
        <Editor
          value={source}
          onChange={edit}
          onRun={() => {
            if (!job.current) void run();
          }}
          location={location}
        />
        <div className="editor-toolbar">
          <div>
            <button className="primary" disabled={!!stage} onClick={() => void run()}>
              ▷ 動作を確認する
            </button>
            {stage && (
              <button
                onClick={() => {
                  version.current++;
                  job.current?.cancel();
                  job.current = null;
                  setStage('');
                  setError('実行を中止しました。');
                }}
              >
                中止
              </button>
            )}
          </div>
          <span className="shortcut">Ctrl / ⌘ + Enter</span>
        </div>
        <div className="minor-actions">
          <button className="text-button" onClick={() => replace(lesson.initial)}>
            雛形に戻す
          </button>
          {previous !== undefined && (
            <button
              className="text-button"
              onClick={() => {
                const old = previous;
                setPrevious(source);
                edit(old);
              }}
            >
              直前の置き換えを取り消す
            </button>
          )}
        </div>
        <div className="results" aria-live="polite">
          <div className="section-label">
            TEST RESULTS <span>期待値と、回路からの出力を比較</span>
          </div>
          {stage ? (
            <p className="loading">{stage}</p>
          ) : error ? (
            <p className="error">{error}</p>
          ) : rows.length ? (
            <>
              <h3 className={failed.length ? 'failed' : 'success'}>
                {failed.length ? 'もう少し。結果を見比べてみよう' : 'この回路は完成！'}
              </h3>
              <p data-testid="test-summary">
                {rows.length - failed.length} / {rows.length} ケース成功
              </p>
            </>
          ) : (
            <p className="muted">
              {passed
                ? 'このコードは検証済みです。もう一度実行して結果を確認できます。'
                : 'コードを書いたら「動作を確認する」を押そう。'}
            </p>
          )}
          {!!diagnostics.length && (
            <details open={!!error}>
              <summary>コンパイラからのメッセージ</summary>
              {diagnostics.map((line, i) => {
                const match = line.match(/(?:adder4|register4|pc4)\.v:(\d+)/);
                return (
                  <div key={i} className="diagnostic">
                    {match ? (
                      <button
                        onClick={() => setLocation({ line: Number(match[1]), key: Date.now() })}
                      >
                        {line}
                      </button>
                    ) : (
                      <code>{line}</code>
                    )}
                  </div>
                );
              })}
            </details>
          )}
          {!!rows.length && (
            <>
              <div className="table-scroll">
                <table className="test-table">
                  <thead>
                    <tr>
                      <th>確認すること / 入力</th>
                      <th>期待値</th>
                      <th>実際の値</th>
                      <th>結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(failed.length ? failed : rows).slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td>
                          {r.name}
                          <small>{r.input}</small>
                        </td>
                        <td>
                          <code>{r.expected}</code>
                        </td>
                        <td>
                          <code>{r.actual}</code>
                        </td>
                        <td className={r.pass ? 'success' : 'failed'}>
                          {r.pass ? '✓' : '違いあり'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                {failed.length
                  ? `失敗した ${failed.length} 件から先頭8件までを表示。`
                  : '成功したケースから先頭8件を表示。'}{' '}
                値は2進数です。
              </p>
              {!failed.length && (
                <button className="primary" onClick={onNext}>
                  {id === 'pc' ? '自分のCPUを動かす →' : '次の回路へ →'}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
