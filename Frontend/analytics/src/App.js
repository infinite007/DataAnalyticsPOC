// src/App.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";
import "highlight.js/styles/github.css"; // nice default theme

/* ----------------------- small helpers & UI bits ------------------------ */

function makeId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function isRecordArray(v) {
  return Array.isArray(v) && v.every(r => r && typeof r === "object" && !Array.isArray(r));
}
function Avatar({ role }) {
  const label = role === "user" ? "U" : role === "assistant" ? "A" : "S";
  return <div className={`avatar avatar-${role}`}>{label}</div>;
}
function TypingDots() {
  return (
    <div className="typing">
      <span>•</span><span>•</span><span>•</span>
    </div>
  );
}
function RecordsTable({ rows }) {
  const cols = useMemo(() => {
    const s = new Set();
    (rows || []).forEach(r => Object.keys(r || {}).forEach(k => s.add(k)));
    return Array.from(s);
  }, [rows]);

  if (!rows || !rows.length) return <div className="muted">No rows.</div>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(c => <td key={c}>{String(r?.[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Bubble({ role, children }) {
  return (
    <div className={`row ${role}`}>
      {role !== "user" && <Avatar role={role} />}
      <div className={`bubble bubble-${role}`}>{children}</div>
      {role === "user" && <Avatar role={role} />}
    </div>
  );
}
function toCSV(rows) {
  if (!rows || !rows.length) return "";
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))));
  const esc = (s) => {
    const t = String(s ?? "");
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return cols.join(",") + "\n" + rows.map(r => cols.map(c => esc(r[c])).join(",")).join("\n");
}

function MarkdownMessage({ text }) {
  if (!text) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({inline, className, children, ...props}) {
          const lang = /language-(\w+)/.exec(className || "");
          const raw = String(children ?? "").replace(/\n$/, "");
          if (inline) {
            return <code className="md-inline-code" {...props}>{raw}</code>;
          }
          let html;
          try {
            html = hljs.highlight(raw, { language: lang?.[1] || "plaintext" }).value;
          } catch {
            html = hljs.highlight(raw, { language: "plaintext" }).value;
          }
          return (
            <pre className="md-code-block">
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          );
        },
        table({children}) { return <div className="md-table-wrap"><table>{children}</table></div>; },
        a({href, children}) { return <a href={href} target="_blank" rel="noreferrer">{children}</a>; }
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function Collapsible({ children, defaultCollapsed = true, collapsedHeight = 220, show = true }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (!show) return <>{children}</>;
  return (
    <div className={`collapsible ${open ? "open" : "closed"}`}>
      <div className="collapsible-content" style={{ maxHeight: open ? "none" : collapsedHeight }}>
        {children}
      </div>
      <div className="collapsible-fade" style={{ display: open ? "none" : "block" }} />
      <button className="btn toggle" onClick={() => setOpen(v => !v)}>
        {open ? "Collapse" : "Show more"}
      </button>
    </div>
  );
}

// Treat "123", "42.0", "1e3" as numeric too
const isNumericLike = (v) => v !== null && v !== "" && Number.isFinite(Number(v));

// Sample-based column inference
function inferKeys(rows, sample = 20) {
  const first = rows?.[0] || {};
  const keys = Object.keys(first);
  if (!keys.length) return { xKey: "", yKeys: [] };

  const n = Math.min(sample, rows.length);
  const numericKeys = [];
  const categoricalKeys = [];

  for (const k of keys) {
    let numCount = 0;
    for (let i = 0; i < n; i++) {
      if (isNumericLike(rows[i]?.[k])) numCount++;
    }
    if (numCount >= Math.ceil(n * 0.6)) numericKeys.push(k); // mostly numeric
    else categoricalKeys.push(k);
  }

  // Prefer a categorical field for X (like term, date, title, name)
  let xKey =
    categoricalKeys.find(k => /term|date|year|time|code|name|title|cat|label/i.test(k)) ||
    categoricalKeys[0] ||
    keys[0];

  const yKeys = numericKeys.filter(k => k !== xKey);
  return { xKey, yKeys, keys };
}


/* --------------------------- right pane: canvas ------------------------- */

// function inferKeys(rows) {
//   const keys = Object.keys((rows && rows[0]) || {});
//   const xKey = keys.find(k => {
//     const v = rows?.[0]?.[k];
//     return typeof v === "string" || typeof v === "number";
//   }) || keys[0];
//   const yKeys = keys.filter(k => k !== xKey && typeof rows?.[0]?.[k] === "number");
//   return { xKey, yKeys, keys };
// }

function VisualCanvas({ items, onRemove }) {
  const [active, setActive] = useState(0);
  const current = items?.[active];

  const { xKey, yKeys: inferredY } = useMemo(
    () => (current ? inferKeys(current.rows) : { xKey: "", yKeys: [] }),
    [current]
  );

  const [chartType, setChartType] = useState("line"); // "line" | "column" | "area" | "pie"
  const [yKeys, setYKeys] = useState([]);
  const yFields = (yKeys && yKeys.length ? yKeys : inferredY);

  const options = useMemo(() => {
    if (!current) return {};
    const rows = current.rows || [];
    if (!rows.length || !xKey) return {};

    if (chartType === "pie") {
      const y = yFields[0] || inferredY[0];
      return {
        chart: { type: "pie", height: 360 },
        title: { text: current.title || "Chart" },
        series: [{
          type: "pie",
          name: y,
          data: rows.map(r => ({ name: String(r[xKey]), y: Number(r?.[y] ?? 0) }))
        }],
        credits: { enabled: false }
      };
    }

    return {
      chart: { type: chartType, height: 360 },
      title: { text: current.title || "Chart" },
      xAxis: { categories: rows.map(r => String(r[xKey])), title: { text: xKey } },
      yAxis: { title: { text: (yFields && yFields[0]) || "Value" } },
      tooltip: { shared: true },
      legend: { enabled: true },
      series: (yFields.length ? yFields : inferredY).map(k => ({
        type: chartType,
        name: k,
        data: rows.map(r => Number(r?.[k] ?? 0))
      })),
      credits: { enabled: false }
    };
  }, [current, chartType, xKey, yFields, inferredY]);

  if (!items || !items.length) {
    return (
      <div className="canvas-empty">
        Pin results from chat to see charts here.
      </div>
    );
  }

  return (
    <div className="canvas">
      <div className="canvas-toolbar">
        <div className="tabs">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => setActive(i)}
              className={`tab ${i === active ? "active" : ""}`}
              title={it.title || `Pinned ${i + 1}`}
            >
              {it.title || `Pinned ${i + 1}`}
            </button>
          ))}
        </div>
        <div className="tools">
          <select
            className="field"
            value={chartType}
            onChange={e => setChartType(e.target.value)}
          >
            <option value="line">line</option>
            <option value="column">column</option>
            <option value="area">area</option>
            <option value="pie">pie</option>
          </select>

          {chartType !== "pie" && !!inferredY.length && (
            <div className="y-field-picker">
              {inferredY.map(k => (
                <button
                  key={k}
                  onClick={() => setYKeys(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
                  className={`chip ${yFields.includes(k) ? "chip-on" : ""}`}
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          {onRemove && (
            <button className="btn subtle" onClick={() => onRemove(items[active].id)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="canvas-body">
        {current && (
          <>
            <div className="chart-title">{current.title || "Chart"}</div>
            <div className="chart-card">
              <HighchartsReact highcharts={Highcharts} options={options} />
            </div>
            <div className="mini-table">
              <RecordsTable rows={current.rows} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ main app ------------------------------- */

const API_BASE = process.env.REACT_APP_API_BASE || "http://0.0.0.0:5005"; // same-origin by default

export default function App() {
  const [messages, setMessages] = useState([
    { id: makeId(), role: "assistant", text: "Hi! Ask me anything about your data. I can translate natural language to SQL and show the results as a table." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // RIGHT pane items: { id, title, rows }
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    setMessages(m => [...m, { id: makeId(), role: "user", text: q }]);
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

      const recs = isRecordArray(data?.output) ? data.output : undefined;
      const text = typeof data?.content === "string" && data.content
        ? data.content
        : recs
          ? `Returned ${recs.length} row(s).`
          : JSON.stringify(data);

      setMessages(m => [...m, { id: makeId(), role: "assistant", text, records: recs, raw: data }]);
    } catch (e) {
      setMessages(m => [...m, { id: makeId(), role: "assistant", text: `⚠️ ${e?.message || e}` }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="two-pane">
      {/* LEFT: chat */}
      <div className="pane left">
        <header className="header">
          <div className="brand">SQL Agent Chat</div>
          <div className="meta">Backend: {API_BASE || "/query (same origin)"}</div>
        </header>

        <main className="main" ref={listRef}>
          {messages.map(m => (
            // <Bubble key={m.id} role={m.role}>
            //   {m.text && <div className="text">{m.text}</div>}

            //   {m.records && (
            //     <div className="records">
            //       <div className="records-toolbar">
            //         <div className="muted">{m.records.length} rows</div>
            //         <div className="gap">
            //           <button
            //             className="btn subtle"
            //             onClick={() => {
            //               const csv = toCSV(m.records);
            //               const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            //               const url = URL.createObjectURL(blob);
            //               const a = document.createElement("a");
            //               a.href = url; a.download = `results-${Date.now()}.csv`; a.click();
            //               URL.revokeObjectURL(url);
            //             }}
            //           >
            //             Export CSV
            //           </button>
            //           <button
            //             className="btn"
            //             onClick={() => {
            //               setItems(prev => [...prev, {
            //                 id: makeId(),
            //                 title: (m.text || "").slice(0, 64),
            //                 rows: m.records
            //               }]);
            //             }}
            //           >
            //             Pin to canvas
            //           </button>
            //         </div>
            //       </div>
            //       <RecordsTable rows={m.records} />
            //     </div>
            //   )}
            // </Bubble>

            <Bubble key={m.id} role={m.role}>
              {/* Pretty markdown for text */}
              {m.text && (
                <Collapsible
                  defaultCollapsed={ (m.text.length > 600) || (m.text.split("\n").length > 12) }
                  collapsedHeight={240}
                  show={true}
                >
                  <div className="md-root">
                    <MarkdownMessage text={m.text} />
                  </div>
                </Collapsible>
              )}

              {/* Table + controls, also collapsible when big */}
              {m.records && (
                <div className="records">
                  <div className="records-toolbar">
                    <div className="muted">{m.records.length} rows</div>
                    <div className="gap">
                      <button
                        className="btn subtle"
                        onClick={() => {
                          const csv = toCSV(m.records);
                          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url; a.download = `results-${Date.now()}.csv`; a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Export CSV
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          setItems(prev => [...prev, {
                            id: makeId(),
                            title: (m.text || "").slice(0, 64),
                            rows: m.records
                          }]);
                        }}
                      >
                        Pin to canvas
                      </button>
                    </div>
                  </div>

                  <Collapsible
                    defaultCollapsed={m.records.length > 30}
                    collapsedHeight={260}
                    show={m.records.length > 15}  // only show toggle if it's reasonably large
                  >
                    <RecordsTable rows={m.records} />
                  </Collapsible>
                </div>
              )}
            </Bubble>
          ))}

          {loading && (
            <div className="row assistant">
              <Avatar role="assistant" />
              <div className="bubble bubble-assistant"><TypingDots /></div>
            </div>
          )}
        </main>

        <footer className="composer">
          <textarea
            placeholder="Ask a question about your data…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button onClick={send} disabled={loading || !input.trim()}>Send</button>
        </footer>
      </div>

      {/* RIGHT: visualization canvas */}
      <div className="pane right">
        <VisualCanvas
          items={items}
          onRemove={(id) => setItems(prev => prev.filter(x => x.id !== id))}
        />
      </div>

      {/* styles */}
      <style>{`
        :root{--bg:#f6f7f9;--card:#fff;--line:#e6e7eb;--text:#0f172a;--muted:#64748b;--primary:#2563eb;}
        *{box-sizing:border-box}
        html,body,#root{height:100%}
        body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";}
        .two-pane{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:100vh}
        .pane{display:flex;flex-direction:column;min-height:100vh}
        .pane.left{border-right:1px solid var(--line);background:linear-gradient(#fafafa,#f2f4f7)}
        .pane.right{background:#fff}
        @media (max-width: 980px){.two-pane{grid-template-columns:1fr}.pane.left{order:1}.pane.right{order:2}}

        .header{position:sticky;top:0;background:rgba(255,255,255,.9);backdrop-filter:saturate(1.5) blur(6px);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;z-index:5}
        .brand{font-weight:600}
        .meta{font-size:12px;color:var(--muted)}
        .main{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:8px}
        .row{display:flex;gap:8px;align-items:flex-end;margin:6px 0}
        .row.user{justify-content:flex-end}
        .avatar{height:32px;width:32px;border-radius:999px;display:grid;place-items:center;color:#fff;font-weight:700;font-size:12px;box-shadow:0 1px 2px rgba(0,0,0,.1)}
        .avatar-user{background:#2563eb}
        .avatar-assistant{background:#111827}
        .avatar-system{background:#d97706}
        .bubble{max-width:80%;padding:10px 12px;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
        .bubble-user{background:#2563eb;color:#fff}
        .bubble-assistant{background:#fff;border:1px solid var(--line);background:#fff}
        .text{white-space:pre-wrap;line-height:1.5}
        .typing span{display:inline-block;animation:bounce 1s infinite;}
        .typing span:nth-child(1){animation-delay:-.2s}
        .typing span:nth-child(2){animation-delay:-.1s}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        .composer{position:sticky;bottom:0;display:flex;gap:8px;border-top:1px solid var(--line);padding:12px 16px;background:#fff}
        .composer textarea{flex:1;min-height:44px;max-height:140px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:10px}
        .composer button{height:44px;padding:0 16px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-weight:600;opacity:1}
        .composer button:disabled{opacity:.5}
        .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;margin-top:10px;background:#fff}
        .table{width:100%;border-collapse:collapse;font-size:14px}
        .table th,.table td{padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:left;vertical-align:top}
        .table thead th{background:#fafafa;font-weight:600}
        .muted{color:var(--muted);font-size:14px}
        .records .records-toolbar{display:flex;justify-content:space-between;align-items:center;margin:6px 2px}
        .records .gap{display:flex;gap:8px}
        .btn{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:6px 12px;font-weight:600;cursor:pointer}
        .btn.subtle{background:#fff;color:#0f172a;border:1px solid var(--line)}
        .canvas{display:flex;flex-direction:column;min-height:100vh}
        .canvas-toolbar{position:sticky;top:0;display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);background:#fff;z-index:5}
        .tabs{display:flex;flex-wrap:wrap;gap:6px}
        .tab{padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;font-size:13px}
        .tab.active{background:#111827;color:#fff;border-color:#111827}
        .tools{display:flex;gap:8px;align-items:center}
        .y-field-picker{display:flex;gap:6px;flex-wrap:wrap}
        .chip{padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:12px;cursor:pointer}
        .chip-on{background:#2563eb;color:#fff;border-color:#2563eb}
        .field{padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:13px}
        .canvas-body{flex:1;overflow:auto;padding:12px}
        .chart-title{font-weight:600;margin-bottom:8px}
        .chart-card{border:1px solid var(--line);border-radius:12px;background:#fff;padding:8px}
        .mini-table{margin-top:12px}
        /* Markdown look & feel inside bubbles */
        .md-root { line-height: 1.55; font-size: 14.5px; }
        .md-root p { margin: 0 0 0.6rem 0; }
        .md-root h1,.md-root h2,.md-root h3{ margin: .6rem 0 .4rem; line-height:1.25 }
        .md-root ul,.md-root ol{ padding-left: 1.25rem; margin: .4rem 0 .8rem; }
        .md-root blockquote{ margin: .6rem 0; padding: .4rem .8rem; border-left: 3px solid #e5e7eb; background: #fafafa; border-radius: 8px; }
        .md-inline-code { background:#f6f8fa; padding:.1rem .35rem; border:1px solid #e5e7eb; border-radius:6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .md-code-block { background:#0b1020; color:#fff; border-radius:12px; overflow:auto; padding:.9rem 1rem; border:1px solid #11182722; }
        .md-code-block code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .md-table-wrap { overflow:auto; border:1px solid var(--line); border-radius:12px; background:#fff; }

        /* Collapsible container */
        .collapsible { position: relative; }
        .collapsible-content { overflow: hidden; transition: max-height .28s ease; }
        .collapsible-fade {
          position: absolute; left: 0; right: 0; bottom: 36px; height: 48px;
          background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,.9));
          pointer-events: none;
        }
        .btn.toggle {
          display: inline-block; margin-top: 8px;
          background: #fff; color: #0f172a; border: 1px solid var(--line);
          border-radius: 10px; padding: 6px 12px; font-weight: 600; cursor: pointer;
        }
        .btn.toggle:hover { background: #f8fafc; }

      `}</style>
    </div>
  );
}
