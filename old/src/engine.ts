import type { EngineResult, SourceFile } from './types';

export function simulate(files: SourceFile[], onStage?: (stage: string) => void) {
  const worker = new Worker(new URL('simulation-worker.js', document.baseURI), { type: 'module' });
  let rejectPromise: (error: Error) => void = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<EngineResult>((resolve, reject) => {
    rejectPromise = reject;
    timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          '実行に時間がかかりすぎたため停止しました。ループやクロックの記述を確認してください。',
        ),
      );
    }, 15000);
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(
        new Error(
          '実行エンジンを読み込めませんでした。ページを再読み込みするか、開発時は npm run setup:engine を実行してください。',
        ),
      );
    };
    worker.onmessage = ({ data }) => {
      if (data.stage) {
        onStage?.(data.stage);
        return;
      }
      clearTimeout(timer);
      worker.terminate();
      resolve(data as EngineResult);
    };
    worker.postMessage({ files });
  });
  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      worker.terminate();
      rejectPromise(new DOMException('中止しました。', 'AbortError'));
    },
  };
}
