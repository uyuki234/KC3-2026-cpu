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
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verilogで学ぶCPU自作入門');
  await expect(page.getByText('4 BIT CPU / 12 INSTRUCTIONS')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /実行画面へ/ })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: /保存用JSON|読み込む|rom.svをダウンロード|cpu.svをダウンロード/,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: /X.*作者SNS/ })).toHaveAttribute(
    'href',
    'https://x.com/uyuki234',
  );
  await expect(page.locator('.resource-link svg')).toHaveCount(4);
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
    '作者SNS',
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
  await expect(page.locator('.instruction-row.failed')).toHaveCount(8);
  await expect(page.locator('.instruction-row.passed')).toHaveCount(4);
  await expect(page.getByTestId('instruction-0')).toHaveCSS(
    'background-color',
    'rgb(255, 240, 240)',
  );
  await expect(page.getByTestId('instruction-7')).toHaveCSS(
    'background-color',
    'rgb(237, 247, 237)',
  );
  await expect(page.getByText(/^(未検証|要確認|✓ 成功)$/)).toHaveCount(0);
  await page.locator('.build-grid').screenshot({ path: 'test-results/row-colors.png' });
  for (const op of [1, 2, 4, 7])
    await expect(page.getByTestId(`instruction-${op}`)).toHaveClass(/passed/);
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
    await expect(page.locator('.intro')).not.toHaveAttribute('inert', '');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('全画面でも構文エラーを確認でき、命令表へ戻れる', async ({ page }) => {
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
  await dialog.getByRole('button', { name: '命令表を見る' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('completion')).toHaveText('12 / 12');
  await expect(page.locator('.instruction-list')).toBeInViewport();
});

test('Ctrl / Command + Enterでは命令テストを実行しない', async ({ page }) => {
  await page.goto('./');
  const editor = page.getByRole('textbox', { name: 'CPUのalways_comb' });
  await editor.fill(answer);
  await editor.press('Control+Enter');
  await editor.press('Meta+Enter');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('completion')).toHaveText('0 / 12');
  await expect(page.getByTestId('instruction-0')).not.toHaveClass(/passed|failed/);
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
test('命令別の失敗色、構文エラー、対応外構文を確認して直せる', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'ADD A, Imをテスト', exact: true }).click();
  await expect(page.getByTestId('instruction-0')).toHaveClass(/failed/);
  await expect(page.locator('.test-detail')).toHaveCount(0);
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
  await expect(page.getByTestId('instruction-14')).toHaveClass(/passed/);
});
test('自動保存・再読込・置き換えの取り消し', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  await page.getByRole('textbox', { name: 'ROMコード' }).fill(shortRom);
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('kc3-td4-instructions-v1') || '{}').rom),
    )
    .toBe(shortRom);
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
  await expect(page.getByRole('textbox', { name: 'ROMコード' })).toContainText('IN B');
});

test('解答を入れると対象だけが変わり、Undoと取り消しで戻せる', async ({ page }) => {
  await page.goto('./');
  const editor = page.getByRole('textbox', { name: 'CPUのalways_comb' });
  const original = await editor.innerText();
  const custom = original.replace("4'b0110: ;", "4'b0110: next_b = 9;");
  await editor.fill(custom);
  await page.getByRole('button', { name: 'ADD A, Imの解答を入れる', exact: true }).click();
  await expect(editor).toContainText('{next_cf, next_a} = a + imm;');
  await expect(editor).toContainText("4'b0110: next_b = 9;");
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText("4'b0000: ; // ADD A, IMM");
  await expect(editor).toContainText("4'b0110: next_b = 9;");
  await page.getByRole('button', { name: 'ADD A, Imの解答を入れる', exact: true }).click();
  await page.getByRole('button', { name: '置き換えを取り消す', exact: true }).click();
  await expect(editor).toContainText("4'b0000: ; // ADD A, IMM");
  await expect(editor).toContainText("4'b0110: next_b = 9;");
  await page.getByRole('button', { name: '配布コードに戻す', exact: true }).click();
  for (const name of [
    'ADD A, Im',
    'ADD B, Im',
    'MOV A, Im',
    'JMP Im',
    'JNC Im',
    'IN B',
    'OUT B',
    'OUT Im',
  ]) {
    await page.getByRole('button', { name: name + 'の解答を入れる', exact: true }).click();
  }
  await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(page.getByTestId('completion')).toHaveText('12 / 12');
  await expect(page.locator('.instruction-row.passed')).toHaveCount(12);
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\n// edit after tests');
  await expect(page.locator('.instruction-row.passed')).toHaveCount(0);
});

test('解答を挿入できないときはコードを保持して通知する', async ({ page }) => {
  await page.goto('./');
  const editor = page.getByRole('textbox', { name: 'CPUのalways_comb' });
  const invalid = 'always_comb begin next_a = ; end';
  await editor.fill(invalid);
  await page.getByRole('button', { name: 'ADD A, Imの解答を入れる', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('コードは変更していません');
  await expect(editor).toHaveText(invalid);
});

for (const width of [1440, 390]) {
  test(`解答挿入は画面・フォーカス・過去の結果を保ち、自動テストしない (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message, options) {
        if (message.type === 'test')
          document.documentElement.dataset.testRequests = String(
            Number(document.documentElement.dataset.testRequests || 0) + 1,
          );
        return original.call(this, message, options as Transferable[]);
      };
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
    await expect(page.getByTestId('completion')).toHaveText('4 / 12');
    await expect(page.getByRole('button', { name: 'すべての命令をテスト' })).toBeEnabled();
    const scroller = page.locator('.cpu-workspace .cm-scroller');
    await scroller.evaluate((el) => {
      el.scrollTop = 70;
      el.scrollLeft = 80;
    });
    const button = page.getByRole('button', { name: 'OUT Imの解答を入れる', exact: true });
    await button.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.scrollY);
    const scrollBefore = await scroller.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft,
    }));
    await button.click();
    await expect(button).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'CPUのalways_comb' })).toContainText(
      'next_out = imm;',
    );
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    expect(await scroller.evaluate((el) => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual(
      scrollBefore,
    );
    await expect(page.getByTestId('completion')).toHaveText('4 / 12');
    await expect(page.getByTestId('instruction-11')).toHaveClass(/failed/);
    await expect(page.locator('html')).toHaveAttribute('data-test-requests', '1');
    await page.getByRole('button', { name: 'OUT Imをテスト', exact: true }).click();
    await expect(page.getByTestId('instruction-11')).toHaveClass(/passed/);
    await expect(page.getByTestId('completion')).toHaveText('5 / 12');
  });
}

test('残り時間はLEDが変わるまで保持し、0秒でLEDと一緒に点滅する', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'CPUのalways_comb' }).fill(answer);
  const speed = page.getByRole('combobox', { name: '実行速度' });
  const remaining = page.getByTestId('remaining-time');
  await speed.selectOption('1000');
  await expect(remaining).toHaveText('162秒');
  for (let bit = 0; bit < 4; bit++)
    await page.getByRole('button', { name: `入力ビット${bit}` }).click();
  await expect(remaining).toHaveText('12秒');
  const switchNotice = page.getByText('スイッチを反映する場合はリセット', { exact: true });
  await expect(switchNotice).not.toBeVisible();
  await page.getByRole('button', { name: '▷ 実行', exact: true }).click();
  await expect(page.getByTestId('register-out')).toHaveText('15');
  await expect(remaining).toHaveText('10秒');
  await expect
    .poll(async () => Number((await page.getByTestId('cycle').innerText()).split(' ')[0]))
    .toBeGreaterThanOrEqual(4);
  await expect(page.getByTestId('register-out')).toHaveText('15');
  await expect(remaining).toHaveText('10秒');
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.locator('.run-indicator')).toHaveText('STOPPED');
  await page.waitForTimeout(1100);
  await expect(remaining).toHaveText('10秒');
  await page.getByRole('button', { name: '入力ビット0' }).click();
  await expect(switchNotice).toBeVisible();
  await expect(remaining).toHaveText('10秒');
  await page.getByRole('button', { name: '入力ビット0' }).click();
  await expect(switchNotice).not.toBeVisible();
  await page.getByRole('button', { name: '入力ビット0' }).click();
  await expect(switchNotice).toBeVisible();
  await speed.selectOption('100');
  await expect(remaining).toHaveText('1秒');
  await page.getByRole('button', { name: '▷ 再開', exact: true }).click();
  await expect(remaining).toHaveText('0秒');
  await expect(page.getByTestId('timer')).toContainText('時間です');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const output = document.querySelector('[data-testid="register-out"]')?.textContent;
        return output === '15' && document.querySelector('.timer-light')?.classList.contains('lit');
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const output = document.querySelector('[data-testid="register-out"]')?.textContent;
        return output === '0' && !document.querySelector('.timer-light')?.classList.contains('lit');
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.locator('.inputs').screenshot({ path: 'test-results/timer-desktop.png' });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.inputs').screenshot({ path: 'test-results/timer-mobile.png' });
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  await expect(switchNotice).not.toBeVisible();
  await speed.selectOption('1000');
  await expect(remaining).toHaveText('22秒');
});

test('ボタンは取り消し・配布コードの順で、ROMは左0〜7・右8〜15に並ぶ', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.sub-actions button')).toHaveText([
    '置き換えを取り消す',
    '配布コードに戻す',
  ]);
  await expect(page.getByRole('button', { name: '置き換えを取り消す' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '配布ROMの動き' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ROMコードの説明' })).toBeVisible();
  await expect(page.getByText('使わない番地の値は', { exact: false })).toContainText('default');
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  const rows = page.locator('.rom-words > div');
  await expect(rows).toHaveCount(16);
  await expect(rows.locator('span')).toHaveText(
    Array.from({ length: 16 }, (_, i) => String(i).padStart(2, '0')),
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await rows.evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y };
      }),
    );
    for (let i = 0; i < 8; i++) {
      expect(bounds[i].x).toBe(bounds[0].x);
      expect(bounds[i + 8].x).toBeGreaterThan(bounds[i].x);
      expect(bounds[i + 8].y).toBe(bounds[i].y);
      if (i > 0) expect(bounds[i].y).toBeGreaterThan(bounds[i - 1].y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const reset = await page
      .getByRole('button', { name: '配布コードに戻す', exact: true })
      .boundingBox();
    const container = await page.locator('.sub-actions').boundingBox();
    expect(Math.abs(reset!.x + reset!.width - container!.x - container!.width)).toBeLessThan(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.live-rom').screenshot({ path: 'test-results/rom-columns-mobile.png' });
});

test('ROMのTipsを開くと各行の説明と入れ子のループ枠を読める', async ({ page }) => {
  await page.goto('./');
  const tips = page.locator('.rom-tips');
  const summary = tips.locator('summary');
  await expect(summary).toHaveText('Tips：配布ROMを1行ずつ読む');
  await expect(tips.locator('.rom-tip-row').first()).not.toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(tips.locator('.rom-tip-row')).toHaveCount(10);
  await expect(tips.locator('.rom-tip-row dt code')).toHaveText([
    'IN B',
    'OUT B',
    'MOV A, 13',
    'ADD A, 1',
    'JNC 3',
    'ADD B, 1',
    'JNC 1',
    'OUT 0',
    'OUT 15',
    'JMP 7',
  ]);
  await expect(tips.locator('.rom-tip-row dt span')).toHaveText(
    Array.from({ length: 10 }, (_, i) => `${i}番地`),
  );
  const count = tips.getByRole('region', { name: '1〜6番地 · 数え上げ', exact: true });
  const wait = count.getByRole('region', { name: '3〜4番地 · 待ち時間', exact: true });
  const blink = tips.getByRole('region', { name: '7〜9番地 · 終了後の点滅', exact: true });
  await expect(count.locator('.rom-tip-row')).toHaveCount(6);
  await expect(wait.locator('.rom-tip-row')).toHaveCount(2);
  await expect(blink.locator('.rom-tip-row')).toHaveCount(3);
  await expect(wait).toContainText('桁上がりしたら5番地へ進みます');
  await expect(count).toContainText('桁上がりしたら7番地へ進みます');
  await expect(blink).toContainText('必ず7番地に戻ります');
  await expect(tips).toContainText('指定していない10〜15番地');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(wait).toBeVisible();
    const outer = await count.boundingBox();
    const inner = await wait.boundingBox();
    expect(inner!.x).toBeGreaterThan(outer!.x);
    expect(inner!.x + inner!.width).toBeLessThan(outer!.x + outer!.width);
    expect(inner!.y).toBeGreaterThan(outer!.y);
    expect(inner!.y + inner!.height).toBeLessThan(outer!.y + outer!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width !== 320) await tips.screenshot({ path: `test-results/rom-tips-${width}.png` });
  }
  await summary.click();
  await expect(tips.locator('.rom-tip-row').first()).not.toBeVisible();
});

test('未完成のCPUや別のROMでは不正確な残り時間を表示しない', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '入力ビット0' }).click();
  await page.getByRole('combobox', { name: '実行速度' }).selectOption('100');
  await page.getByRole('button', { name: '▷ 実行', exact: true }).click();
  await expect(page.getByTestId('remaining-time')).toHaveText('—');
  await expect(page.getByTestId('timer')).toContainText('命令の動作を確認してください');
  await page.getByRole('textbox', { name: 'ROMコード' }).fill(shortRom);
  await expect(page.getByTestId('remaining-time')).toHaveText('—');
  await expect(page.getByTestId('timer')).toContainText('配布ROMで利用できます');
});

test('狭い画面でも文字と解答ボタン、4つのリンクが収まる', async ({ page }) => {
  await page.goto('./');
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole('button', { name: 'ADD A, Imの解答を入れる', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.intro').screenshot({ path: 'test-results/intro-mobile.png' });
  await page.getByRole('button', { name: 'すべての命令をテスト' }).click();
  await expect(page.getByTestId('completion')).toHaveText('4 / 12');
  await page
    .locator('.instruction-list')
    .screenshot({ path: 'test-results/instructions-mobile.png' });
});
