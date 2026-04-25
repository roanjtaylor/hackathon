import { useState } from "react";
import type { AnalyzerOutput, NextAction, QuestionKey } from "./lib/schema.js";
import { QUESTION_KEYS } from "./lib/schema.js";

const QUESTION_LABEL: Record<QuestionKey, string> = {
  q1_demand_reality: "Demand reality",
  q2_status_quo: "Status quo",
  q3_desperate_specificity: "Desperate specificity",
  q4_narrowest_wedge: "Narrowest wedge",
  q5_observation_surprise: "Observation & surprise",
  q6_future_fit: "Future-fit",
};

interface AggregatedAction extends NextAction {
  fromLabel: string;
}

export default function Report({ output }: { output: AnalyzerOutput }) {
  const aggregated: AggregatedAction[] = [];
  for (const key of QUESTION_KEYS) {
    for (const a of output.questions[key].next_actions) {
      aggregated.push({ ...a, fromLabel: QUESTION_LABEL[key] });
    }
  }
  aggregated.sort((a, b) => a.deadline_days - b.deadline_days);

  return (
    <div>
      <article className="headline-card">
        <span className="grade-label">The one thing</span>
        <p className="headline">{output.headline}</p>
      </article>

      {QUESTION_KEYS.map((key, i) => (
        <QuestionCard
          key={key}
          number={i + 1}
          label={QUESTION_LABEL[key]}
          grade={output.questions[key]}
        />
      ))}

      {output.comparables.length > 0 && (
        <section className="comparables">
          <h2>Companies who faced this</h2>
          {output.comparables.map((c, i) => (
            <article key={i} className="comparable-card">
              <header>
                <h3>{c.company}</h3>
                <span className="grade-label">{c.stage}</span>
              </header>
              <p className="cmp-line"><strong>Situation.</strong> {c.situation}</p>
              <p className="cmp-line"><strong>Action.</strong> {c.action}</p>
              <p className="cmp-line"><strong>Result.</strong> {c.result}</p>
              <p className="cmp-lesson">{c.lesson}</p>
              {c.url && (
                <a className="cmp-source" href={c.url} target="_blank" rel="noreferrer">
                  source ↗
                </a>
              )}
            </article>
          ))}
        </section>
      )}

      {output.prescribed_reading.length > 0 && (
        <section className="reading">
          <h2>Read this week</h2>
          <ul>
            {output.prescribed_reading.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
                <span className="reading-why"> — {r.why_for_you}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aggregated.length > 0 && (
        <section className="checklist">
          <h2>This week's checklist</h2>
          <ul>
            {aggregated.map((a, i) => (
              <li key={i}>
                <input type="checkbox" />{" "}
                <span>{a.text}</span>
                <span className="deadline"> · in {a.deadline_days}d</span>
                <span className="from-label"> · {a.fromLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuestionCard({
  number,
  label,
  grade,
}: {
  number: number;
  label: string;
  grade: AnalyzerOutput["questions"][QuestionKey];
}) {
  const [open, setOpen] = useState(true);
  return (
    <article className="section-card">
      <header onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        <span className={`dot ${grade.grade ?? ""}`} aria-hidden="true" />
        <h2>
          {number}. {label}
        </h2>
        <span className="grade-label">{grade.grade ?? "no direct YC source"}</span>
        <span className="toggle" aria-hidden="true">{open ? "−" : "+"}</span>
      </header>

      {open && (
        <>
          {grade.quote && (
            <blockquote className="quote-card">
              “{grade.quote}”
              <span className="src">
                — {grade.source_title ?? "YC source"}
                {grade.source_url && (
                  <>
                    {" "}
                    <a href={grade.source_url} target="_blank" rel="noreferrer">
                      [source ↗]
                    </a>
                  </>
                )}
              </span>
            </blockquote>
          )}

          <p className="analysis">{grade.analysis}</p>

          {grade.next_actions.length > 0 && (
            <div className="actions">
              <h3>Next actions</h3>
              <ul>
                {grade.next_actions.map((a, i) => (
                  <li key={i}>
                    {a.text}
                    <span className="deadline">· in {a.deadline_days}d</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </article>
  );
}
