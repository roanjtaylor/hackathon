import { useState } from "react";
import Form from "./Form.js";
import Report from "./Report.js";
import { AnalyzerOutput, type FormInput } from "./lib/schema.js";

type Result = { output: ReturnType<typeof AnalyzerOutput.parse>; meta?: unknown };

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function analyze(form: FormInput) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail ?? "");
        throw new Error(`${json.error ?? "Request failed"}${detail ? `\n${detail}` : ""}`);
      }
      const parsed = AnalyzerOutput.safeParse(json.output);
      if (!parsed.success) {
        throw new Error(`Bad response shape: ${JSON.stringify(parsed.error.flatten())}`);
      }
      setResult({ output: parsed.data, meta: json.meta });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <header className="app">
        <h1>Belfast Founders</h1>
        <p>Drop in your startup. Get a YC-style read with verbatim sources.</p>
      </header>

      {!result && !loading && (
        <Form onSubmit={analyze} loading={loading} />
      )}

      {loading && (
        <div className="loading">Reading the YC corpus and grading your startup…</div>
      )}

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className="toolbar">
            <span className="grade-label">Analysis</span>
            <button onClick={() => { setResult(null); setError(null); }}>
              ← New analysis
            </button>
          </div>
          <Report output={result.output} />
        </>
      )}
    </div>
  );
}
