// Technical probe, not the final teaching template.
// C is exposed as 1 for carry; reset is active low.
module td4 (
  input wire clk, reset_n,
  input wire [7:0] instruction,
  input wire [3:0] in_port,
  output reg [3:0] a, b, pc, out_port,
  output reg carry,
  output wire [4:0] sum
);
  wire [1:0] source_select;
  wire [3:0] operand;
  wire jump;
  assign source_select = instruction[7:6] == 2'b11
    ? 2'b11 : instruction[5:4];
  assign operand = source_select == 0 ? a :
                   source_select == 1 ? b :
                   source_select == 2 ? in_port : 4'b0000;
  assign sum = {1'b0, operand} + {1'b0, instruction[3:0]};
  assign jump = instruction[7:6] == 2'b11 &&
                (instruction[4] || !carry);
  always @(posedge clk or negedge reset_n) begin
    if (!reset_n) begin
      a <= 0;
      b <= 0;
      pc <= 0;
      out_port <= 0;
      carry <= 0;
    end else begin
      if (instruction[7:6] == 0) a <= sum[3:0];
      if (instruction[7:6] == 1) b <= sum[3:0];
      if (instruction[7:6] == 2) out_port <= sum[3:0];
      pc <= jump ? sum[3:0] : pc + 4'b0001;
      carry <= sum[4];
    end
  end
endmodule
