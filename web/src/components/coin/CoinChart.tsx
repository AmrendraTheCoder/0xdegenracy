"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COIN_BASE_PRICE, COIN_SUPPLY, type CoinTrade } from "@/lib/coin";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/components/ui";

export const INTERVALS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1D": 86_400_000 } as const;
export type Interval = keyof typeof INTERVALS;
type Mode = "mcap" | "price";

type Candle = { t: number; o: number; h: number; l: number; c: number; vol: number; buys: number; sells: number };

const MAX_CANDLES = 140;

/** Builds OHLC candles from trades: each candle opens at the previous close, so gaps read as flat. */
export function buildCandles(trades: CoinTrade[], createdAt: number, iv: number, now = Date.now()): Candle[] {
  const end = Math.floor(now / iv) * iv;
  const first = Math.floor(createdAt / iv) * iv;
  const start = Math.max(first, end - (MAX_CANDLES - 1) * iv);
  let price = COIN_BASE_PRICE;
  let i = 0;
  for (; i < trades.length && trades[i].at < start; i++) price = Number(trades[i].newPrice);
  const out: Candle[] = [];
  for (let t = start; t <= end; t += iv) {
    const c: Candle = { t, o: price, h: price, l: price, c: price, vol: 0, buys: 0, sells: 0 };
    for (; i < trades.length && trades[i].at < t + iv; i++) {
      const p = Number(trades[i].newPrice);
      c.h = Math.max(c.h, p);
      c.l = Math.min(c.l, p);
      c.c = p;
      c.vol += Number(trades[i].value) / 1e18;
      if (trades[i].kind === "buy") c.buys++;
      else c.sells++;
      price = p;
    }
    out.push(c);
  }
  return out;
}

/** MON market cap for a price in wei per whole token. */
const mcapOf = (p: number) => (p * COIN_SUPPLY) / 1e18;
const fmtAxis = (v: number, mode: Mode) =>
  mode === "mcap" ? (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4)) : (v / 1e18).toExponential(2);

export function CoinChart({ trades, createdAt, accent, height = 380 }: { trades: CoinTrade[]; createdAt: string; accent: string; height?: number }) {
  const [iv, setIv] = useState<Interval>("5m");
  const [mode, setMode] = useState<Mode>("mcap");
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Keep the last candle moving forward in time.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const candles = useMemo(() => buildCandles(trades, new Date(createdAt).getTime(), INTERVALS[iv], now), [trades, createdAt, iv, now]);
  const val = (p: number) => (mode === "mcap" ? mcapOf(p) : p);

  // Geometry
  const padR = 64;
  const padB = 22;
  const plotW = width - padR;
  const volH = Math.round(height * 0.18);
  const priceH = height - padB - volH - 8;
  let lo = Math.min(...candles.map((c) => val(c.l)));
  let hi = Math.max(...candles.map((c) => val(c.h)));
  if (hi - lo < hi * 0.02) {
    hi = hi * 1.05;
    lo = lo * 0.95;
  }
  const span = hi - lo;
  hi += span * 0.08;
  lo = Math.max(0, lo - span * 0.08);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (priceH - 8);
  const step = plotW / candles.length;
  const bw = Math.max(1.5, Math.min(14, step * 0.68));
  const x = (i: number) => i * step + step / 2;
  const maxVol = Math.max(1e-12, ...candles.map((c) => c.vol));
  const volTop = priceH + 8;

  const ticksY = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  const ticksX = Array.from({ length: 5 }, (_, k) => Math.min(candles.length - 1, Math.round(((candles.length - 1) * k) / 4)));
  const fmtTime = (t: number) => {
    const d = new Date(t);
    return INTERVALS[iv] >= 86_400_000 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const shown = candles[hover ?? candles.length - 1];
  const chg = shown ? ((shown.c - shown.o) / shown.o) * 100 : 0;
  const last = candles[candles.length - 1];
  const tradeMarks = useMemo(() => {
    const start = candles[0]?.t ?? 0;
    const ivMs = INTERVALS[iv];
    return trades.filter((t) => t.at >= start).map((t) => ({ i: Math.min(candles.length - 1, Math.floor((t.at - start) / ivMs)), p: Number(t.newPrice), kind: t.kind, id: t.id }));
  }, [trades, candles, iv]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    if (px > plotW) return setHover(null);
    setHover(Math.max(0, Math.min(candles.length - 1, Math.floor(px / step))));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink/10 px-3 py-2">
        <Segmented<Interval> size="xs" label="Candle interval" value={iv} onChange={setIv} options={(Object.keys(INTERVALS) as Interval[]).map((k) => ({ value: k, label: k }))} />
        <Segmented<Mode>
          size="xs"
          label="Chart value"
          value={mode}
          onChange={setMode}
          options={[
            { value: "mcap", label: "MCap" },
            { value: "price", label: "Price" },
          ]}
        />
      </div>

      {/* OHLC readout for the hovered (or latest) candle */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pt-2 font-mono text-[11px] text-ink/70" aria-live="off">
        <span className="font-bold text-ink">{mode === "mcap" ? "Market cap (MON)" : "Price (MON)"}</span>
        <span>{shown ? fmtTime(shown.t) : ""}</span>
        {shown && (
          <>
            <span>O {fmtAxis(val(shown.o), mode)}</span>
            <span>H {fmtAxis(val(shown.h), mode)}</span>
            <span>L {fmtAxis(val(shown.l), mode)}</span>
            <span>C {fmtAxis(val(shown.c), mode)}</span>
            <span className={chg >= 0 ? "font-bold text-up" : "font-bold text-hot-strong"}>
              {chg >= 0 ? "+" : ""}
              {chg.toFixed(2)}%
            </span>
            <span>Vol {shown.vol.toFixed(5)} MON</span>
          </>
        )}
      </div>

      <div ref={box} className="relative w-full select-none">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block touch-none"
          role="img"
          aria-label={`${mode === "mcap" ? "Market cap" : "Price"} candlestick chart, ${iv} candles. Latest close ${last ? fmtAxis(val(last.c), mode) : "n/a"}${mode === "mcap" ? " MON" : ""}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* grid + price axis */}
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="#141414" strokeOpacity={0.07} />
              <text x={plotW + 6} y={y(v) + 4} fontSize={10} fill="#141414" fillOpacity={0.6} fontFamily="ui-monospace, monospace">
                {fmtAxis(v, mode)}
              </text>
            </g>
          ))}
          {ticksX.map((i, k) => (
            <text key={k} x={x(i)} y={height - 6} fontSize={10} textAnchor="middle" fill="#141414" fillOpacity={0.55}>
              {candles[i] ? fmtTime(candles[i].t) : ""}
            </text>
          ))}
          <line x1={plotW} x2={plotW} y1={0} y2={height - padB} stroke="#141414" strokeOpacity={0.15} />

          {/* volume */}
          {candles.map((c, i) =>
            c.vol > 0 ? (
              <rect
                key={`v${c.t}`}
                x={x(i) - bw / 2}
                y={volTop + volH - (c.vol / maxVol) * volH}
                width={bw}
                height={(c.vol / maxVol) * volH}
                fill={c.c >= c.o ? "#15803d" : "#b42318"}
                opacity={0.35}
              />
            ) : null,
          )}

          {/* candles */}
          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const color = up ? "#15803d" : "#b42318";
            const top = y(val(Math.max(c.o, c.c)));
            const bot = y(val(Math.min(c.o, c.c)));
            return (
              <g key={c.t}>
                <line x1={x(i)} x2={x(i)} y1={y(val(c.h))} y2={y(val(c.l))} stroke={color} strokeWidth={1.25} />
                <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1.5, bot - top)} fill={up ? "#22c55e" : "#ef4444"} stroke={color} strokeWidth={1} rx={1} />
              </g>
            );
          })}

          {/* trade markers */}
          {tradeMarks.map((m) => (
            <circle key={m.id} cx={x(m.i)} cy={y(val(m.p))} r={3.6} fill={m.kind === "buy" ? "#22c55e" : "#ef4444"} stroke="#141414" strokeWidth={1.2} />
          ))}

          {/* last price line + tag */}
          {last && (
            <g>
              <line x1={0} x2={plotW} y1={y(val(last.c))} y2={y(val(last.c))} stroke={accent} strokeDasharray="3 3" strokeWidth={1.2} />
              <rect x={plotW + 2} y={y(val(last.c)) - 9} width={padR - 4} height={18} rx={4} fill="#141414" />
              <text x={plotW + 6} y={y(val(last.c)) + 4} fontSize={10} fill="#fff" fontFamily="ui-monospace, monospace">
                {fmtAxis(val(last.c), mode)}
              </text>
            </g>
          )}

          {/* crosshair */}
          {hover !== null && candles[hover] && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={height - padB} stroke="#141414" strokeOpacity={0.35} strokeDasharray="4 3" />
              <line x1={0} x2={plotW} y1={y(val(candles[hover].c))} y2={y(val(candles[hover].c))} stroke="#141414" strokeOpacity={0.35} strokeDasharray="4 3" />
            </g>
          )}
        </svg>
        {trades.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className={cn("rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-bold shadow-[3px_3px_0_#141414]")}>
              No recorded trades yet. The chart starts with the first one.
            </p>
          </div>
        )}
      </div>
      <p className="px-3 pb-2 text-[11px] text-ink/55">
        <span className="mr-3 inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full border border-ink bg-[#22c55e]" /> buy
        </span>
        <span className="mr-3 inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full border border-ink bg-[#ef4444]" /> sell
        </span>
        Market cap = price × 1B supply, in MON
      </p>
    </div>
  );
}
