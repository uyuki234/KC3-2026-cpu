module rom(
    input   logic addr,
    output  logic data
);
    always_comb begin
        case (addr) // addrは命令ポインタ（address）
            // ここで記述した順に、命令が実行される
            1'b0: data = 1'b1;  // NOT
            1'b1: data = 1'b0;  // NOP
        endcase
    end
endmodule
