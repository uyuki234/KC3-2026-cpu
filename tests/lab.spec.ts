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
  await expect(page.getByRole('link', { name: /KC3.*講義ページ/ })).toHaveAttribute(
    'href',
    'https://kc3.me/study/4246/',
  );
  await expect(page.getByRole('link', { name: /GITHUB.*リポジトリ/ })).toHaveAttribute(
    'href',
    'https://github.com/uyuki234/KC3-2026-cpu',
  );
  await expect(page.getByRole('link', { name: /SLIDES.*講義スライド/ })).toHaveAttribute(
    'href',
    'https://speakerdeck.com/uyuki234/verilog-de-manabu-cpu-jisaku-nyuumon',
  );
  await expect(
    page
      .locator('.instruction-row')
      .filter({ has: page.locator('.difficulty') })
      .locator('.instruction-body strong'),
  ).toHaveText(['ADD A, Im', 'ADD B, Im', 'JMP Im', 'JNC Im']);
  await expect(page.locator('.resource-link strong')).toHaveText([
    '講義スライド',
    'リポジトリ',
    '講義ページ',
  ]);
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
    '参考：記入済み',
  );
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
    "4'b0110: ; // IN B",
  );
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).not.toContainText('TODO');
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
test('ヒントを開く前から対象命令が分かり、一度開けば説明を読める', async ({ page }) => {
  await page.goto('./');
  const hints = page.locator('.hints > details');
  const commands = [
    ['MOV A, Im', 'JMP Im', 'IN B', 'OUT B', 'OUT Im'],
    ['ADD A, Im', 'ADD B, Im'],
    ['JNC Im'],
  ];
  for (let index = 0; index < commands.length; index++) {
    const hint = hints.nth(index);
    await expect(hint.locator('summary code')).toHaveText(commands[index]);
    await expect(hint.locator('summary')).toBeVisible();
    await expect(hint.locator('p')).not.toBeVisible();
    await hint.locator('summary').click();
    await expect(hint.locator('p')).toBeVisible();
  }
  await expect(page.getByText('さらにヒント：使える命令')).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`全画面で編集・テストでき、右下のボタンとEscで戻れる (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    const editor = page.getByRole('textbox', { name: 'CPUのalways_comb' });
    await editor.fill(answer);
    await page.getByRole('button', { name: '全画面', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '命令処理をつくる' });
    await expect(dialog).toBeVisible();
    await expect(editor).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(bounds).toEqual({ x: 0, y: 0, ...viewport });
    const restore = dialog.getByRole('button', { name: '元に戻す', exact: true });
    const buttonBounds = (await restore.boundingBox())!;
    expect(buttonBounds.x + buttonBounds.width).toBeGreaterThan(viewport.width - 30);
    expect(buttonBounds.y + buttonBounds.height).toBeGreaterThan(viewport.height - 30);
    await restore.focus();
    await page.keyboard.press('Tab');
    await expect(editor).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(restore).toBeFocused();
    await editor.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n// fullscreen edit');
    await dialog.getByRole('button', { name: 'すべての命令をテスト' }).click();
    await expect(dialog.locator('.fullscreen-feedback')).toContainText('12 / 12 命令成功');
    await page.screenshot({ path: `test-results/fullscreen-${viewport.width}.png` });
    await restore.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(editor).toContainText('// fullscreen edit');
    await expect(page.getByRole('button', { name: '全画面', exact: true })).toBeFocused();
    await editor.press('ControlOrMeta+z');
    await expect(editor).not.toContainText('// fullscreen edit');
    await expect(editor).toContainText('{next_cf, next_a}');
    await page.getByRole('button', { name: '全画面', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.site-header')).not.toHaveAttribute('inert', '');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('全画面でも構文エラーを確認でき、結果詳細へ戻れる', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '全画面', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await page
    .getByRole('textbox', { name: 'CPUのalways_comb' })
    .fill('always_comb begin\nnext_a <= 0;\nend');
  await dialog.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(dialog.getByRole('alert')).toContainText('2行目');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  await dialog.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(dialog.locator('.fullscreen-feedback')).toContainText('12 / 12 命令成功');
  await dialog.getByRole('button', { name: '結果の詳細を見る' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('completion')).toHaveText('12 / 12');
  await expect(page.locator('.test-detail')).toBeInViewport();
});

test('Ctrl / Command + Enterでは命令テストを実行しない', async ({ page }) => {
  await page.goto('./');
  const editor = page.getByRole('textbox', { name: 'CPUのalways_comb' });
  await editor.fill(answer);
  await editor.press('Control+Enter');
  await editor.press('Meta+Enter');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('completion')).toHaveText('0 / 12');
  await expect(page.getByTestId('status-0')).toHaveText('未検証');
  await expect(page.getByText('Ctrl / ⌘ + Enter', { exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
    "4'b0000: ; // ADD A, IMM",
  );
  await page.getByRole('button', { name: '置き換えを取り消す' }).click();
  await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
    '{next_cf, next_a}',
  );
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('プロジェクトJSON');
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByRole('textbox', { name: 'ROMコード' })).toContainText('IN B');
});
