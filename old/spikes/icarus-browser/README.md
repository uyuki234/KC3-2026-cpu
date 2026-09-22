# Icarus WASM / TD4 技術検証

アプリ本体とは独立した、依存パッケージ不要の検証ページ。
実行エンジンは第三者の公開WASMをローカル取得して使用する。

設計は[画面・教材設計](../../docs/design.md)、比較と制約は[技術検証メモ](../../docs/technical-validation.md)を参照。

## 再現手順（Windows / PowerShell 7）

リポジトリのルートで実行する。

```powershell
pwsh -NoProfile -File spikes/icarus-browser/fetch-vendor.ps1
pwsh -NoProfile -File spikes/icarus-browser/run-probe.ps1
```

1つ目は固定コミットからJS/WASMと配布元のライセンス・READMEを取得する。2つ目は静的サーバーと専用プロファイルのヘッドレスChromeを起動し、10項目の検証を実行する。結果を表示して両プロセスを終了する。失敗時は非ゼロ終了する。

Chromeの既定の場所は`C:\Program Files\Google\Chrome\Application\chrome.exe`。別の場所なら`-Browser`、ポートを変えるなら`-Port`を指定する。再実行には未使用のポートが必要。

画面で見る場合は次のサーバーを起動し、`http://127.0.0.1:8097/`を開く。

```powershell
pwsh -NoProfile -File spikes/icarus-browser/serve.ps1
```

サーバーは結果を受信するか180秒経つと終了する。`POST /__result`はこの検証でローカルファイルに結果を保存するためだけの機能で、製品のバックエンドには使用しない。シミュレーションはWorker内で実行される。

## ファイル

- `td4.v`: 検証用のCPU。最終的な課題分割・教材用雛形ではない。
- `probe.js`: テストベンチ生成、明示的な期待値、10項目の検証。
- `worker.js`: 前処理→コンパイル→実行のWASM呼び出し。
- `vendor-manifest.json`: 検証に使った配布元のコミット、ファイルサイズ、SHA-256。
- `results.chrome.json`: 最終成功実行の記録。計測の範囲は技術検証メモを参照。
- `vendor/`: ダウンロードした依存物。Git対象外。
- `artifacts/`: 最新の結果、ローカルサーバーログ、専用ブラウザプロファイル。Git対象外。

`vendor/`のWASMは配布元によればGPLのIcarus由来。取得した`vendor/LICENSE`と`vendor/README.md`を参照。検証用バイナリを本番へ配布する前に、対応ソース・移植パッチ・ビルド手順と提供方法を確定する。

成功している範囲は基本命令と今回のテストケース。原著回路との完全互換、全Verilog構文、全ブラウザでの動作を保証するものではない。
