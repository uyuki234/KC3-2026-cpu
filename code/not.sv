module not_gate (
    input  logic a,
    output logic y
);
    always_comb begin
        y = ~a;
    end
endmodule
