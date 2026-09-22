import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CpuPanel } from './CpuPanel';
import { answerSources, lessons } from './lessons';
import { loadProject, storageKey, validateProject } from './storage';
import type { LessonId, Mode, SavedProject } from './types';

const LessonPanel = lazy(() =>
  import('./LessonPanel').then((module) => ({ default: module.LessonPanel })),
);

export default function App() {
  const [loaded] = useState(loadProject);
  const [project, setProject] = useState(loaded.project);
  const [mode, setMode] = useState<Mode>('observe');
  const [lesson, setLesson] = useState<LessonId>('adder');
  const [saveStatus, setSaveStatus] = useState('');
  const [message, setMessage] = useState(loaded.warning || '');
  const [backup, setBackup] = useState<SavedProject>();
  const [importVersion, setImportVersion] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const completed = lessons.filter((l) => project.passed[l.id] === project.sources[l.id]).length;
  useEffect(() => {
    setSaveStatus('保存中…');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(project));
        setSaveStatus('このブラウザに保存済み');
      } catch {
        setSaveStatus('保存できません。書き出しをご利用ください');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [project]);
  function exportProject() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'td4-project.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProject(selected?: File) {
    if (!selected) return;
    try {
      if (selected.size > 150000)
        throw new Error('ファイルが大きすぎます。150KB以内のプロジェクトを選んでください。');
      const next = validateProject(JSON.parse(await selected.text()));
      next.passed = {};
      setBackup(project);
      setImportVersion((n) => n + 1);
      setProject(next);
      setMode('build');
      setMessage('プロジェクトを読み込みました。課題の動作をもう一度確認してください。');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'ファイルを読み込めませんでした。');
    } finally {
      if (file.current) file.current.value = '';
    }
  }
  return (
    <>
      <header className="site-header">
        <a
          href="#"
          className="brand"
          aria-label="TD4 LAB ホーム"
          onClick={(e) => {
            e.preventDefault();
            setMode('observe');
          }}
        >
          <span className="brand-icon">▦</span>
          <strong>
            TD4<span> / LAB</span>
          </strong>
          <span className="brand-caption">小さなCPUを、自分の手で。</span>
        </a>
        <div className="project-actions">
          <span className="save-status">{saveStatus}</span>
          <button onClick={exportProject}>書き出し</button>
          <button onClick={() => file.current?.click()}>読み込み</button>
          <input
            ref={file}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(e) => void importProject(e.target.files?.[0])}
          />
        </div>
      </header>
      <main className="page-shell">
        <nav className="main-tabs" aria-label="学習のステップ">
          {(
            [
              { id: 'observe', number: '01', title: '完成例を見る' },
              { id: 'build', number: '02', title: '回路をつくる' },
              { id: 'run', number: '03', title: '自分のCPUを動かす' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              aria-current={mode === tab.id ? 'step' : undefined}
              className={mode === tab.id ? 'selected' : ''}
              onClick={() => setMode(tab.id)}
            >
              <span>{tab.number}</span>
              {tab.title}
            </button>
          ))}
          <span className="progress-label">{completed} / 3 回路完成</span>
        </nav>
        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button onClick={() => setMessage('')} aria-label="通知を閉じる">
              ×
            </button>
            {backup && (
              <button
                onClick={() => {
                  setImportVersion((n) => n + 1);
                  setProject(backup);
                  setBackup(undefined);
                  setMessage('読み込む前のプロジェクトに戻しました。');
                }}
              >
                読み込みを取り消す
              </button>
            )}
          </div>
        )}
        {mode === 'observe' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">VERILOGで学ぶCPU自作入門</p>
                <h1>
                  小さな回路から、<span>CPUをつくろう。</span>
                </h1>
                <p>
                  足す。覚える。次へ進む。
                  <br />
                  3つの回路をVerilogで書いて、4ビットのCPUを動かそう。
                </p>
              </div>
              <div className="hero-action">
                <span className="pill">ブラウザだけで、実機のしくみへ</span>
                <button className="primary" onClick={() => setMode('build')}>
                  回路づくりを始める ↗
                </button>
                <p>まずは下の完成例を、1命令ずつ動かしてみよう。</p>
              </div>
            </section>
            <CpuPanel
              key={`example:${importVersion}`}
              sources={answerSources}
              rom={project.rom}
              onRom={(rom) => setProject((p) => ({ ...p, rom }))}
              own={false}
            />
          </>
        )}
        {mode === 'build' && (
          <>
            <div className="page-title">
              <div>
                <p className="eyebrow">BUILD YOUR CIRCUIT</p>
                <h1>CPUをつくる、3つのステップ。</h1>
                <p>雛形のTODOを埋めよう。デコーダや配線は、用意してあります。</p>
              </div>
              <span className="pill">{completed} / 3 完成</span>
            </div>
            <div className="lesson-tabs" aria-label="課題を選ぶ">
              {lessons.map((l) => (
                <button
                  key={l.id}
                  className={lesson === l.id ? 'selected' : ''}
                  onClick={() => setLesson(l.id)}
                >
                  <span>{project.passed[l.id] === project.sources[l.id] ? '✓' : l.number}</span>
                  <div>
                    <strong>{l.title}</strong>
                    <small>{l.english}</small>
                  </div>
                  <span className="lesson-time">約{l.minutes}分</span>
                </button>
              ))}
            </div>
            <Suspense fallback={<p className="loading">エディタを準備中…</p>}>
              <LessonPanel
                key={`${lesson}:${importVersion}`}
                id={lesson}
                source={project.sources[lesson]}
                passed={project.passed[lesson] === project.sources[lesson]}
                onChange={(source) =>
                  setProject((p) => ({ ...p, sources: { ...p.sources, [lesson]: source } }))
                }
                onPass={(source) =>
                  setProject((p) => ({ ...p, passed: { ...p.passed, [lesson]: source } }))
                }
                onNext={() => {
                  const next = lessons[lessons.findIndex((l) => l.id === lesson) + 1];
                  if (next) setLesson(next.id);
                  else setMode('run');
                }}
              />
            </Suspense>
          </>
        )}
        {mode === 'run' && (
          <>
            <div className="page-title">
              <div>
                <p className="eyebrow">RUN YOUR CPU</p>
                <h1>書いた回路が、CPUになる。</h1>
                <p>加算器・レジスタ・PCを接続しました。命令を実行して、動きを確かめよう。</p>
              </div>
              <span className="pill">
                {completed === 3 ? '✓ 3つの回路を検証済み' : `${completed} / 3 回路を検証済み`}
              </span>
            </div>
            {completed < 3 && (
              <div className="notice">
                未検証の回路があります。現在のコードで実行するため、完成例と異なる動きをすることがあります。
                <button onClick={() => setMode('build')}>課題を確認する</button>
              </div>
            )}
            <CpuPanel
              key={`own:${importVersion}`}
              sources={project.sources}
              rom={project.rom}
              onRom={(rom) => setProject((p) => ({ ...p, rom }))}
              own
            />
          </>
        )}
        <section className="learning-footer">
          <div>
            <p className="eyebrow">KEEP EXPLORING</p>
            <h3>しくみを振り返って、もう一歩。</h3>
            <p>ヒントや命令一覧、次の練習問題も用意しています。</p>
          </div>
          <div>
            <a href="materials/lecture-slides.md" download>
              講義ノート ↗
            </a>
            <a href="materials/lecture-appendix.md" download>
              補足・ヒント集 ↗
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>TD4 / LAB · Verilogで学ぶCPU自作入門</span>
        <span>
          計算はこのブラウザ内で実行 ·{' '}
          <a href="engine/LICENSE" target="_blank" rel="noreferrer">
            Icarus Verilog ライセンス
          </a>
        </span>
      </footer>
    </>
  );
}
