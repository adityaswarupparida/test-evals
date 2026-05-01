"use client";

import { useEffect, useState } from "react";
import type { CompareResponse, FieldDelta, RunSummary } from "@test-evals/shared";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:8787";

const FIELD_LABELS: Record<string, string> = {
  chief_complaint: "Chief Complaint",
  vitals: "Vitals",
  medications_f1: "Medications F1",
  diagnoses_f1: "Diagnoses F1",
  plan_f1: "Plan F1",
  follow_up: "Follow-up",
  aggregate_f1: "Aggregate F1",
  hallucination_count: "Hallucinations ↓",
  schema_failures: "Schema Failures ↓",
};

// Lower is better for these fields (↓ indicator)
const LOWER_IS_BETTER = new Set(["hallucination_count", "schema_failures"]);

function DeltaCell({ delta, winner }: { delta: number; winner: FieldDelta["winner"] }) {
  const formatted = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);
  const color = winner === "tie" ? "text-gray-500" : Math.abs(delta) > 0.05 ? "font-semibold" : "";
  return <span className={`font-mono text-xs ${color}`}>{formatted}</span>;
}

function WinnerBadge({ winner, label }: { winner: FieldDelta["winner"]; label: "A" | "B" }) {
  if (winner !== label.toLowerCase()) return null;
  return (
    <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">
      ✓
    </span>
  );
}

export default function ComparePage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/v1/runs`)
      .then((r) => r.json() as Promise<RunSummary[]>)
      .then((data) => setRuns(data.filter((r) => r.status === "completed")))
      .catch(() => {});
  }, []);

  const compare = async () => {
    if (!runA || !runB) return;
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/v1/compare?a=${runA}&b=${runB}`);
      const data = (await res.json()) as CompareResponse;
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const runLabel = (id: string) => {
    const run = runs.find((r) => r.id === id);
    if (!run) return id;
    return `${run.strategy} · ${run.model.split("-").slice(0, 3).join("-")} · ${run.id.slice(0, 6)}`;
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold">Compare Runs</h1>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Run A</label>
          <select
            value={runA}
            onChange={(e) => setRunA(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Select a run…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.strategy} · {r.model.split("-").slice(0, 3).join("-")} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Run B</label>
          <select
            value={runB}
            onChange={(e) => setRunB(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Select a run…</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.strategy} · {r.model.split("-").slice(0, 3).join("-")} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={() => void compare()}
        disabled={!runA || !runB || loading}
        className="mb-8 rounded bg-blue-600 px-6 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {loading ? "Comparing…" : "Compare"}
      </button>

      {result && (
        <div>
          {/* Overall winner */}
          {(() => {
            const wins = { a: 0, b: 0 };
            for (const d of result.field_deltas) {
              if (d.winner === "a") wins.a++;
              else if (d.winner === "b") wins.b++;
            }
            const overallWinner =
              wins.a > wins.b ? "A" : wins.b > wins.a ? "B" : null;
            return (
              <div className="mb-4 rounded-lg border-2 border-blue-200 bg-blue-50 p-4 text-center">
                {overallWinner ? (
                  <p className="text-lg font-semibold text-blue-800">
                    Run {overallWinner} wins overall ({wins[overallWinner.toLowerCase() as "a" | "b"]} fields vs{" "}
                    {wins[overallWinner === "A" ? "b" : "a"]})
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-gray-700">Tied overall</p>
                )}
                <p className="mt-1 text-xs text-gray-600">
                  A: {runLabel(result.run_a.id)} &nbsp;|&nbsp; B: {runLabel(result.run_b.id)}
                </p>
              </div>
            );
          })()}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Field</th>
                  <th className="px-4 py-3 text-center">Run A</th>
                  <th className="px-4 py-3 text-center">Run B</th>
                  <th className="px-4 py-3 text-center">Delta (A−B)</th>
                  <th className="px-4 py-3 text-center">Winner</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.field_deltas.map((d) => {
                  const isLower = LOWER_IS_BETTER.has(d.field);
                  const rowBg =
                    d.winner === "a"
                      ? "bg-green-50"
                      : d.winner === "b"
                        ? "bg-amber-50"
                        : "";
                  // Highlight the largest delta row
                  return (
                    <tr key={d.field} className={rowBg}>
                      <td className="px-4 py-3 font-medium">
                        {FIELD_LABELS[d.field] ?? d.field}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {d.score_a.toFixed(3)}
                        <WinnerBadge winner={d.winner} label="A" />
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs">
                        {d.score_b.toFixed(3)}
                        <WinnerBadge winner={d.winner} label="B" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DeltaCell delta={isLower ? -d.delta : d.delta} winner={d.winner} />
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {d.winner === "tie" ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${d.winner === "a" ? "text-green-700" : "text-amber-600"}`}
                          >
                            Run {d.winner.toUpperCase()}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
