```sv
// 解答①「転送・入出力は、次の値に代入する」
4'b0011: next_a   = imm;     // MOV A, IMM
4'b0111: next_b   = imm;     // MOV B, IMM
4'b0001: next_a   = b;       // MOV A, B
4'b0100: next_b   = a;       // MOV B, A
4'b0010: next_a   = switch;  // IN A
4'b0110: next_b   = switch;  // IN B
4'b1001: next_out = b;       // OUT B
4'b1011: next_out = imm;     // OUT IMM
```
押さえることは、「左辺は更新先のnext_*、右辺は入れたい値」。
変更しないレジスタは、用意済みの共通処理で保持します。

```sv
// 解答②「加算と分岐」
4'b0000: {next_cf, next_a} = a + imm;        // ADD A, IMM
4'b0101: {next_cf, next_b} = b + imm;        // ADD B, IMM
4'b1111: next_ip = imm;                     // JMP IMM
4'b1110: next_ip = cf ? ip + 4'd1 : imm;     // JNC IMM
// 今回はADD以外でCFを0にする。JNCの判定には現在のcfを使う
```
ADD：結果の下位4bitと、桁上がりの1bitを分けて受け取る。
JMP：次に読む命令の番地を変更する。
JNC：現在のCFが0ならジャンプ、1なら次の番地へ進む。
