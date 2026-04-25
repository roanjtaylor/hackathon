import { z } from "zod";

export const Stage = z.enum(["idea", "pre_launch", "launched", "revenue", "growth"]);
export type Stage = z.infer<typeof Stage>;

export const SECTION_KEYS = [
  "problem",
  "customer",
  "solution",
  "traction",
  "biggest_blocker",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const FormInput = z.object({
  startup_name: z.string().min(1).max(120),
  one_liner: z.string().min(1).max(280),
  stage: Stage,
  sections: z.object({
    problem: z.string().min(1).max(2000),
    customer: z.string().min(1).max(2000),
    solution: z.string().min(1).max(2000),
    traction: z.string().min(1).max(2000),
    biggest_blocker: z.string().min(1).max(2000),
  }),
});
export type FormInput = z.infer<typeof FormInput>;

export const Grade = z.enum(["green", "yellow", "red"]);
export type Grade = z.infer<typeof Grade>;

export const NextAction = z.object({
  text: z.string().min(1).max(280),
  deadline_days: z.number().int().min(1).max(7),
});
export type NextAction = z.infer<typeof NextAction>;

export const SectionResult = z.object({
  grade: Grade.nullable(),
  quote: z.string().nullable(),
  source_title: z.string().nullable(),
  source_url: z.string().nullable(),
  analysis: z.string().min(1),
  next_actions: z.array(NextAction).max(2),
});
export type SectionResult = z.infer<typeof SectionResult>;

export const AnalyzerOutput = z.object({
  problem: SectionResult,
  customer: SectionResult,
  solution: SectionResult,
  traction: SectionResult,
  biggest_blocker: SectionResult,
});
export type AnalyzerOutput = z.infer<typeof AnalyzerOutput>;
