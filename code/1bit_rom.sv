module rom(
    input   logic addr,
    output  logic data
);
    always_comb begin
        case (addr) // addrは命令ポインタ（address）
            // addrで指定された番地の命令を出力する
            1'b0: data = 1'b1;  // NOT
            1'b1: data = 1'b0;  // NOP
        endcase
    end
endmodule
