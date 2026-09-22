import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const cpu = readFileSync('code/td4/cpu.sv', 'utf8');
const answer = cpu.slice(cpu.indexOf('    always_comb'), cpu.lastIndexOf('endmodule')).trim();
const shortRom =
  "module rom(input logic [3:0] addr, output logic [7:0] data);\nalways_comb begin\n  case(addr)\n    0: data=8'h60; // IN B\n    1: data=8'h90; // OUT B\n    default: data=8'hF0; // JMP 0\n  endcase\nend\nendmodule";
test('配布コードの4つの参考命令と、解答の12命令を検証できる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: /1命令進/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
    '参考：記入済み',
  );
  await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(page.getByTestId('completion')).toHaveText('4 / 12', { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'すべての命令をテスト' })).toBeEnabled();
  for (const op of [1, 2, 4, 7])
    await expect(page.getByTestId(`status-${op}`)).toHaveText('✓ 成功');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  await expect(page.getByTestId('completion')).toHaveText('0 / 12');
  await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(page.getByTestId('completion')).toHaveText('12 / 12', { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'すべての命令をテスト' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/lab-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('ヒントを二段階で開き、活用できる命令を確認できる', async ({ page }) => {
  await page.goto('./');
  const assignmentUses = page.getByTestId('hint-uses-assignment');
  await expect(assignmentUses).not.toBeVisible();
  await page.getByText('ヒント：次の値に代入する', { exact: true }).click();
  await expect(assignmentUses).not.toBeVisible();
  await page.getByText('さらにヒント：使える命令', { exact: true }).nth(0).click();
  await expect(assignmentUses).toContainText('MOV A, Im');
  await expect(assignmentUses).toContainText('JMP Im');
  await expect(assignmentUses).toContainText('IN B');
  await expect(assignmentUses).toContainText('OUT B');
  await expect(assignmentUses).toContainText('OUT Im');

  await page.getByText('ヒント：加算と桁上がり', { exact: true }).click();
  await page.getByText('さらにヒント：使える命令', { exact: true }).nth(1).click();
  await expect(page.getByTestId('hint-uses-addition')).toContainText('ADD A, Im');
  await expect(page.getByTestId('hint-uses-addition')).toContainText('ADD B, Im');

  await page.getByText('ヒント：条件で次の番地を選ぶ', { exact: true }).click();
  await page.getByText('さらにヒント：使える命令', { exact: true }).nth(2).click();
  await expect(page.getByTestId('hint-uses-condition')).toContainText('JNC Im');
});
test('ROMを自由に編集し、実行・停止・再開・入力変更・リセットする', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  await page.getByRole('textbox', { name: 'ROMコード' }).fill(shortRom);
  await page.getByRole('button', { name: '入力ビット3' }).click();
  await page.getByRole('combobox', { name: '実行速度' }).selectOption('100');
  await page.getByRole('button', { name: '▷ 実行', exact: true }).click();
  await expect(page.getByTestId('register-out')).toHaveText('8');
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.locator('.run-indicator')).toHaveText('STOPPED');
  const cycle = await page.getByTestId('cycle').innerText();
  await page.waitForTimeout(350);
  await expect(page.getByTestId('cycle')).toHaveText(cycle);
  await page.getByRole('button', { name: '入力ビット0' }).click();
  await page.getByRole('button', { name: '▷ 再開', exact: true }).click();
  await expect(page.getByTestId('register-out')).toHaveText('9');
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  await expect(page.getByTestId('cycle')).toHaveText('0 命令実行');
  await expect(page.getByTestId('register-out')).toHaveText('0');
  await page.getByRole('textbox', { name: 'ROMコード' }).fill("always_comb begin data=8'hB5; end");
  await page.getByRole('button', { name: '▷ 実行', exact: true }).click();
  await expect(page.getByTestId('register-out')).toHaveText('5');
  await page
    .getByRole('textbox', { name: 'CPUのalways_comb' })
    .fill(answer.replace('next_out   = imm;', "next_out   = 4'd3;"));
  await expect(page.locator('.run-indicator')).toHaveText('READY TO START');
  await page.getByRole('button', { name: '▷ 実行', exact: true }).click();
  await expect(page.getByTestId('register-out')).toHaveText('3');
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/lab-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('命令別の失敗詳細、構文エラー、対応外構文を確認して直せる', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'ADD A, Imをテスト', exact: true }).click();
  await expect(page.getByTestId('status-0')).toHaveText('要確認');
  await expect(page.locator('.failure').first()).toContainText('期待する次の値');
  await page
    .getByRole('textbox', { name: 'CPUのalways_comb' })
    .fill('always_comb begin\nnext_a <= 0;\nend');
  await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(page.getByRole('alert')).toContainText('2行目');
  await page.getByRole('button', { name: '該当行を見る' }).click();
  await page
    .getByRole('textbox', { name: 'CPUのalways_comb' })
    .fill('always_comb begin while(1) begin end end');
  await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(page.getByRole('alert')).toContainText('対応していません');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  await page.getByRole('button', { name: 'JNC Imをテスト', exact: true }).click();
  await expect(page.getByTestId('status-14')).toHaveText('✓ 成功');
});
test('保存・再読込・JSON入出力・置き換えの取り消し', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  await page.getByRole('textbox', { name: 'ROMコード' }).fill(shortRom);
  await expect(page.locator('.saved')).toHaveText('このブラウザに保存済み');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存用JSON' }).click();
  const path = await (await download).path();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
    '{next_cf, next_a}',
  );
  await expect(page.getByTestId('completion')).toHaveText('0 / 12');
  await page.getByRole('button', { name: '配布コードに戻す' }).click();
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText('TODO');
  await page.getByRole('button', { name: '置き換えを取り消す' }).click();
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).not.toContainText('TODO');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('プロジェクトJSON');
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByRole('textbox', { name: 'ROMコード' })).toContainText('IN B');
});
