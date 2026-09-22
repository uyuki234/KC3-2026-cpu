module cpu(
    input   logic       clk,
    input   logic       n_reset,
    output  logic [3:0] addr,
    input   logic [7:0] data,
    input   logic [3:0] switch,
    output  logic [3:0] led;
);
    logic [3:0] a,      next_a;     // 演算に使う4ビットレジスタA
    logic [3:0] b,      next_b;     // 演算に使う4ビットレジスタB
    logic       cf,     next_cf;    // 加算時の桁上がりを保持
    logic [3:0] ip,     next_ip;    // 次に読み出すROMの番地
    logic [3:0] out,    next_out;   // LEDへ出力する値を保持

    always_ff @(posedge clk) begin
        if (~n_reset) begin
            a   <= '0;
            b   <= '0;
            cf  <= '0;
            ip  <= '0;
            out <= '0;
        end else begin
            a   <= next_a;
            b   <= next_b;
            cf  <= next_cf;
            ip  <= next_ip;
            out <= next_out;
        end
    end

    logic [3:0] opecode, imm;       // ROMのデータを命令部分と即値部分に分ける
    assign opecode  = data[7:4];    // 上位4ビットから実行する命令を取り出す
    assign imm      = data[3:0];    // 下位4ビットを命令の即値として使う
    assign addr     = ip;           // 現在の命令位置をROMの読み出し先に指定
    assign led      = out;          // 出力レジスタの内容をLEDへ送る

    always_comb begin
        // はじめに、命令を実行しない場合の次状態を設定する
        next_a      = a;            // Aの内容を維持
        next_b      = b;            // Bの内容を維持
        next_cf     = 1'b0;         // 桁上がりがなければ0
        next_ip     = ip + 4'd1;    // 次の番地へ進む
        next_out    = out;          // LEDの表示を維持

        // 命令に応じて、変更が必要な次状態だけを書き換える
        unique case (opecode)
            4'b0000:                                    // ADD A, IMM
            4'b0101:                                    // ADD B, IMM
            4'b0011:                                    // MOV A, IMM
            4'b0111:                                    // MOV B, IMM
            4'b0001:                                    // MOV A, B
            4'b0100:                                    // MOV B, A
            4'b1111:                                    // JMP IMM
            4'b1110:                                    // JNC IMM
            4'b0010:                                    // IN A
            4'b0110:                                    // IN B
            4'b1001:                                    // OUT B
            4'b1011:                                    // OUT IMM
            default: ;
        endcase
    end
endmodule
