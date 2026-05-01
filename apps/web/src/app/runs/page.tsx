"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RunSummary, Strategy } from "@test-evals/shared";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:8787";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  interrupted: "bg-amber-100 text-amber-700",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStrategy, setNewStrategy] = useState<Strategy>("zero_shot");
  const [newModel, setNewModel] = useState("claude-haiku-4-5-20251001");
  const router = useRouter();

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/v1/runs`);
      const data = (await res.json()) as RunSummary[];
      setRuns(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, []);

  const createRun = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/v1/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: newStrategy, model: newModel }),
      });
      const run = (await res.json()) as RunSummary;
      setShowModal(false);
      router.push(`/runs/${run.id}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Eval Runs</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + New Run
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-gray-500">No runs yet. Create one to get started.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Strategy</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Cases</th>
                <th className="px-4 py-3 text-right">Agg F1</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Cache Reads</th>
                <th className="px-4 py-3 text-right">Duration</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/runs/${run.id}`} className="font-mono text-blue-600 hover:underline">
                      {run.strategy}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{run.model.split("-").slice(0, 3).join("-")}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[run.status] ?? ""}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {run.completed_cases_count}/{run.total_cases_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">—</td>
                  <td className="px-4 py-3 text-right font-mono">${run.cost_usd.toFixed(4)}</td>
                  <td className="px-4 py-3 text-right font-mono">{run.cache_read_tokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(run.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">New Eval Run</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Strategy</label>
                <select
                  value={newStrategy}
                  onChange={(e) => setNewStrategy(e.target.value as Strategy)}
                  className="w-full rounded border px-3 py-2 text-sm"
                >
                  <option value="zero_shot">zero_shot</option>
                  <option value="few_shot">few_shot</option>
                  <option value="cot">cot</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
                <input
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full rounded border px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => void createRun()}
                disabled={creating}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Start Run"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
