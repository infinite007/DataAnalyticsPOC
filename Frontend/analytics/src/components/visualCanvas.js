// src/components/visualCanvas.js
import React, { useMemo, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

function inferKeys(rows) {
  const keys = Object.keys((rows && rows[0]) || {});
  const xKey =
    keys.find(k => typeof (rows && rows[0] && rows[0][k]) === "string" || typeof (rows && rows[0] && rows[0][k]) === "number") || keys[0];
  const yKeys = keys.filter(k => k !== xKey && isNumber(rows && rows[0] && rows[0][k]));
  return { xKey, yKeys, keys };
}

export default function VisualCanvas({ items, onRemove }) {
  const [active, setActive] = useState(0);
  const current = items && items[active];

  const [chartType, setChartType] = useState("line");
  // const memoKeys = useMemo(
  //   () => (current ? inferKeys(current.rows) : { xKey: "", yKeys: [] }),
  //   [current]
  // );
  const memoKeys = useMemo(
    () => (current ? inferKeys(current.rows) : { xKey: "", yKeys: [] }),
    [current]
  );
  const xKey = memoKeys.xKey;
  const inferredY = memoKeys.yKeys;
  const [yKeys, setYKeys] = useState([]);
  const yFields = (yKeys && yKeys.length ? yKeys : inferredY);

  const options = useMemo(() => {
    if (!current) return {};
    const rows = current.rows;
    if (!rows || !rows.length) return {};

    // Fallback: if no numeric keys were inferred, try any column that looks numeric
    const yFallback =
    inferredY && inferredY.length
      ? inferredY
      : Object.keys(rows[0] || {}).filter(k => k !== xKey && isNumericLike(rows[0]?.[k]));

    const yFieldsToUse = (yKeys && yKeys.length) ? yKeys : yFallback;

    if (!yFieldsToUse.length) {
      return {
        title: { text: current.title || "Chart" },
        series: [],
        subtitle: { text: "No numeric columns detected to plot." },
        credits: { enabled: false }
      };
    }

    if (chartType === "pie") {
      const y = yFields[0] || (inferredY && inferredY[0]);
      return {
        chart: { type: "pie", height: 360 },
        title: { text: current.title || "Chart" },
        series: [{
          type: "pie",
          name: y,
          data: rows.map(r => ({ name: String(r[xKey]), y: Number((r[y] ?? 0)) }))
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
      series: (yFields && yFields.length ? yFields : inferredY).map(k => ({
        type: chartType,
        name: k,
        data: rows.map(r => Number((r[k] ?? 0)))
      })),
      credits: { enabled: false }
    };
  }, [current, chartType, xKey, yFields, inferredY]);

  if (!items || !items.length) {
    return (
      <div className="h-full grid place-items-center text-sm text-zinc-500">
        Pin results from chat to see charts here.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 bg-white sticky top-0">
        {items.map((it, i) => (
          <button
            key={it.id}
            onClick={() => setActive(i)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${i===active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-300"}`}
            title={it.title || `Pinned ${i+1}`}
          >
            {it.title || `Pinned ${i+1}`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {/* Chart controls */}
          <select
            className="text-xs border rounded-lg px-2 py-1"
            value={chartType}
            onChange={e => setChartType(e.target.value)}
          >
            <option value="line">line</option>
            <option value="column">column</option>
            <option value="area">area</option>
            <option value="pie">pie</option>
          </select>
          {onRemove && (
            <button
              onClick={() => onRemove(items[active].id)}
              className="text-xs px-2 py-1 rounded-lg border border-zinc-300 bg-white"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Y field multiselect (simple buttons) */}
      {current && chartType !== "pie" && (
        <div className="flex flex-wrap gap-1 px-3 py-2 bg-zinc-50 border-b border-zinc-200">
          {(inferKeys(current.rows).yKeys).map(k => (
            <button
              key={k}
              onClick={() => setYKeys(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k])}
              className={`text-xs px-2 py-1 rounded-full border ${yFields.includes(k) ? "bg-blue-600 text-white border-blue-600" : "bg-white border-zinc-300"}`}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 overflow-auto p-3 bg-white">
        <HighchartsReact highcharts={Highcharts} options={options} />
      </div>
    </div>
  );
}