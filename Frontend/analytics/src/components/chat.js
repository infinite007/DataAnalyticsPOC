// src/components/chat.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart2 } from "lucide-react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

function HighchartsViz({ rows }) {
  if (!rows || !rows.length) return null;
  const keys = Object.keys(rows[0] || {});
  const xKey = keys.find(k => typeof rows[0][k] === "string" || typeof rows[0][k] === "number") || keys[0];
  const yKeys = keys.filter(k => k !== xKey && typeof rows[0][k] === "number");

  const options = {
    chart: { type: "line", height: 360 },
    title: { text: undefined },
    xAxis: { categories: rows.map(r => String(r[xKey])) },
    yAxis: { title: { text: "Values" } },
    tooltip: { shared: true },
    series: yKeys.map(k => ({
      type: "line",
      name: k,
      data: rows.map(r => Number(r[k]))
    })),
    credits: { enabled: false }
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

function toCSV(rows) {
  if (!rows || !rows.length) return "";
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))));
  const esc = (s) => {
    const t = String(s ?? "");
    return /[\",\n]/.test(t) ? '\"' + t.replace(/\"/g, '\"\"') + '\"' : t;
  };
  return cols.join(",") + "\n" + rows.map(r => cols.map(c => esc(r[c])).join(",")).join("\n");
}

function Avatar({ role }) {
  const badge = role === "user" ? "U" : role === "assistant" ? "A" : "S";
  const bg = role === "user" ? "bg-blue-600" : role === "assistant" ? "bg-zinc-800" : "bg-amber-600";
  return (
    <div className={`h-8 w-8 rounded-full ${bg} text-white grid place-items-center text-sm font-semibold shadow`}>{badge}</div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center text-zinc-500">
      <span className="animate-bounce [animation-delay:-0.2s]">•</span>
      <span className="animate-bounce [animation-delay:-0.1s]">•</span>
      <span className="animate-bounce">•</span>
    </div>
  );
}

function isRecordArray(v) {
  return Array.isArray(v) && v.every(row => row && typeof row === "object" && !Array.isArray(row));
}

function RecordsTable({ rows }) {
  const cols = useMemo(() => {
    const keys = new Set();
    (rows || []).forEach(r => Object.keys(r || {}).forEach(k => keys.add(k)));
    return Array.from(keys);
  }, [rows]);

  if (!rows || !rows.length) return <div className="text-sm text-zinc-500">No rows.</div>;

  return (
    <div className="overflow-x-auto border border-zinc-200 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50">
          <tr>
            {cols.map(c => (
              <th key={c} className="text-left font-semibold px-3 py-2 border-b border-zinc-200">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-zinc-50">
              {cols.map(c => (
                <td key={c} className="px-3 py-2 align-top border-b border-zinc-100 text-zinc-800 break-words">
                  {String((r && r[c]) ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "";

export default function ChatApp({ onPin }) {
  const [messages, setMessages] = useState([
    { id: (crypto?.randomUUID?.() || String(Date.now() + Math.random())), role: "assistant", text: "Hi! Ask me anything about your data. I can convert natural language to SQL and show results as a table." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg = { id: (crypto?.randomUUID?.() || String(Date.now() + Math.random())), role: "user", text: q };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const recs = isRecordArray(data && data.output) ? data.output : undefined;
      const text = (data && typeof data.content === "string" && data.content)
        ? data.content
        : (recs ? `Returned ${recs.length} row(s).` : JSON.stringify(data));

      const assistantMsg = {
        id: (crypto?.randomUUID?.() || String(Date.now() + Math.random())),
        role: "assistant",
        text,
        records: recs,
        raw: data
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { id: (crypto?.randomUUID?.() || String(Date.now() + Math.random())), role: "assistant", text: `⚠️ Error: ${err && err.message ? err.message : String(err)}` }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if ((e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-900">
      <header className="sticky top-0 backdrop-blur bg-white/70 border-b border-zinc-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-black text-white grid place-items-center text-xs font-bold">AI</div>
            <div>
              <div className="font-semibold leading-tight">SQL Agent Chat</div>
              <div className="text-xs text-zinc-500">Connected to {API_BASE || "/query (same origin)"}</div>
            </div>
          </div>
          <div className="text-xs text-zinc-500">Press <kbd className="px-1 py-0.5 border rounded">Enter</kbd> to send</div>
        </div>
      </header>

      <main className="flex-1 px-4">
        <div ref={listRef} className="h-[calc(100vh-200px)] overflow-y-auto py-4 space-y-2">
          {messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role !== "user" && <Avatar role={m.role} />}
              <div className="flex-1 max-w-[80%]">
                <div className={`w-full flex ${m.role === "user" ? "justify-end" : "justify-start"} my-2`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${m.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-zinc-200"}`}>
                    {m.text && <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>}

                    {m.records && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-zinc-600">
                            <BarChart2 className="h-4 w-4" />
                            <span>Data ({m.records.length} rows)</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              onClick={() => {
                                const csv = toCSV(m.records);
                                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url; a.download = `results-${Date.now()}.csv`; a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="px-2.5 py-1.5 rounded-xl border bg-white border-zinc-300"
                            >
                              Export CSV
                            </button>
                            <button
                              onClick={() => onPin && onPin({ rows: m.records, title: m.text ? m.text.slice(0, 64) : undefined })}
                              className="px-2.5 py-1.5 rounded-xl border bg-white border-zinc-300"
                            >
                              Pin to canvas
                            </button>
                          </div>
                        </div>

                        <RecordsTable rows={m.records} />
                        <HighchartsViz rows={m.records} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {m.role === "user" && <Avatar role={m.role} />}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-center text-zinc-600">
              <Avatar role="assistant" />
              <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-sm"><TypingDots /></div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 resize-none rounded-2xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 p-3 min-h-[44px] max-h-40 bg-white"
              placeholder="Ask a question about your data…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-2xl px-4 h-11 bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow hover:bg-blue-700 transition"
            >
              Send
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}