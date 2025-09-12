import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Drop this component into any React app (Vite/Next). It renders a chat UI
 * similar to the linked demo. Point API_BASE to your FastAPI server
 * that exposes POST /query {"query": string} and returns
 * { output: any, query: string | null, content: string }
 *
 * Quick start (Vite):
 *   - npm create vite@latest my-chat -- --template react-ts
 *   - cd my-chat && npm i
 *   - replace App.tsx with this file's default export
 *   - npm i lucide-react
 *   - npm run dev
 *
 *   Optionally set an env var (Vite): VITE_API_BASE=http://127.0.0.1:8000
 */

// Minimal avatar bubbles
function Avatar({ role }: { role: "user" | "assistant" | "system" }) {
  const badge = role === "user" ? "U" : role === "assistant" ? "A" : "S";
  const bg = role === "user" ? "bg-blue-600" : role === "assistant" ? "bg-zinc-800" : "bg-amber-600";
  return (
    <div className={`h-8 w-8 rounded-full ${bg} text-white grid place-items-center text-sm font-semibold shadow`}>{badge}</div>
  );
}

// Typing indicator (three dots)
function TypingDots() {
  return (
    <div className="flex gap-1 items-center text-zinc-500">
      <span className="animate-bounce [animation-delay:-0.2s]">•</span>
      <span className="animate-bounce [animation-delay:-0.1s]">•</span>
      <span className="animate-bounce">•</span>
    </div>
  );
}

// Utility to detect if output is an array of dictionary-like objects
function isRecordArray(v: any): v is Record<string, any>[] {
  return Array.isArray(v) && v.every(row => row && typeof row === "object" && !Array.isArray(row));
}

// Render a simple table for array-of-objects
function RecordsTable({ rows }: { rows: Record<string, any>[] }) {
  const cols = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach(r => Object.keys(r || {}).forEach(k => keys.add(k)));
    return Array.from(keys);
  }, [rows]);

  if (!rows.length) return <div className="text-sm text-zinc-500">No rows.</div>;

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
                  {String(r?.[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Message bubble
function Bubble({ role, children }: { role: "user" | "assistant" | "system"; children: React.ReactNode }) {
  const align = role === "user" ? "justify-end" : "justify-start";
  const bg = role === "user" ? "bg-blue-600 text-white" : "bg-white border border-zinc-200";
  return (
    <div className={`w-full flex ${align} my-2`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${bg}`}>{children}</div>
    </div>
  );
}

// Types
export type Role = "user" | "assistant" | "system";
export interface Message {
  id: string;
  role: Role;
  text?: string;
  records?: Record<string, any>[]; // when agent returns rows
  raw?: any; // raw JSON for debug
  tool?: string | null; // optional tool name
}

const API_BASE = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || ""; // same origin by default

export default function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([
    { id: crypto.randomUUID(), role: "assistant", text: "Hi! Ask me anything about your data. I can convert natural language to SQL and show results as a table." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text: q };
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
      // Expecting { content: string, output: any, query?: string }
      const recs = isRecordArray(data?.output) ? (data.output as Record<string, any>[]) : undefined;
      const text = typeof data?.content === "string" && data.content ? data.content : recs ? `Returned ${recs.length} row(s).` : JSON.stringify(data);

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text,
        records: recs,
        raw: data
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `⚠️ Error: ${err?.message || err}` }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-900">
      {/* Header */}
      <header className="sticky top-0 backdrop-blur bg-white/70 border-b border-zinc-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between py-3 px-4">
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

      {/* Messages */}
      <main className="max-w-3xl mx-auto px-4">
        <div ref={listRef} className="h-[calc(100vh-200px)] overflow-y-auto py-4 space-y-2">
          {messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role !== "user" && <Avatar role={m.role} />}
              <div className="flex-1 max-w-[80%]">
                <Bubble role={m.role}>
                  {m.text && <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>}
                  {m.records && (
                    <div className="mt-3">
                      <RecordsTable rows={m.records} />
                    </div>
                  )}
                </Bubble>
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

      {/* Composer */}
      <footer className="sticky bottom-0 border-t border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 resize-none rounded-2xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 p-3 min-h-[44px] max-h-40 bg-white"
              placeholder="Ask a question about your data…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              onClick={() => void send()}
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
