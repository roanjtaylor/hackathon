import { z } from "zod";

// Stage union retained for backward compatibility. Only the first three are
// supported in v1 prompts and rubrics; revenue/growth are deferred.
export const Stage = z.enum(["idea", "pre_launch", "launched", "revenue", "growth"]);
export type Stage = z.infer<typeof Stage>;

// The six office-hours questions from Garry Tan's GStack /office-hours skill,
// in order. Used as both the form keys and the report grading keys.
export const QUESTION_KEYS = [
  "q1_demand_reality",
  "q2_status_quo",
  "q3_desperate_specificity",
  "q4_narrowest_wedge",
  "q5_observation_surprise",
  "q6_future_fit",
] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

export const FormInput = z.object({
  startup_name: z.string().min(1).max(120),
  one_liner: z.string().min(1).max(280),
  stage: Stage,
  questions: z.object({
    q1_demand_reality: z.string().min(1).max(2000),
    q2_status_quo: z.string().min(1).max(2000),
    q3_desperate_specificity: z.string().min(1).max(2000),
    q4_narrowest_wedge: z.string().min(1).max(2000),
    q5_observation_surprise: z.string().min(1).max(2000),
    q6_future_fit: z.string().min(1).max(2000),
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

// Phase 1 output — the diagnostic reasoning step under the worldview prompt.
export const Diagnosis = z.object({
  company_shape: z.string().min(1).max(280),
  stage_signals: z.array(z.string().min(1).max(140)).max(12),
  dominant_failure_mode: z.string().min(1).max(200),
  anti_patterns_suspected: z.array(z.string().min(1).max(200)).max(8),
  the_one_thing: z.string().min(1).max(280),
  retrieval_tags: z.array(z.string().min(1).max(60)).min(1).max(12),
});
export type Diagnosis = z.infer<typeof Diagnosis>;

// Comparables corpus: hand-curated YC-or-equivalent company stories.
export const Company = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  stage: z.enum(["idea", "pre_launch", "launched"]),
  year: z.number().int(),
  outcome: z.enum(["success", "failure"]),
  situation: z.string().min(1),
  action: z.string().min(1),
  result: z.string().min(1),
  lesson: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  source: z.string().min(1),
  url: z.string().min(1),
});
export type Company = z.infer<typeof Company>;

export const QuestionGrade = z.object({
  grade: Grade.nullable(),
  quote: z.string().nullable(),
  source_title: z.string().nullable(),
  source_url: z.string().nullable(),
  analysis: z.string().min(1),
  next_actions: z.array(NextAction).min(1).max(2),
});
export type QuestionGrade = z.infer<typeof QuestionGrade>;

export const ComparableRef = z.object({
  company: z.string().min(1),
  stage: z.string().min(1),
  situation: z.string().min(1),
  action: z.string().min(1),
  result: z.string().min(1),
  lesson: z.string().min(1),
  url: z.string().min(1),
});
export type ComparableRef = z.infer<typeof ComparableRef>;

export const PrescribedRead = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  why_for_you: z.string().min(1),
});
export type PrescribedRead = z.infer<typeof PrescribedRead>;

export const AnalyzerOutput = z.object({
  headline: z.string().min(1).max(280),
  questions: z.object({
    q1_demand_reality: QuestionGrade,
    q2_status_quo: QuestionGrade,
    q3_desperate_specificity: QuestionGrade,
    q4_narrowest_wedge: QuestionGrade,
    q5_observation_surprise: QuestionGrade,
    q6_future_fit: QuestionGrade,
  }),
  comparables: z.array(ComparableRef).min(2).max(3),
  prescribed_reading: z.array(PrescribedRead).min(2).max(3),
});
export type AnalyzerOutput = z.infer<typeof AnalyzerOutput>;
