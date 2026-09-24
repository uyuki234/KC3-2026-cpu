// A deliberately bounded interpreter for the combinational subset used in this lesson.
// Source is tokenized and parsed, never evaluated as JavaScript.
export class SvError extends Error {
  constructor(
    message: string,
    public line = 1,
    public kind: 'syntax' | 'unsupported' | 'runtime' = 'syntax',
  ) {
    super(`${line}行目: ${message}`);
  }
}
type Token = { text: string; line: number; from: number; to: number };
type CaseArm = { matches: Expr[]; body: Statement; from: number; to: number };
type Value = { bits: bigint; width: number; signed: boolean; fill?: boolean };
type Expr =
  | { kind: 'literal'; value: Value; line: number }
  | { kind: 'name'; name: string; line: number }
  | { kind: 'unary'; op: string; arg: Expr; line: number }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; line: number }
  | { kind: 'ternary'; cond: Expr; yes: Expr; no: Expr; line: number }
  | { kind: 'concat'; items: Expr[]; line: number }
  | { kind: 'slice'; arg: Expr; high: number; low: number; line: number };
type Target = { name: string; line: number }[];
type Statement =
  | { kind: 'block'; statements: Statement[] }
  | { kind: 'assign'; target: Target; expr: Expr; line: number }
  | { kind: 'if'; cond: Expr; yes: Statement; no?: Statement }
  | {
      kind: 'case';
      expr: Expr;
      arms: CaseArm[];
      otherwise?: Statement;
      unique: boolean;
      line: number;
    };
export interface Signal {
  width: number;
  writable?: boolean;
}
export type Signals = Record<string, Signal>;
const mask = (width: number) => (1n << BigInt(width)) - 1n;
function value(bits: bigint, width: number, signed = false): Value {
  return { bits: bits & mask(width), width, signed };
}
function number(v: Value) {
  return v.signed && v.bits & (1n << BigInt(v.width - 1))
    ? v.bits - (1n << BigInt(v.width))
    : v.bits;
}
function resize(v: Value, width: number, signed: boolean): Value {
  return value(
    v.fill === true ? mask(width) : v.signed && signed ? number(v) : v.bits,
    width,
    signed,
  );
}

function tokenize(source: string): Token[] {
  if (source.length > 20000) throw new SvError('コードは20,000文字以内にしてください。');
  const tokens: Token[] = [];
  let i = 0,
    line = 1;
  while (i < source.length) {
    const rest = source.slice(i);
    if (/^\s/.test(rest)) {
      if (source[i] === '\n') line++;
      i++;
      continue;
    }
    if (rest.startsWith('//')) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new SvError('コメントを */ で閉じてください。', line);
      line += (source.slice(i, end + 2).match(/\n/g) || []).length;
      i = end + 2;
      continue;
    }
    const match = rest.match(
      /^(?:\d[\d_]*\s*'[sS]?[bBoOdDhH][0-9a-fA-F_xXzZ?]+|'[01xXzZ]|\d[\d_]*|[A-Za-z_][\w$]*|===|!==|>>>|<<<|==|!=|<=|>=|&&|\|\||<<|>>|[{}()[\];,:?=+\-*~!&|^<>])/,
    );
    if (!match)
      throw new SvError(
        `「${rest[0]}」はこの演習の対応構文に含まれていません。`,
        line,
        'unsupported',
      );
    tokens.push({ text: match[0].replace(/\s/g, ''), line, from: i, to: i + match[0].length });
    i += match[0].length;
    if (tokens.length > 6000) throw new SvError('コードが複雑すぎます。', line, 'unsupported');
  }
  tokens.push({ text: '<EOF>', line, from: i, to: i });
  return tokens;
}
const precedence: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '>': 7,
  '<=': 7,
  '>=': 7,
  '<<': 8,
  '>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
};
class Parser {
  private tokens: Token[];
  private at = 0;
  private depth = 0;
  constructor(
    source: string,
    private signals: Signals,
  ) {
    this.tokens = tokenize(source);
  }
  private peek() {
    return this.tokens[this.at];
  }
  private take() {
    return this.tokens[this.at++];
  }
  private accept(text: string) {
    if (this.peek().text === text) {
      this.at++;
      return true;
    }
    return false;
  }
  private expect(text: string) {
    const t = this.take();
    if (t.text !== text) throw new SvError(`「${text}」が必要です（現在: ${t.text}）。`, t.line);
  }
  parse(): Statement {
    this.expect('always_comb');
    const result = this.statement();
    this.expect('<EOF>');
    return result;
  }
  private nested<T>(fn: () => T): T {
    if (++this.depth > 64)
      throw new SvError('入れ子が深すぎます。', this.peek().line, 'unsupported');
    try {
      return fn();
    } finally {
      this.depth--;
    }
  }
  private statement(): Statement {
    return this.nested(() => {
      const start = this.peek();
      if (this.accept(';')) return { kind: 'block', statements: [] };
      if (this.accept('begin')) {
        const statements: Statement[] = [];
        while (!this.accept('end')) {
          if (this.peek().text === '<EOF>')
            throw new SvError('begin に対応する end がありません。', start.line);
          statements.push(this.statement());
        }
        return { kind: 'block', statements };
      }
      if (this.accept('if')) {
        this.expect('(');
        const cond = this.expression();
        this.expect(')');
        const yes = this.statement();
        return { kind: 'if', cond, yes, no: this.accept('else') ? this.statement() : undefined };
      }
      const unique = this.accept('unique');
      if (this.accept('case')) {
        this.expect('(');
        const expr = this.expression();
        this.expect(')');
        const arms: CaseArm[] = [];
        let otherwise: Statement | undefined;
        while (!this.accept('endcase')) {
          if (this.peek().text === '<EOF>')
            throw new SvError('case に対応する endcase がありません。', start.line);
          if (this.accept('default')) {
            if (otherwise) throw new SvError('default が重複しています。', this.peek().line);
            this.expect(':');
            otherwise = this.statement();
          } else {
            const matches = [this.expression()];
            while (this.accept(',')) matches.push(this.expression());
            this.expect(':');
            const from = this.peek().from;
            const body = this.statement();
            arms.push({ matches, body, from, to: this.tokens[this.at - 1].to });
          }
        }
        return { kind: 'case', expr, arms, otherwise, unique, line: start.line };
      }
      if (unique) throw new SvError('unique の後には case を書いてください。', start.line);
      if (
        [
          'for',
          'while',
          'repeat',
          'forever',
          'logic',
          'wire',
          'reg',
          'casez',
          'casex',
          'always_ff',
          'assign',
          'function',
        ].includes(start.text)
      )
        throw new SvError(
          `「${start.text}」には対応していません。対応構文を確認してください。`,
          start.line,
          'unsupported',
        );
      const target: Target = [];
      const readTarget = () => {
        const t = this.take();
        if (!this.signals[t.text]?.writable)
          throw new SvError(
            `代入先「${t.text}」は使えません。${Object.keys(this.signals)
              .filter((k) => this.signals[k].writable)
              .join(', ')} に代入してください。`,
            t.line,
          );
        if (target.some((x) => x.name === t.text))
          throw new SvError('連結した代入先が重複しています。', t.line);
        target.push({ name: t.text, line: t.line });
      };
      if (this.accept('{')) {
        readTarget();
        while (this.accept(',')) readTarget();
        this.expect('}');
      } else readTarget();
      if (this.peek().text === '<=')
        throw new SvError(
          'always_comb 内の代入には = を使ってください。',
          this.peek().line,
          'unsupported',
        );
      this.expect('=');
      const expr = this.expression();
      this.expect(';');
      return { kind: 'assign', target, expr, line: start.line };
    });
  }
  private expression(min = 0): Expr {
    return this.nested(() => {
      let left = this.atom();
      while ((precedence[this.peek().text] ?? -1) >= min) {
        const op = this.take();
        left = {
          kind: 'binary',
          op: op.text,
          left,
          right: this.expression(precedence[op.text] + 1),
          line: op.line,
        };
      }
      if (min === 0 && this.accept('?')) {
        const yes = this.expression();
        this.expect(':');
        left = { kind: 'ternary', cond: left, yes, no: this.expression(), line: left.line };
      }
      return left;
    });
  }
  private atom(): Expr {
    return this.nested(() => {
      const t = this.take();
      let expr: Expr;
      if (['~', '!', '+', '-'].includes(t.text))
        expr = { kind: 'unary', op: t.text, arg: this.atom(), line: t.line };
      else if (t.text === '(') {
        expr = this.expression();
        this.expect(')');
      } else if (t.text === '{') {
        const items = [this.expression()];
        while (this.accept(',')) items.push(this.expression());
        this.expect('}');
        expr = { kind: 'concat', items, line: t.line };
      } else if (/^\d|^'/.test(t.text)) {
        let v: Value;
        if (/^'[01]$/.test(t.text))
          v = { ...value(t.text === "'1" ? 1n : 0n, 1), fill: t.text === "'1" };
        else if (/^\d[\d_]*$/.test(t.text)) {
          const n = BigInt(t.text.replaceAll('_', ''));
          if (n > 2147483647n)
            throw new SvError('大きな定数はビット幅を明示してください。', t.line, 'unsupported');
          v = value(n, 32, true);
        } else {
          const match = t.text
            .replaceAll('_', '')
            .match(/^(\d+)'([sS]?)([bBoOdDhH])([0-9a-fA-F]+)$/);
          if (!match || /[xz?]/i.test(t.text))
            throw new SvError(
              'この演習ではX/Zや不定値を含む定数に対応していません。',
              t.line,
              'unsupported',
            );
          const width = Number(match[1]);
          if (width < 1 || width > 32)
            throw new SvError('定数の幅は1〜32bitにしてください。', t.line, 'unsupported');
          const radix = match[3].toLowerCase();
          if (
            !(
              radix === 'b'
                ? /^[01]+$/
                : radix === 'o'
                  ? /^[0-7]+$/
                  : radix === 'd'
                    ? /^\d+$/
                    : /^[0-9a-f]+$/i
            ).test(match[4])
          )
            throw new SvError('数値の表記を確認してください。', t.line);
          v = value(
            BigInt(({ b: '0b', o: '0o', h: '0x', d: '' }[radix] || '') + match[4]),
            width,
            !!match[2],
          );
        }
        expr = { kind: 'literal', value: v, line: t.line };
      } else if (Object.hasOwn(this.signals, t.text))
        expr = { kind: 'name', name: t.text, line: t.line };
      else throw new SvError(`信号または式「${t.text}」を認識できません。`, t.line, 'unsupported');
      while (this.accept('[')) {
        if (expr.kind !== 'name' || t.text !== expr.name)
          throw new SvError('ビット選択は信号名の直後に書いてください。', t.line, 'unsupported');
        const high = this.take();
        if (!/^\d+$/.test(high.text))
          throw new SvError(
            'ビット選択には10進数の定数を使ってください。',
            high.line,
            'unsupported',
          );
        let low = Number(high.text);
        if (this.accept(':')) {
          const t = this.take();
          if (!/^\d+$/.test(t.text))
            throw new SvError(
              'ビット選択には10進数の定数を使ってください。',
              t.line,
              'unsupported',
            );
          low = Number(t.text);
        }
        this.expect(']');
        if (Number(high.text) < low || Number(high.text) > 31)
          throw new SvError('ビット選択の範囲を確認してください。', high.line);
        expr = { kind: 'slice', arg: expr, high: Number(high.text), low, line: high.line };
      }
      return expr;
    });
  }
}
type Shape = { width: number; signed: boolean };
function shape(expr: Expr, signals: Signals): Shape {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'name':
      return { width: signals[expr.name].width, signed: false };
    case 'slice': {
      const s = shape(expr.arg, signals);
      if (expr.high >= s.width) throw new SvError('信号の幅を超えたビット選択です。', expr.line);
      return { width: expr.high - expr.low + 1, signed: false };
    }
    case 'concat': {
      const width = expr.items.reduce((n, e) => n + shape(e, signals).width, 0);
      if (width > 128)
        throw new SvError('連結は128bit以内にしてください。', expr.line, 'unsupported');
      return { width, signed: false };
    }
    case 'unary':
      return expr.op === '!' ? { width: 1, signed: false } : shape(expr.arg, signals);
    case 'ternary': {
      const a = shape(expr.yes, signals),
        b = shape(expr.no, signals);
      return { width: Math.max(a.width, b.width), signed: a.signed && b.signed };
    }
    case 'binary': {
      const a = shape(expr.left, signals),
        b = shape(expr.right, signals);
      return ['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(expr.op)
        ? { width: 1, signed: false }
        : ['<<', '>>'].includes(expr.op)
          ? a
          : { width: Math.max(a.width, b.width), signed: a.signed && b.signed };
    }
  }
}
type Env = Record<string, Value>;
function evaluate(
  expr: Expr,
  env: Env,
  signals: Signals,
  contextWidth = 0,
  contextSigned?: boolean,
): Value {
  const s = shape(expr, signals),
    width = Math.max(s.width, contextWidth),
    signed = contextSigned ?? s.signed;
  const ev = (e: Expr, w = 0, sign?: boolean) => evaluate(e, env, signals, w, sign);
  switch (expr.kind) {
    case 'literal':
      return resize(expr.value, width, signed);
    case 'name':
      if (!env[expr.name])
        throw new SvError(
          `「${expr.name}」が値を決める前に使われています。共通処理を確認してください。`,
          expr.line,
          'runtime',
        );
      return resize(env[expr.name], width, signed);
    case 'slice':
      return resize(value(ev(expr.arg).bits >> BigInt(expr.low), s.width), width, signed);
    case 'concat': {
      let bits = 0n;
      for (const item of expr.items) {
        const v = ev(item);
        bits = (bits << BigInt(v.width)) | v.bits;
      }
      return resize(value(bits, s.width), width, signed);
    }
    case 'unary': {
      const a = ev(expr.arg, expr.op === '!' ? 0 : width, expr.op === '!' ? undefined : signed);
      return expr.op === '!'
        ? value(a.bits === 0n ? 1n : 0n, width)
        : value(expr.op === '~' ? ~a.bits : expr.op === '-' ? -a.bits : a.bits, width, signed);
    }
    case 'ternary':
      return ev(ev(expr.cond).bits !== 0n ? expr.yes : expr.no, width, signed);
    case 'binary': {
      if (expr.op === '&&' || expr.op === '||') {
        const a = ev(expr.left).bits !== 0n,
          b = ev(expr.right).bits !== 0n;
        return value((expr.op === '&&' ? a && b : a || b) ? 1n : 0n, width);
      }
      if (['==', '!=', '<', '>', '<=', '>='].includes(expr.op)) {
        const aShape = shape(expr.left, signals),
          bShape = shape(expr.right, signals),
          w = Math.max(aShape.width, bShape.width),
          sign = aShape.signed && bShape.signed;
        const a = number(ev(expr.left, w, sign)),
          b = number(ev(expr.right, w, sign));
        const yes =
          expr.op === '=='
            ? a === b
            : expr.op === '!='
              ? a !== b
              : expr.op === '<'
                ? a < b
                : expr.op === '>'
                  ? a > b
                  : expr.op === '<='
                    ? a <= b
                    : a >= b;
        return value(yes ? 1n : 0n, width);
      }
      const a = ev(expr.left, width, signed).bits;
      const b = ev(
        expr.right,
        ['<<', '>>'].includes(expr.op) ? 0 : width,
        ['<<', '>>'].includes(expr.op) ? undefined : signed,
      ).bits;
      const n =
        expr.op === '+'
          ? a + b
          : expr.op === '-'
            ? a - b
            : expr.op === '*'
              ? a * b
              : expr.op === '&'
                ? a & b
                : expr.op === '|'
                  ? a | b
                  : expr.op === '^'
                    ? a ^ b
                    : b >= BigInt(width)
                      ? 0n
                      : expr.op === '<<'
                        ? a << b
                        : a >> b;
      return value(n, width, signed);
    }
  }
}
// Locate a single branch using the same grammar as the evaluator, not line matching.
// Refuse ambiguous structures rather than modifying another instruction's code.
export function caseBodyRange(source: string, signals: Signals, selector: string, match: number) {
  const cases: Extract<Statement, { kind: 'case' }>[] = [];
  function visit(statement: Statement) {
    if (statement.kind === 'block') statement.statements.forEach(visit);
    if (statement.kind === 'if') {
      visit(statement.yes);
      if (statement.no) visit(statement.no);
    }
    if (statement.kind === 'case') {
      if (statement.expr.kind === 'name' && statement.expr.name === selector) cases.push(statement);
      statement.arms.forEach((arm) => visit(arm.body));
      if (statement.otherwise) visit(statement.otherwise);
    }
  }
  visit(new Parser(source, signals).parse());
  if (cases.length !== 1)
    throw new Error(`case (${selector}) を1つにしてから解答を入れてください。`);
  if (
    cases[0].arms.some((arm) =>
      arm.matches.some((expr) => expr.kind !== 'literal' || expr.value.fill !== undefined),
    )
  )
    throw new Error('命令のcaseラベルは数値定数にしてから解答を入れてください。');
  const arms = cases[0].arms.filter((arm) =>
    arm.matches.some((expr) => expr.kind === 'literal' && expr.value.bits === BigInt(match)),
  );
  if (arms.length !== 1 || arms[0].matches.length !== 1)
    throw new Error('対象の命令を単独のcaseラベルで1つ記述してから解答を入れてください。');
  return { from: arms[0].from, to: arms[0].to };
}

export function compile(source: string, signals: Signals) {
  const program = new Parser(source, signals).parse();
  // Validate shapes even in branches that aren't reached in the first run.
  function check(stmt: Statement): void {
    if (stmt.kind === 'block') stmt.statements.forEach(check);
    else if (stmt.kind === 'assign') shape(stmt.expr, signals);
    else if (stmt.kind === 'if') {
      shape(stmt.cond, signals);
      check(stmt.yes);
      if (stmt.no) check(stmt.no);
    } else {
      shape(stmt.expr, signals);
      stmt.arms.forEach((a) => {
        a.matches.forEach((e) => shape(e, signals));
        check(a.body);
      });
      if (stmt.otherwise) check(stmt.otherwise);
    }
  }
  check(program);
  return (input: Record<string, number>): Record<string, number> => {
    const env: Env = {};
    let budget = 12000;
    for (const [name, spec] of Object.entries(signals))
      if (!spec.writable) {
        const n = input[name];
        if (!Number.isInteger(n) || n < 0 || n >= 2 ** spec.width)
          throw new SvError(`入力 ${name} の範囲が正しくありません。`, 1, 'runtime');
        env[name] = value(BigInt(n), spec.width);
      }
    function execute(stmt: Statement): void {
      if (--budget < 0) throw new SvError('1命令の処理量が上限に達しました。', 1, 'runtime');
      if (stmt.kind === 'block') stmt.statements.forEach(execute);
      else if (stmt.kind === 'assign') {
        const width = stmt.target.reduce((n, t) => n + signals[t.name].width, 0);
        let bits = evaluate(stmt.expr, env, signals, width).bits;
        for (const t of [...stmt.target].reverse()) {
          const w = signals[t.name].width;
          env[t.name] = value(bits, w);
          bits >>= BigInt(w);
        }
      } else if (stmt.kind === 'if') {
        const branch = evaluate(stmt.cond, env, signals).bits !== 0n ? stmt.yes : stmt.no;
        if (branch) execute(branch);
      } else {
        const expressions = stmt.arms.flatMap((a) => a.matches),
          shapes = [shape(stmt.expr, signals), ...expressions.map((e) => shape(e, signals))],
          width = Math.max(...shapes.map((s) => s.width)),
          signed = shapes.every((s) => s.signed);
        const selected = evaluate(stmt.expr, env, signals, width, signed).bits;
        const matches = stmt.arms.filter((a) =>
          a.matches.some((e) => evaluate(e, env, signals, width, signed).bits === selected),
        );
        if (stmt.unique && matches.length > 1)
          throw new SvError('unique case で複数の分岐が一致しました。', stmt.line, 'runtime');
        const branch = matches[0]?.body ?? stmt.otherwise;
        if (branch) execute(branch);
      }
    }
    execute(program);
    const result: Record<string, number> = {};
    for (const [name, spec] of Object.entries(signals))
      if (spec.writable) {
        if (!env[name])
          throw new SvError(
            `「${name}」の値が決まっていません。すべての経路で代入してください。`,
            1,
            'runtime',
          );
        result[name] = Number(env[name].bits);
      }
    return result;
  };
}
