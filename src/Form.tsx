import { useState } from "react";
import type { FormInput, QuestionKey, Stage } from "./lib/schema.js";
import { QUESTION_KEYS } from "./lib/schema.js";

const STAGES: { value: Stage; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "pre_launch", label: "Pre-launch" },
  { value: "launched", label: "Launched" },
  { value: "revenue", label: "Revenue" },
  { value: "growth", label: "Growth" },
];

interface QuestionField {
  key: QuestionKey;
  label: string;
  question: string;
}

const QUESTIONS: QuestionField[] = [
  {
    key: "q1_demand_reality",
    label: "Demand reality",
    question:
      "What's the strongest evidence you have that someone actually wants this — not 'is interested,' not 'signed up for a waitlist,' but would be genuinely upset if it disappeared tomorrow?",
  },
  {
    key: "q2_status_quo",
    label: "Status quo",
    question:
      "What are your users doing right now to solve this problem — even badly? What does that workaround cost them?",
  },
  {
    key: "q3_desperate_specificity",
    label: "Desperate specificity",
    question:
      "Name the actual human who needs this most. What's their title? What gets them promoted? What gets them fired? What keeps them up at night?",
  },
  {
    key: "q4_narrowest_wedge",
    label: "Narrowest wedge",
    question:
      "What's the smallest possible version of this that someone would pay real money for — this week, not after you build the platform?",
  },
  {
    key: "q5_observation_surprise",
    label: "Observation & surprise",
    question:
      "Have you actually sat down and watched someone use this without helping them? What did they do that surprised you?",
  },
  {
    key: "q6_future_fit",
    label: "Future-fit",
    question:
      "If the world looks meaningfully different in 3 years — and it will — does your product become more essential or less?",
  },
];

const EMPTY: FormInput["questions"] = {
  q1_demand_reality: "",
  q2_status_quo: "",
  q3_desperate_specificity: "",
  q4_narrowest_wedge: "",
  q5_observation_surprise: "",
  q6_future_fit: "",
};

type Props = {
  onSubmit: (form: FormInput) => void;
  loading: boolean;
};

export default function Form({ onSubmit, loading }: Props) {
  const [startupName, setStartupName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [stage, setStage] = useState<Stage>("idea");
  const [questions, setQuestions] = useState<FormInput["questions"]>(EMPTY);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      startup_name: startupName.trim(),
      one_liner: oneLiner.trim(),
      stage,
      questions: QUESTION_KEYS.reduce((acc, k) => {
        acc[k] = questions[k].trim();
        return acc;
      }, { ...EMPTY }),
    });
  }

  const allFilled =
    startupName.trim().length > 0 &&
    oneLiner.trim().length > 0 &&
    QUESTIONS.every((q) => questions[q.key].trim().length > 0);

  return (
    <form className="analyzer" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="name">Startup name</label>
        <input
          id="name"
          value={startupName}
          onChange={(e) => setStartupName(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="oneliner">One-liner</label>
        <span className="hint">One sentence: what you do, for whom.</span>
        <input
          id="oneliner"
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
          maxLength={280}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="stage">Stage</label>
        <select id="stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {QUESTIONS.map((q, i) => (
        <div className="field" key={q.key}>
          <label htmlFor={q.key}>
            {i + 1}. {q.label}
          </label>
          <span className="hint">{q.question}</span>
          <textarea
            id={q.key}
            value={questions[q.key]}
            onChange={(e) =>
              setQuestions({ ...questions, [q.key]: e.target.value })
            }
            maxLength={2000}
            required
          />
        </div>
      ))}

      <button type="submit" className="primary" disabled={loading || !allFilled}>
        {loading ? "Diagnosing…" : "Diagnose with YC knowledge"}
      </button>
    </form>
  );
}
