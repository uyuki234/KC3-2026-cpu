export type LessonId = 'adder' | 'register' | 'pc';
export type Sources = Record<LessonId, string>;
export type Mode = 'observe' | 'build' | 'run';
export interface SourceFile {
  name: string;
  source: string;
}
export interface EngineResult {
  ok: boolean;
  output: string[];
  diagnostics: string[];
  error?: string;
  totalMs?: number;
}
export interface CpuState {
  pc: string;
  a: string;
  b: string;
  out: string;
  carry: string;
}
export interface Frame {
  cycle: number;
  executedPc: string;
  instruction: string;
  state: CpuState;
  input: string;
  sum: string;
}
export interface InputEvent {
  cycle: number;
  value: number;
}
export interface TestRow {
  name: string;
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
}
export interface SavedProject {
  version: 1;
  sources: Sources;
  passed: Partial<Sources>;
  rom: number[];
}
