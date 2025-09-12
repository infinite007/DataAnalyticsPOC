// import logo from './logo.svg';
// import './App.css';

// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.js</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

// export default App;



import React, { useEffect, useMemo, useRef, useState } from "react";

// Small helper: browser support for crypto.randomUUID is good; add a fallback just in case
function makeId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Minimal avatars
function Avatar({ role }) {
  const label = role === "user" ? "U" : role === "assistant" ? "A" : "S";
  return <div className={`avatar avatar-${role}`}>{label}</div>;
}

// Typing dots
function TypingDots() {
  return (
    <div className="typing">
      <span>•</span><span>•</span><span>•</span>
    </div>
  );
}

function isRecordArray(v) {
  return Array.isArray(v) && v.every(r => r && typeof r === "object" && !Array.isArray(r));
}

function RecordsTable({ rows }) {
  const cols = useMemo(() => {
    const s = new Set();
    rows.forEach(r => Object.keys(r || {}).forEach(k => s.add(k)));
    return Array.from(s);
  }, [rows]);

  if (!rows.length) return <div className="muted">No rows.</div>;

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

const API_BASE = process.env.REACT_APP_API_BASE || "http://0.0.0.0:5005"; // same-origin by default

export default function App() {
  const [messages, setMessages] = useState([
    { id: makeId(), role: "assistant", text: "Hi! Ask me anything about your data. I can translate natural language to SQL and show the results as a table." }
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

      console.log(`This is data: ${JSON.stringify(data)}`)

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
    <div className="app">
      <header className="header">
        <div className="brand">SQL Agent Chat</div>
        <div className="meta">Backend: {API_BASE || "/query (proxy/same origin)"}</div>
      </header>

      <main className="main" ref={listRef}>
        {messages.map(m => (
          <Bubble key={m.id} role={m.role}>
            {m.text && <div className="text">{m.text}</div>}
            {m.records && <div className="records"><RecordsTable rows={m.records} /></div>}
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
        <button onClick={() => send()} disabled={loading || !input.trim()}>Send</button>
      </footer>

      <style>{`
        :root{--bg:#f6f7f9;--card:#fff;--line:#e6e7eb;--text:#0f172a;--muted:#64748b;--primary:#2563eb;}
        *{box-sizing:border-box}
        body,html,#root,.app{height:100%}
        .app{display:flex;flex-direction:column;background:linear-gradient(#fafafa,#f2f4f7);color:var(--text);}
        .header{position:sticky;top:0;background:rgba(255,255,255,.9);backdrop-filter:saturate(1.5) blur(6px);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
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
        .bubble-assistant{background:#fff;border:1px solid var(--line)}
        .text{white-space:pre-wrap;line-height:1.5}
        .typing span{display:inline-block;animation:bounce 1s infinite;}
        .typing span:nth-child(1){animation-delay:-.2s}
        .typing span:nth-child(2){animation-delay:-.1s}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}
        .composer{position:sticky;bottom:0;display:flex;gap:8px;border-top:1px solid var(--line);padding:12px 16px;background:#fff}
        .composer textarea{flex:1;min-height:44px;max-height:140px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:10px}
        .composer button{height:44px;padding:0 16px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-weight:600;opacity:1}
        .composer button:disabled{opacity:.5}
        .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;margin-top:10px}
        .table{width:100%;border-collapse:collapse;font-size:14px}
        .table th,.table td{padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:left;vertical-align:top}
        .table thead th{background:#fafafa;font-weight:600}
        .muted{color:var(--muted);font-size:14px}
      `}</style>
    </div>
  );
}
