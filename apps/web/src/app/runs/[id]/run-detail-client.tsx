"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CaseResultSummary, CaseScore, LlmTrace, RunDetail, RunSummary } from "@test-evals/shared";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:8787";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function fmt(n: number, decimals = 3): string {
  return n.toFixed(decimals);
}

function RunHeader({ run }: { run: RunSummary }) {
  return (
    <div className="mb-6 rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {run.strategy} / {run.model.split("-").slice(0, 3).join("-")}
          </h1>
          <p className="mt-1 font-mono text-xs text-gray-500">
            {run.id} · hash: {run.prompt_hash}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            run.status === "completed"
              ? "bg-green-100 text-green-700"
              : run.status === "running"
                ? "bg-blue-100 text-blue-700"
                : run.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
          }`}
        >
          {run.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <Stat label="Cases" value={`${run.completed_cases_count}/${run.total_cases_count}`} />
        <Stat label="Cost" value={`$${run.cost_usd.toFixed(4)}`} />
        <Stat label="Tokens in" value={run.tokens_in.toLocaleString()} />
        <Stat label="Cache reads" value={run.cache_read_tokens.toLocaleString()} />
        <Stat label="Duration" value={run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-mono text-sm font-medium">{value}</p>
    </div>
  );
}

function ScoreCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="px-3 py-2 text-center text-gray-400">—</td>;
  const color = value >= 0.8 ? "text-green-700" : value >= 0.5 ? "text-amber-600" : "text-red-600";
  return (
    <td className={`px-3 py-2 text-center font-mono text-xs ${color}`}>{fmt(value)}</td>
  );
}

function CaseRow({
  cr,
  expanded,
  onToggle,
}: {
  cr: CaseResultSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const scores = cr.scores as CaseScore | null;
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-mono text-xs">{cr.transcript_id}</td>
        <td className="px-3 py-2">
          <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLORS[cr.status] ?? ""}`}>
            {cr.status}
          </span>
        </td>
        <td className="px-3 py-2 text-center text-xs">{cr.attempt_count}</td>
        <td className="px-3 py-2 text-center text-xs">{cr.schema_valid ? "✓" : "✗"}</td>
        <ScoreCell value={scores?.chief_complaint.ratio} />
        <ScoreCell value={scores?.vitals.aggregate} />
        <ScoreCell value={scores?.medications.f1} />
        <ScoreCell value={scores?.diagnoses.f1} />
        <ScoreCell value={scores?.plan.f1} />
        <td className="px-3 py-2 text-center text-xs text-gray-600">{cr.hallucination_count}</td>
        <ScoreCell value={scores?.aggregate_f1} />
        <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
          ${cr.cost_usd.toFixed(4)}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className="bg-gray-50 px-4 py-4">
            <CaseDetail cr={cr} />
          </td>
        </tr>
      )}
    </>
  );
}

function CaseDetail({ cr }: { cr: CaseResultSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Transcript</h3>
          <pre className="h-64 overflow-auto rounded border bg-white p-3 font-mono text-xs">
            {cr.transcript_id}
          </pre>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Gold</h3>
          <pre className="h-64 overflow-auto rounded border bg-white p-3 font-mono text-xs">
            {JSON.stringify(cr.prediction, null, 2)}
          </pre>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-gray-500">Predicted</h3>
          <pre className="h-64 overflow-auto rounded border bg-white p-3 font-mono text-xs">
            {JSON.stringify(cr.prediction, null, 2)}
          </pre>
        </div>
      </div>
      {cr.traces && cr.traces.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase text-gray-500">
            LLM Trace ({cr.traces.length} attempt{cr.traces.length !== 1 ? "s" : ""})
          </summary>
          <div className="mt-2 space-y-2">
            {cr.traces.map((trace: LlmTrace) => (
              <div key={trace.id} className="rounded border bg-white p-3">
                <div className="mb-1 text-xs font-medium text-gray-600">
                  Attempt {trace.attempt} · cache_read={trace.cache_read_tokens}
                </div>
                <pre className="overflow-auto text-xs text-gray-700">
                  {JSON.stringify(trace.response_payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function RunDetailClient({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const fetchRun = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/v1/runs/${runId}`);
      const data = (await res.json()) as RunDetail;
      setRun(data);
      return data;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRun().then((data) => {
      if (data?.status === "running" || data?.status === "pending") {
        const es = new EventSource(`${SERVER_URL}/api/v1/runs/${runId}/stream`);
        esRef.current = es;
        es.addEventListener("case_complete", () => {
          void fetchRun();
        });
        es.addEventListener("run_complete", () => {
          void fetchRun();
          es.close();
        });
      }
    });
    return () => {
      esRef.current?.close();
    };
  }, [runId]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  if (!run) return <div className="p-6 text-sm text-red-500">Run not found</div>;

  const cases = run.case_results ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/runs" className="hover:underline">Runs</Link>
        <span>›</span>
        <span className="font-mono">{runId.slice(0, 8)}…</span>
      </div>

      <RunHeader run={run} />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-3 text-left">Case</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-center">Tries</th>
              <th className="px-3 py-3 text-center">Schema</th>
              <th className="px-3 py-3 text-center">CC</th>
              <th className="px-3 py-3 text-center">Vitals</th>
              <th className="px-3 py-3 text-center">Med F1</th>
              <th className="px-3 py-3 text-center">Dx F1</th>
              <th className="px-3 py-3 text-center">Plan F1</th>
              <th className="px-3 py-3 text-center">Halluc</th>
              <th className="px-3 py-3 text-center">Agg F1</th>
              <th className="px-3 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cases.map((cr) => (
              <CaseRow
                key={cr.id}
                cr={cr}
                expanded={expandedCase === cr.id}
                onToggle={() => setExpandedCase(expandedCase === cr.id ? null : cr.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
