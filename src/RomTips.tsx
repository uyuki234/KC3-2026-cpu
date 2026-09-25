const rows = [
  ['IN B', 'スイッチの値をBに読み込みます。これが数え始める値になります。'],
  ['OUT B', 'Bの値をLEDに表示します。'],
  ['MOV A, 13', 'Aに13を入れ、待ち時間をつくる準備をします。'],
  ['ADD A, 1', 'Aを1増やします。15を超えるとAは0になり、桁上がりを示すCFが1になります。'],
  [
    'JNC 3',
    '桁上がりしていなければ3番地に戻ります。3・4番地の繰り返しが待ち時間になります。桁上がりしたら5番地へ進みます。',
  ],
  ['ADD B, 1', 'Bを1増やします。15を超えるとBは0になり、CFが1になります。'],
  [
    'JNC 1',
    '桁上がりしていなければ1番地に戻り、増えたBの値をLEDに表示します。桁上がりしたら7番地へ進みます。',
  ],
  ['OUT 0', 'LEDをすべて消します。ここから終了を知らせる点滅が始まります。'],
  ['OUT 15', 'LEDをすべて点灯させます。'],
  ['JMP 7', '必ず7番地に戻ります。7〜9番地を繰り返し、LEDを点滅させ続けます。'],
];

function Instruction({ addr }: { addr: number }) {
  const [command, description] = rows[addr];
  return (
    <dl className="rom-tip-row" data-address={addr}>
      <dt>
        <span>{addr}番地</span>
        <code>{command}</code>
      </dt>
      <dd>{description}</dd>
    </dl>
  );
}

export default function RomTips() {
  return (
    <div className="hints rom-tips">
      <details>
        <summary>Tips：配布ROMを1行ずつ読む</summary>
        <p>
          このプログラムでは、<strong>BはLEDに表示する数、Aは待ち時間をつくるための数</strong>
          として使います。基本的には番地順に実行し、ジャンプ命令で指定の番地に戻ります。
        </p>
        <Instruction addr={0} />
        <section className="rom-loop count-loop" aria-labelledby="rom-count-loop">
          <h4 id="rom-count-loop">1〜6番地 · 数え上げ</h4>
          <Instruction addr={1} />
          <Instruction addr={2} />
          <section className="rom-loop wait-loop" aria-labelledby="rom-wait-loop">
            <h4 id="rom-wait-loop">3〜4番地 · 待ち時間</h4>
            <p>
              タイマーの待ち時間を長くするため、あえてLEDの表示を変えない計算を繰り返しています。命令の実行に時間がかかることを利用した、いわば「時間を使うためのループ」です。この間、LEDに表示するBの値は変わりません。
            </p>
            <Instruction addr={3} />
            <Instruction addr={4} />
          </section>
          <Instruction addr={5} />
          <Instruction addr={6} />
        </section>
        <section className="rom-loop blink-loop" aria-labelledby="rom-blink-loop">
          <h4 id="rom-blink-loop">7〜9番地 · 終了後の点滅</h4>
          <Instruction addr={7} />
          <Instruction addr={8} />
          <Instruction addr={9} />
        </section>
        <p>
          <code>default</code> は、指定していない10〜15番地の値を0にします。命令としては{' '}
          <code>ADD A, 0</code> ですが、このプログラムが正しく動いている間は実行されません。
        </p>
      </details>
    </div>
  );
}
