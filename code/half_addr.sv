// 半加算器（s：和、c：桁上がり）
module half_adder (
    input  logic a,
    input  logic b,
    output logic s,
    output logic c
);
    always_comb begin
        s = a ^ b;  // ^はXORで、入力が異なるときに1になる。
        c = a & b;
    end
endmodule
