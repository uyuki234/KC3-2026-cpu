最初にAIと壁打ちして作ってもらったものです。結局、人力で作るほうがいい講義ができそうだったので使わないことにしました。

# TD4 / LAB — Verilogで学ぶCPU自作入門

1時間の講義で、加算器・レジスタ・PCのVerilogを実装して、TD4の命令実行を観察するWebハンズオンです。

## 起動

Node.js 24 LTSを推奨します（最低22.12）。

```sh
npm ci
npm run dev
```

表示されたURL（通常 `http://127.0.0.1:5173`）を開きます。このWindows作業環境には `.tools/` にNode.jsを用意してあるので、PATHを変更せず次でも起動できます。

```powershell
.\scripts\dev.ps1
```

初回は固定バージョンのIcarus WASMを取得します。検証用の `spikes/icarus-browser/vendor/` があればそこからコピーします。6つのJS/WASMはSHA-256を照合し、`public/engine/` に配置します。生成ファイルとNode.js本体はGit管理対象外です。

## できること

1. **完成例を見る** — 完成済み回路の命令実行、PC・A・B・OUT・C、出力LEDを観察。
2. **回路をつくる** — 加算器・レジスタ・PCをCodeMirrorで編集。段階別ヒント、解答例、期待値と実出力の比較、エラー行への移動。
3. **自分のCPUを動かす** — 受講者の3モジュールをCPUに接続。命令単位の進行・巻き戻し・自動再生、ROM編集、入力スイッチ、状態履歴。

コード・検証済み進捗・ROMはlocalStorageへ自動保存します。JSONで書き出し・読み込みができ、読み込みと雛形・解答への置き換えは取り消せます。読み込んだコードは再検証が必要です。画面の実行位置と入力履歴は再読み込み時にリセットします。

VerilogとROMは別です。Verilogは回路を記述し、ROMの命令はその回路を使って実行されます。CPUの演算結果は、実際にコンパイルした受講者のVerilogから取得します。

## 実行方式

- React + TypeScript + Vite。静的ファイルだけで動きます。
- Icarus VerilogのWASM版をブラウザのWeb Workerで実行します。サーバー側のネイティブコマンド、バックエンド、Cloudflare Workersは使いません。
- まず256命令分の状態を計算し、画面で再生します。最大4096命令まで延長できます。
- 途中で入力を変えると、その時点以降の入力を置き換え、保存した入力履歴でリセットから再計算します。
- コード・ROMが変わったときの古い結果は利用しません。Workerの中止、15秒のタイムアウト、ログ量の上限があります。
- 未確定値のX/Zは0に変換せず表示します。
- 基本12命令形式を対象とします。電気的特性やゲート遅延、原著回路との全符号・全状態での完全互換は対象外です。

## ビルド・検証

```sh
npm run build
npm test
npm run test:e2e
npm run preview
```

ブラウザテストにはインストール済みのGoogle Chromeを使います。`test:e2e` はビルド済みの `dist/` を配信するため、変更後は先に `npm run build` を実行してください。

`npm run format` でアプリのソースを整形できます。講義原稿と検証スパイクは整形対象に含めていません。

## ファイル構成

| 場所 | 内容 |
| --- | --- |
| `src/App.tsx` | 学習ステップ、保存、インポート・エクスポート |
| `src/LessonPanel.tsx`, `src/Editor.tsx` | 課題・ヒント・Verilog編集・検証 |
| `src/CpuPanel.tsx` | 命令再生、状態・LED・概念図、ROM、入力 |
| `src/cpu.ts` | 提供するCPU配線、生成テストベンチ、トレースの読み取り |
| `src/lessons.ts` | 課題文・雛形・解答例 |
| `src/engine.ts`, `public/simulation-worker.js` | Workerの管理とIcarusの実行 |
| `scripts/setup-engine.mjs` | 配信するエンジンの取得・照合と教材コピー |
| `tests/` | Chromeによる本番ビルドの操作・Verilog実行テスト |
| `docs/` | 講義原稿・補足・設計・技術検証 |
| `spikes/icarus-browser/` | 実行エンジンの初期検証と固定資産のマニフェスト |

講義原稿: [本編](docs/lecture-slides.md) / [補足・ヒント](docs/lecture-appendix.md) / [講義計画](docs/lecture-plan.md)。

## Cloudflare Pages

想定設定は本番ブランチ `main`、ビルド `npm run build`、出力 `dist`、Node.js 24です。ビルド時のみエンジン取得用の外部通信が必要で、利用時の外部CDN依存はありません。ルートURLへの配信を想定しています。

GitHub連携、自動デプロイ、`cpu.uyuki.xyz` の設定はまだ行っていません。Pages上での実動作とChrome以外のブラウザも未検証です。

## エンジンの配布とライセンス

既存の [MIT LICENSE](LICENSE) は変更していません。Icarus WASMは別のライセンスで、配布元はGPL-2.0-or-laterと記載しています。取得元・コミット・ハッシュは [vendor-manifest.json](spikes/icarus-browser/vendor-manifest.json) に固定し、配布元のLICENSEとREADMEをエンジンと一緒に配置します。

**公開配布前の残作業:** このWASMに対応する移植パッチ・ビルド手順を含むソース一式と、その提供方法の確定。現在はローカルでの動作検証段階です。詳細は [技術検証メモ](docs/technical-validation.md) を参照してください。
