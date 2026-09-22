module cpu_1bit_next (
    input  logic opcode,
    input  logic a,
    output logic next_a
);

    always_comb begin
        case (opcode)
            1'b0:    next_a = a;   // NOP
            1'b1:    next_a = ~a;  // NOT
            default: next_a = a;
        endcase
    end

endmodule
