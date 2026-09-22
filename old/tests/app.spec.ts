import { expect, test } from '@playwright/test';
import { answerSources } from '../src/lessons';
import { cpuFiles, fillRom, parseFrames } from '../src/cpu';
import type { EngineResult } from '../src/types';
import { storageKey } from '../src/storage';

test('完成例、3つの回路、実際のVerilogを接続したCPU、保存', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('register-pc')).toHaveText('0');
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('register-b')).toHaveText('1');
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('leds')).toHaveAttribute('aria-label', '出力LED 0001');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('button', { name: '回路づくりを始める' }).click();
  await page.getByRole('button', { name: '動作を確認する' }).click();
  await expect(page.getByTestId('test-summary')).toHaveText('1 / 256 ケース成功');
  for (const [index, count] of [256, 50, 34].entries()) {
    await page.getByText('解答例を見る', { exact: true }).click();
    await page.getByRole('button', { name: '解答例をエディタに入れる' }).click();
    await page.getByRole('button', { name: '動作を確認する' }).click();
    await expect(page.getByTestId('test-summary')).toHaveText(`${count} / ${count} ケース成功`);
    if (index < 2) await page.getByRole('button', { name: '次の回路へ' }).click();
  }
  await page.screenshot({ path: 'test-results/lesson.png', fullPage: true });
  await page.getByRole('button', { name: '自分のCPUを動かす →', exact: true }).click();
  await expect(page.getByTestId('register-pc')).toHaveText('0');
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('leds')).toHaveAttribute('aria-label', '出力LED 0001');
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).passed.pc, storageKey),
    )
    .toBe(answerSources.pc);
  await page.reload();
  await expect(page.getByText('3 / 3 回路完成')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ROM変更、入力履歴の分岐、分岐命令、モバイル表示', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('register-pc')).toHaveText('0');
  await page.getByLabel('サンプルプログラム').selectOption('input');
  await expect(page.getByRole('button', { name: '1命令進む →' })).toBeDisabled();
  await page.getByRole('button', { name: 'ROMを反映してリセット' }).click();
  await expect(page.getByTestId('register-pc')).toHaveText('0');
  await page.getByRole('button', { name: '入力ビット3' }).click();
  await expect(page.getByRole('button', { name: '1命令進む →' })).toBeEnabled();
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('register-out')).toHaveText('8');
  await page.getByRole('button', { name: '1命令戻る' }).click();
  await page.getByRole('button', { name: '1命令戻る' }).click();
  await page.getByRole('button', { name: '入力ビット0' }).click();
  await expect(page.getByRole('button', { name: '1命令進む →' })).toBeEnabled();
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('register-out')).toHaveText('9');
  await page.getByLabel('サンプルプログラム').selectOption('branch');
  await page.getByRole('button', { name: 'ROMを反映してリセット' }).click();
  await expect(page.getByTestId('register-pc')).toHaveText('0');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('register-out')).toHaveText('15');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('解答へのすり替えなし：変更したVerilogとXの値を実行する', async ({ page }) => {
  const sources = {
    ...answerSources,
    adder: answerSources.adder.replace("{1'b0, x} + {1'b0, y}", "5'bxxxxx"),
  };
  await page.addInitScript(
    ({ sources, rom, key }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, sources, rom, passed: {} })),
    { sources, rom: fillRom([0x51, 0x90, 0xf0]), key: storageKey },
  );
  await page.goto('/');
  await page.getByRole('button', { name: '03自分のCPUを動かす' }).click();
  await expect(page.getByTestId('register-pc')).toHaveText('0');
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('register-b')).toHaveText('XXXX');
  await page.getByRole('button', { name: '1命令進む →' }).click();
  await expect(page.getByTestId('leds')).toHaveAttribute('aria-label', '出力LED xxxx');
});

test('構文エラーと無限ループから復帰できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '回路づくりを始める' }).click();
  const editor = page.getByRole('textbox', { name: 'Verilogコード' });
  await editor.fill('module adder4 ( broken syntax\nendmodule');
  await page.getByRole('button', { name: '動作を確認する' }).click();
  await expect(page.locator('.results .error')).toBeVisible();
  await expect(page.locator('.diagnostic button').first()).toBeVisible();
  await page.locator('.diagnostic button').first().click();
  await editor.fill(
    answerSources.adder.replace('endmodule', 'initial forever begin end\nendmodule'),
  );
  await page.getByRole('button', { name: '動作を確認する' }).click();
  await expect(page.getByRole('button', { name: '中止', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '中止', exact: true }).click();
  await expect(page.getByText('実行を中止しました。', { exact: true })).toBeVisible();
  await editor.fill(answerSources.adder);
  await page.getByRole('button', { name: '動作を確認する' }).click();
  await expect(page.getByTestId('test-summary')).toHaveText('256 / 256 ケース成功');
});

test('モジュールを接続したTD4が基本12命令と両方のJNCを実行する', async ({ page }) => {
  await page.goto('/');
  const program = [
    0x3e, 0x01, 0x01, 0xe6, 0xe6, 0x30, 0x75, 0x50, 0x10, 0x40, 0x20, 0x60, 0x90, 0xb3, 0xf0,
  ];
  const result: EngineResult = await page.evaluate(
    (files) =>
      new Promise((resolve, reject) => {
        const worker = new Worker('/simulation-worker.js', { type: 'module' });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('timeout'));
        }, 15000);
        worker.onmessage = ({ data }) => {
          if (data.stage) return;
          clearTimeout(timer);
          worker.terminate();
          resolve(data);
        };
        worker.onerror = (e) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(e.message));
        };
        worker.postMessage({ files });
      }),
    cpuFiles(answerSources, fillRom(program), [{ cycle: 0, value: 10 }], 14),
  );
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  const actual = parseFrames(result.output, 14)
    .slice(1)
    .map((f) =>
      [f.state.pc, f.state.a, f.state.b, f.state.out, f.state.carry].map((s) => parseInt(s, 2)),
    );
  expect(actual).toEqual([
    [1, 14, 0, 0, 0],
    [2, 15, 0, 0, 0],
    [3, 0, 0, 0, 1],
    [4, 0, 0, 0, 0],
    [6, 0, 0, 0, 0],
    [7, 0, 5, 0, 0],
    [8, 0, 5, 0, 0],
    [9, 5, 5, 0, 0],
    [10, 5, 5, 0, 0],
    [11, 10, 5, 0, 0],
    [12, 10, 10, 0, 0],
    [13, 10, 10, 10, 0],
    [14, 10, 10, 3, 0],
    [0, 10, 10, 3, 0],
  ]);
});

test('プロジェクトの書き出し・読み込み・取り消しと不正ファイル', async ({ page }) => {
  await page.goto('/');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '書き出し', exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('td4-project.json');
  const path = await exported.path();
  expect(path).not.toBeNull();
  const file = page.locator('input[type=file]');
  await file.setInputFiles({
    name: 'completed.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        sources: answerSources,
        passed: answerSources,
        rom: fillRom([0xb5, 0xf0]),
      }),
    ),
  });
  await expect(page.getByText('プロジェクトを読み込みました。', { exact: false })).toBeVisible();
  await expect(page.getByText('0 / 3 回路完成')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Verilogコード' })).toContainText("{1'b0, x}");
  await page.getByRole('button', { name: '動作を確認する' }).click();
  await expect(page.getByTestId('test-summary')).toHaveText('256 / 256 ケース成功');
  await page.getByRole('button', { name: '読み込みを取り消す' }).click();
  await expect(page.getByRole('textbox', { name: 'Verilogコード' })).toContainText('TODO');
  await expect(page.getByTestId('test-summary')).toHaveCount(0);
  await file.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByText('対応していないプロジェクト形式です。')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Verilogコード' })).toContainText('TODO');
  await file.setInputFiles(path!);
  await expect(page.getByRole('textbox', { name: 'Verilogコード' })).toContainText('TODO');
});
