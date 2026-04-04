import React, { useMemo, useRef, useCallback, useState } from "react";
import { SolverResult } from "@/lib/solver";
import { poly, roots, evaluate } from "@/lib/polynomial";
import { Slider } from "@/components/ui/slider";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
  ReferenceArea,
} from "recharts";
import html2canvas from "html2canvas";
import { Download } from "lucide-react";

// ─── Pole-Zero Map (SVG) ─────────────────────────────────────────────────────

function PoleZeroMap({ result }: { result: SolverResult }) {
  const allPoints = [...result.poles, ...result.zeros].filter(p => !isNaN(p.re));
  if (allPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        No computable poles/zeros (higher-order — solve characteristic eq.)
      </div>
    );
  }

  const margin = 1;
  const reVals = allPoints.map(p => p.re);
  const imVals = allPoints.map(p => p.im);
  const maxAbs = Math.max(
    Math.max(...reVals.map(Math.abs), ...imVals.map(Math.abs)),
    0.5
  ) + margin;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2;
  const scaleVal = (W / 2 - 30) / maxAbs;

  const toSvg = (re: number, im: number) => ({
    x: cx + re * scaleVal,
    y: cy - im * scaleVal,
  });

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[280px] mx-auto">
      {/* Axes */}
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="hsl(var(--border))" strokeWidth={1} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={W - 8} y={cy - 4} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Re</text>
      <text x={cx + 4} y={10} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Im</text>

      {/* LHP shading */}
      <rect x={0} y={0} width={cx} height={H} fill="hsl(var(--success) / 0.05)" />

      {/* Grid ticks */}
      {[-2, -1, 1, 2].map(v => {
        const pos = toSvg(v * (maxAbs / 3), 0);
        const posI = toSvg(0, v * (maxAbs / 3));
        return (
          <g key={v}>
            <line x1={pos.x} y1={cy - 3} x2={pos.x} y2={cy + 3} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
            <text x={pos.x} y={cy + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">
              {(v * maxAbs / 3).toFixed(1)}
            </text>
            <line x1={cx - 3} y1={posI.y} x2={cx + 3} y2={posI.y} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
          </g>
        );
      })}

      {/* Poles (×) */}
      {result.poles.filter(p => !isNaN(p.re)).map((p, i) => {
        const { x, y } = toSvg(p.re, p.im);
        const color = p.re > 1e-8 ? "hsl(var(--destructive))" : "hsl(var(--primary))";
        return (
          <g key={`p${i}`}>
            <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={color} strokeWidth={2} />
            <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke={color} strokeWidth={2} />
          </g>
        );
      })}

      {/* Zeros (○) */}
      {result.zeros.filter(z => !isNaN(z.re)).map((z, i) => {
        const { x, y } = toSvg(z.re, z.im);
        return (
          <circle key={`z${i}`} cx={x} cy={y} r={5}
            fill="none" stroke="hsl(var(--accent))" strokeWidth={2} />
        );
      })}

      {/* Legend */}
      <g transform={`translate(8, ${H - 25})`}>
        <line x1={0} y1={0} x2={6} y2={6} stroke="hsl(var(--primary))" strokeWidth={1.5} />
        <line x1={6} y1={0} x2={0} y2={6} stroke="hsl(var(--primary))" strokeWidth={1.5} />
        <text x={12} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Poles</text>
        <circle cx={50} cy={3} r={4} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
        <text x={58} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Zeros</text>
      </g>
    </svg>
  );
}

// ─── Shared simulation engine ────────────────────────────────────────────────

function simulate(result: SolverResult, inputType: "step" | "impulse") {
  const { num, den } = result.equivalentTF;
  const n = den.coeffs.length - 1;
  if (n === 0) {
    const gain = num.coeffs[0] / den.coeffs[0];
    const val = inputType === "step" ? gain : 0;
    return Array.from({ length: 200 }, (_, i) => ({ t: i * 0.05, y: i === 0 && inputType === "impulse" ? gain : val }));
  }

  const an = den.coeffs[n];
  const a = den.coeffs.map(c => c / an);
  const b = num.coeffs.map(c => c / an);

  const dt = 0.005;
  const tMax = 10;
  const steps = Math.ceil(tMax / dt);
  const x = new Float64Array(n);
  const points: { t: number; y: number }[] = [];

  for (let k = 0; k <= steps; k++) {
    const t = k * dt;
    let y = 0;
    for (let i = 0; i < Math.min(b.length, n); i++) {
      y += (b[i] || 0) * x[i];
    }
    if (b.length > n) y += b[n];
    if (k % 10 === 0) points.push({ t: parseFloat(t.toFixed(3)), y: parseFloat(y.toFixed(6)) });

    // Input: step=1 always, impulse=1/dt at k=0 only
    const u = inputType === "step" ? 1 : (k === 0 ? 1 / dt : 0);

    const xn = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) xn[i] = x[i] + dt * x[i + 1];
    let xdot_last = u;
    for (let i = 0; i < n; i++) xdot_last -= a[i] * x[i];
    xn[n - 1] = x[n - 1] + dt * xdot_last;
    x.set(xn);
  }
  return points;
}

// ─── Time Response (Step + Impulse) ──────────────────────────────────────────

function TimeResponsePlot({ result }: { result: SolverResult }) {
  const [mode, setMode] = React.useState<"step" | "impulse">("step");

  const { data, metrics } = useMemo(() => {
    const points = simulate(result, mode);

    const finalValue = points.length > 0 ? points[points.length - 1].y : 0;
    let peakValue = -Infinity, peakTime = 0;
    let riseTime = 0, settlingTime = 0;
    let foundRise10 = false, rise10t = 0;

    for (const p of points) {
      if (p.y > peakValue) { peakValue = p.y; peakTime = p.t; }
      if (mode === "step") {
        if (!foundRise10 && finalValue !== 0 && p.y >= 0.1 * finalValue) { rise10t = p.t; foundRise10 = true; }
        if (foundRise10 && riseTime === 0 && p.y >= 0.9 * finalValue) { riseTime = p.t - rise10t; }
      }
    }

    // Settling time (2% band)
    const ref = mode === "step" ? finalValue : 0;
    const band = mode === "step" ? 0.02 * Math.abs(finalValue || 1) : 0.02 * Math.abs(peakValue || 1);
    for (let i = points.length - 1; i >= 0; i--) {
      if (Math.abs(points[i].y - ref) > band) { settlingTime = points[i].t; break; }
    }

    const overshoot = mode === "step" && finalValue !== 0
      ? Math.max(0, ((peakValue - finalValue) / Math.abs(finalValue)) * 100)
      : 0;

    return { data: points, metrics: { finalValue, overshoot, riseTime, settlingTime, peakTime, peakValue } };
  }, [result, mode]);

  if (data.length === 0) return null;

  const { finalValue, overshoot, riseTime, settlingTime, peakTime, peakValue } = metrics;

  const stepMetrics = [
    { label: "Overshoot", value: `${overshoot.toFixed(1)}%`, warn: overshoot > 25 },
    { label: "Rise Time", value: `${riseTime.toFixed(3)}s`, warn: false },
    { label: "Settling", value: `${settlingTime.toFixed(2)}s`, warn: settlingTime > 8 },
    { label: "Peak Time", value: `${peakTime.toFixed(3)}s`, warn: false },
  ];

  const impulseMetrics = [
    { label: "Peak", value: `${peakValue.toFixed(3)}`, warn: false },
    { label: "Peak Time", value: `${peakTime.toFixed(3)}s`, warn: false },
    { label: "Settling", value: `${settlingTime.toFixed(2)}s`, warn: settlingTime > 8 },
    { label: "Final", value: `${finalValue.toFixed(4)}`, warn: Math.abs(finalValue) > 0.05 },
  ];

  const activeMetrics = mode === "step" ? stepMetrics : impulseMetrics;

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-1 px-1">
        {(["step", "impulse"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1 text-[9px] font-semibold uppercase rounded transition-all ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "step" ? "Step Response" : "Impulse Response"}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "t (s)", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
          {mode === "step" && <ReferenceLine y={finalValue} stroke="hsl(var(--warning))" strokeDasharray="5 3" strokeWidth={1} />}
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Line type="monotone" dataKey="y" stroke={mode === "step" ? "hsl(var(--primary))" : "hsl(var(--accent))"} strokeWidth={1.5} dot={false} name={mode === "step" ? "y(t)" : "h(t)"} />
        </LineChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-4 gap-1 px-1">
        {activeMetrics.map(m => (
          <div key={m.label} className="rounded border border-border bg-card/50 px-2 py-1 text-center">
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{m.label}</div>
            <div className={`text-[11px] font-mono font-semibold ${m.warn ? "text-destructive" : "text-foreground"}`}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}




function BodePlot({ result }: { result: SolverResult }) {
  const [showTable, setShowTable] = React.useState(false);

  const { data, margins, keyFreqs } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const points: { w: number; wLog: number; mag: number; phase: number }[] = [];

    let gcLog: number | null = null;
    let pcLog: number | null = null;
    let gmDb = Infinity;
    let pmDeg = Infinity;
    let magAtPcDb = 0; // magnitude (dB) at phase crossover
    let phaseAtGcDeg = 0; // phase (deg) at gain crossover
    let prevMagDb = NaN;
    let prevPhase = NaN;
    let prevExp = NaN;

    // Evaluate G(jω) helper
    const evalAt = (w: number) => {
      let numRe = 0, numIm = 0;
      for (let k = 0; k < num.coeffs.length; k++) {
        const c = num.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: numRe += c * wk; break;
          case 1: numIm += c * wk; break;
          case 2: numRe -= c * wk; break;
          case 3: numIm -= c * wk; break;
        }
      }
      let denRe = 0, denIm = 0;
      for (let k = 0; k < den.coeffs.length; k++) {
        const c = den.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: denRe += c * wk; break;
          case 1: denIm += c * wk; break;
          case 2: denRe -= c * wk; break;
          case 3: denIm -= c * wk; break;
        }
      }
      const numMag = Math.sqrt(numRe * numRe + numIm * numIm);
      const denMag = Math.sqrt(denRe * denRe + denIm * denIm);
      const magDb = 20 * Math.log10(numMag / (denMag || 1e-30));
      const numPhase = Math.atan2(numIm, numRe);
      const denPhase = Math.atan2(denIm, denRe);
      const phaseDeg = (numPhase - denPhase) * (180 / Math.PI);
      return { magDb, phaseDeg };
    };

    for (let exp = -2; exp <= 3; exp += 0.05) {
      const w = Math.pow(10, exp);
      const { magDb, phaseDeg } = evalAt(w);

      if (!isNaN(prevMagDb) && gcLog === null) {
        if ((prevMagDb > 0 && magDb <= 0) || (prevMagDb < 0 && magDb >= 0)) {
          const t = Math.abs(prevMagDb) / (Math.abs(prevMagDb) + Math.abs(magDb) + 1e-30);
          gcLog = parseFloat((prevExp + t * (exp - prevExp)).toFixed(2));
          phaseAtGcDeg = prevPhase + t * (phaseDeg - prevPhase);
          pmDeg = 180 + phaseAtGcDeg;
        }
      }

      if (!isNaN(prevPhase) && pcLog === null) {
        if ((prevPhase > -180 && phaseDeg <= -180) || (prevPhase < -180 && phaseDeg >= -180)) {
          const t = Math.abs(prevPhase + 180) / (Math.abs(prevPhase + 180) + Math.abs(phaseDeg + 180) + 1e-30);
          pcLog = parseFloat((prevExp + t * (exp - prevExp)).toFixed(2));
          magAtPcDb = prevMagDb + t * (magDb - prevMagDb);
          gmDb = -magAtPcDb;
        }
      }

      points.push({
        w,
        wLog: parseFloat(exp.toFixed(2)),
        mag: parseFloat(magDb.toFixed(2)),
        phase: parseFloat(phaseDeg.toFixed(2)),
      });

      prevMagDb = magDb;
      prevPhase = phaseDeg;
      prevExp = exp;
    }

    // Build key frequencies table
    const freqTable: Array<{ label: string; w: number; mag: number; phase: number }> = [];

    // Corner frequencies from poles
    const poles = roots(den);
    poles.forEach((p, i) => {
      if (!isNaN(p.re)) {
        const wn = Math.sqrt(p.re * p.re + p.im * p.im);
        if (wn > 0.01 && wn < 1000) {
          const { magDb, phaseDeg } = evalAt(wn);
          freqTable.push({ label: `ωₚ${i + 1}`, w: wn, mag: magDb, phase: phaseDeg });
        }
      }
    });

    // Corner frequencies from zeros
    const zeros = roots(num);
    zeros.forEach((z, i) => {
      if (!isNaN(z.re)) {
        const wn = Math.sqrt(z.re * z.re + z.im * z.im);
        if (wn > 0.01 && wn < 1000) {
          const { magDb, phaseDeg } = evalAt(wn);
          freqTable.push({ label: `ωᵤ${i + 1}`, w: wn, mag: magDb, phase: phaseDeg });
        }
      }
    });

    // Crossover frequencies
    if (gcLog !== null) {
      const wGc = Math.pow(10, gcLog);
      const { magDb, phaseDeg } = evalAt(wGc);
      freqTable.push({ label: "ωgc", w: wGc, mag: magDb, phase: phaseDeg });
    }
    if (pcLog !== null) {
      const wPc = Math.pow(10, pcLog);
      const { magDb, phaseDeg } = evalAt(wPc);
      freqTable.push({ label: "ωpc", w: wPc, mag: magDb, phase: phaseDeg });
    }

    // Standard decades
    [0.1, 1, 10, 100].forEach(w => {
      const { magDb, phaseDeg } = evalAt(w);
      freqTable.push({ label: `${w}`, w, mag: magDb, phase: phaseDeg });
    });

    // Sort by frequency and dedupe
    freqTable.sort((a, b) => a.w - b.w);
    const seen = new Set<string>();
    const unique = freqTable.filter(f => {
      const key = f.w.toFixed(3);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { data: points, margins: { gcLog, pcLog, gmDb, pmDeg, magAtPcDb, phaseAtGcDeg }, keyFreqs: unique };
  }, [result]);

  const { gcLog, pcLog, gmDb, pmDeg, magAtPcDb, phaseAtGcDeg } = margins;

  return (
    <div className="space-y-1">
      <div className="flex gap-3 px-2 py-1 text-[9px] font-mono text-muted-foreground items-center">
        <span>GM: <span className={gmDb !== Infinity ? (gmDb > 0 ? "text-green-400" : "text-destructive") : ""}>{gmDb === Infinity ? "∞" : `${gmDb.toFixed(1)} dB`}</span></span>
        <span>PM: <span className={pmDeg !== Infinity ? (pmDeg > 0 ? "text-green-400" : "text-destructive") : ""}>{pmDeg === Infinity ? "∞" : `${pmDeg.toFixed(1)}°`}</span></span>
        {gcLog !== null && <span>ωgc: <span className="text-foreground">{Math.pow(10, gcLog).toFixed(2)}</span></span>}
        {pcLog !== null && <span>ωpc: <span className="text-foreground">{Math.pow(10, pcLog).toFixed(2)}</span></span>}
        <button
          onClick={() => setShowTable(!showTable)}
          className={`ml-auto text-[8px] px-1.5 py-0.5 rounded ${showTable ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"}`}
        >
          {showTable ? "PLOT" : "TABLE"}
        </button>
      </div>

      {!showTable ? (
        <>
          {/* Magnitude plot */}
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="wLog" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} hide />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "dB", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
              <ReferenceLine y={0} stroke="hsl(var(--warning))" strokeDasharray="5 3" />
              {/* GM annotation: vertical line at ωpc with shaded region from curve to 0dB */}
              {pcLog !== null && (
                <>
                  <ReferenceLine x={pcLog} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1.5} />
                  <ReferenceDot x={pcLog} y={magAtPcDb} r={4} fill="hsl(var(--destructive))" stroke="hsl(var(--destructive))" strokeWidth={1} />
                  <ReferenceDot x={pcLog} y={0} r={3} fill="none" stroke="hsl(var(--destructive))" strokeWidth={1.5} />
                  {magAtPcDb < 0 && (
                    <ReferenceArea x1={pcLog - 0.08} x2={pcLog + 0.08} y1={magAtPcDb} y2={0}
                      fill="hsl(var(--destructive))" fillOpacity={0.15} strokeWidth={0}
                      label={{ value: `GM\n${gmDb.toFixed(1)}dB`, position: "right", fontSize: 8, fill: "hsl(var(--destructive))" }}
                    />
                  )}
                  {magAtPcDb >= 0 && (
                    <ReferenceArea x1={pcLog - 0.08} x2={pcLog + 0.08} y1={0} y2={magAtPcDb}
                      fill="hsl(var(--destructive))" fillOpacity={0.12} strokeWidth={0}
                      label={{ value: `GM\n${gmDb.toFixed(1)}dB`, position: "right", fontSize: 8, fill: "hsl(var(--destructive))" }}
                    />
                  )}
                </>
              )}
              {/* Gain crossover marker on mag plot */}
              {gcLog !== null && (
                <>
                  <ReferenceLine x={gcLog} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1} />
                  <ReferenceDot x={gcLog} y={0} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={1} />
                </>
              )}
              <Line type="monotone" dataKey="mag" stroke="hsl(var(--accent))" strokeWidth={1.5} dot={false} name="|G(jω)| dB" />
            </LineChart>
          </ResponsiveContainer>

          {/* Phase plot */}
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 0, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="wLog" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "log₁₀(ω)", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "deg", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
              <ReferenceLine y={-180} stroke="hsl(var(--destructive))" strokeDasharray="5 3" />
              {/* PM annotation: vertical line at ωgc with shaded region from phase to -180° */}
              {gcLog !== null && (
                <>
                  <ReferenceLine x={gcLog} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1.5} />
                  <ReferenceDot x={gcLog} y={phaseAtGcDeg} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={1} />
                  <ReferenceDot x={gcLog} y={-180} r={3} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
                  <ReferenceArea x1={gcLog - 0.08} x2={gcLog + 0.08}
                    y1={Math.min(phaseAtGcDeg, -180)} y2={Math.max(phaseAtGcDeg, -180)}
                    fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={0}
                    label={{ value: `PM\n${pmDeg.toFixed(1)}°`, position: "right", fontSize: 8, fill: "hsl(var(--primary))" }}
                  />
                </>
              )}
              {/* Phase crossover marker on phase plot */}
              {pcLog !== null && (
                <>
                  <ReferenceLine x={pcLog} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1} />
                  <ReferenceDot x={pcLog} y={-180} r={4} fill="hsl(var(--destructive))" stroke="hsl(var(--destructive))" strokeWidth={1} />
                </>
              )}
              <Line type="monotone" dataKey="phase" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="∠G(jω) °" />
            </LineChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div className="overflow-auto max-h-[280px]">
          <table className="w-full text-[9px] font-mono">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1 px-2">Freq</th>
                <th className="text-right py-1 px-2">ω (rad/s)</th>
                <th className="text-right py-1 px-2">|G| (dB)</th>
                <th className="text-right py-1 px-2">∠G (°)</th>
              </tr>
            </thead>
            <tbody>
              {keyFreqs.map((f, i) => {
                const isSpecial = f.label.startsWith("ω");
                return (
                  <tr key={i} className={`border-b border-border/50 ${isSpecial ? "bg-primary/5" : ""}`}>
                    <td className={`py-1 px-2 ${isSpecial ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {f.label}
                    </td>
                    <td className="text-right py-1 px-2">{f.w < 10 ? f.w.toFixed(3) : f.w.toFixed(1)}</td>
                    <td className={`text-right py-1 px-2 ${Math.abs(f.mag) < 1 ? "text-warning" : ""}`}>
                      {f.mag.toFixed(2)}
                    </td>
                    <td className={`text-right py-1 px-2 ${f.phase < -170 ? "text-destructive" : ""}`}>
                      {f.phase.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



// ─── Nyquist Plot (SVG) ──────────────────────────────────────────────────────

function NyquistPlot({ result }: { result: SolverResult }) {
  const points = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const pts: { re: number; im: number }[] = [];

    for (let exp = -3; exp <= 4; exp += 0.02) {
      const w = Math.pow(10, exp);
      let numRe = 0, numIm = 0;
      for (let k = 0; k < num.coeffs.length; k++) {
        const c = num.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: numRe += c * wk; break;
          case 1: numIm += c * wk; break;
          case 2: numRe -= c * wk; break;
          case 3: numIm -= c * wk; break;
        }
      }
      let denRe = 0, denIm = 0;
      for (let k = 0; k < den.coeffs.length; k++) {
        const c = den.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: denRe += c * wk; break;
          case 1: denIm += c * wk; break;
          case 2: denRe -= c * wk; break;
          case 3: denIm -= c * wk; break;
        }
      }
      const dMagSq = denRe * denRe + denIm * denIm;
      if (dMagSq < 1e-30) continue;
      const gRe = (numRe * denRe + numIm * denIm) / dMagSq;
      const gIm = (numIm * denRe - numRe * denIm) / dMagSq;
      if (Math.abs(gRe) < 1e6 && Math.abs(gIm) < 1e6) {
        pts.push({ re: gRe, im: gIm });
      }
    }
    return pts;
  }, [result]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        Insufficient data for Nyquist plot
      </div>
    );
  }

  // Auto-scale with padding
  const allRe = points.map(p => p.re);
  const allIm = points.map(p => p.im);
  const maxAbs = Math.max(
    Math.max(...allRe.map(Math.abs), ...allIm.map(Math.abs)),
    1.5
  );
  // Clamp to reasonable range
  const range = Math.min(maxAbs * 1.2, 50);

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2;
  const scale = (W / 2 - 20) / range;

  const toX = (re: number) => cx + re * scale;
  const toY = (im: number) => cy - im * scale;

  // Build SVG path for positive freq
  const pathParts = points.map((p, i) => {
    const x = toX(Math.max(-range, Math.min(range, p.re)));
    const y = toY(Math.max(-range, Math.min(range, p.im)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Mirror for negative freq (conjugate)
  const mirrorParts = [...points].reverse().map((p, i) => {
    const x = toX(Math.max(-range, Math.min(range, p.re)));
    const y = toY(Math.max(-range, Math.min(range, -p.im)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[280px] mx-auto">
      {/* Axes */}
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="hsl(var(--border))" strokeWidth={1} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={W - 10} y={cy - 4} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Re</text>
      <text x={cx + 4} y={10} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Im</text>

      {/* Unit circle */}
      <circle cx={cx} cy={cy} r={scale} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="4 2" />

      {/* Critical point -1+j0 */}
      <circle cx={toX(-1)} cy={toY(0)} r={5} fill="hsl(var(--destructive) / 0.2)" stroke="hsl(var(--destructive))" strokeWidth={2} />
      <text x={toX(-1) - 2} y={toY(0) + 14} fill="hsl(var(--destructive))" fontSize={8} fontFamily="monospace" textAnchor="middle">−1</text>

      {/* Nyquist contour (positive freq) */}
      <path d={pathParts.join(" ")} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
      {/* Negative freq (mirror) */}
      <path d={mirrorParts.join(" ")} fill="none" stroke="hsl(var(--accent))" strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />

      {/* Direction arrow at midpoint */}
      {points.length > 10 && (() => {
        const mid = Math.floor(points.length / 4);
        const p = points[mid];
        const pn = points[mid + 1];
        if (!pn) return null;
        const ax = toX(p.re), ay = toY(p.im);
        const dx = toX(pn.re) - ax, dy = toY(pn.im) - ay;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;
        const ux = dx / len, uy = dy / len;
        return (
          <polygon
            points={`${ax + ux * 6},${ay + uy * 6} ${ax - uy * 3},${ay + ux * 3} ${ax + uy * 3},${ay - ux * 3}`}
            fill="hsl(var(--accent))"
          />
        );
      })()}

      {/* Legend */}
      <g transform={`translate(8, ${H - 20})`}>
        <line x1={0} y1={3} x2={12} y2={3} stroke="hsl(var(--accent))" strokeWidth={1.5} />
        <text x={16} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">G(jω)</text>
        <circle cx={55} cy={3} r={3} fill="hsl(var(--destructive) / 0.3)" stroke="hsl(var(--destructive))" strokeWidth={1} />
        <text x={62} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">−1 crit.</text>
      </g>
    </svg>
  );
}

// ─── Root Locus Plot (SVG) ───────────────────────────────────────────────────

function RootLocusPlot({ result }: { result: SolverResult }) {
  const [kValue, setKValue] = useState(1);
  const [kMax, setKMaxState] = useState(100);

  const { loci, olPoles, olZeros, numC, denC } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const numCoeffs = [...num.coeffs];
    const denCoeffs = [...den.coeffs];
    const maxLen = Math.max(numCoeffs.length, denCoeffs.length);
    while (numCoeffs.length < maxLen) numCoeffs.push(0);
    while (denCoeffs.length < maxLen) denCoeffs.push(0);

    const olp = roots(den);
    const olz = roots(num);

    const kValues: number[] = [];
    for (let e = -2; e <= 3; e += 0.03) kValues.push(Math.pow(10, e));
    kValues.unshift(0.001, 0.005);

    const branches: Array<Array<{ re: number; im: number; k: number }>> = [];
    for (let i = 0; i < olp.length; i++) branches.push([]);

    for (const K of kValues) {
      const charCoeffs = denCoeffs.map((d, i) => d + K * numCoeffs[i]);
      while (charCoeffs.length > 1 && Math.abs(charCoeffs[charCoeffs.length - 1]) < 1e-15) charCoeffs.pop();

      const charPoly = { coeffs: charCoeffs };
      const rts = roots(charPoly);

      const used = new Set<number>();
      const branchOrder: number[] = [];

      for (let b = 0; b < branches.length; b++) {
        const prev = branches[b].length > 0
          ? branches[b][branches[b].length - 1]
          : olp[b] || { re: 0, im: 0 };

        let bestIdx = -1, bestDist = Infinity;
        for (let r = 0; r < rts.length; r++) {
          if (used.has(r) || isNaN(rts[r].re)) continue;
          const dist = (rts[r].re - prev.re) ** 2 + (rts[r].im - prev.im) ** 2;
          if (dist < bestDist) { bestDist = dist; bestIdx = r; }
        }
        if (bestIdx >= 0) {
          used.add(bestIdx);
          branchOrder.push(bestIdx);
        }
      }

      branchOrder.forEach((ri, b) => {
        if (ri >= 0 && ri < rts.length) {
          branches[b].push({ re: rts[ri].re, im: rts[ri].im, k: K });
        }
      });
    }

    return { loci: branches, olPoles: olp, olZeros: olz, numC: numCoeffs, denC: denCoeffs };
  }, [result]);

  // Compute closed-loop poles at selected K
  const clPoles = useMemo(() => {
    const charCoeffs = denC.map((d, i) => d + kValue * numC[i]);
    while (charCoeffs.length > 1 && Math.abs(charCoeffs[charCoeffs.length - 1]) < 1e-15) charCoeffs.pop();
    return roots(poly(charCoeffs)).filter(p => !isNaN(p.re));
  }, [kValue, numC, denC]);

  // Compute breakaway / break-in points numerically
  // Breakaway points occur where dK/dσ = 0 on the real axis, with K(σ) = -D(σ)/N(σ) > 0
  const breakawayPoints = useMemo(() => {
    const num = { coeffs: [...numC] };
    const den = { coeffs: [...denC] };
    const points: Array<{ re: number; type: "breakaway" | "breakin" }> = [];

    // Sample the real axis finely
    const bound = Math.max(
      ...olPoles.filter(p => !isNaN(p.re)).map(p => Math.abs(p.re)),
      ...olZeros.filter(z => !isNaN(z.re)).map(z => Math.abs(z.re)),
      2
    ) + 2;

    const step = 0.005;
    const kOfSigma = (sigma: number): number => {
      const n = evaluate(num, sigma);
      if (Math.abs(n) < 1e-12) return NaN;
      return -evaluate(den, sigma) / n;
    };

    // Find local extrema of K(σ) where K > 0
    let prevK = kOfSigma(-bound);
    let prevSlope = 0;
    const DELTA = step * 0.5;

    for (let sigma = -bound + step; sigma <= bound; sigma += step) {
      const k = kOfSigma(sigma);
      if (isNaN(k) || isNaN(prevK)) { prevK = k; continue; }

      const slope = k - prevK;
      // Detect sign change in slope (extremum)
      if (prevSlope !== 0 && slope * prevSlope < 0) {
        // Refine with bisection
        let lo = sigma - step, hi = sigma;
        for (let iter = 0; iter < 20; iter++) {
          const mid = (lo + hi) / 2;
          const kMid = kOfSigma(mid);
          const kMidPlus = kOfSigma(mid + DELTA * 0.01);
          if (isNaN(kMid) || isNaN(kMidPlus)) break;
          if ((kMidPlus - kMid) * prevSlope > 0) lo = mid; else hi = mid;
        }
        const bpSigma = (lo + hi) / 2;
        const bpK = kOfSigma(bpSigma);

        // Only include if K > 0 (valid gain) and point is on the real-axis root locus
        if (!isNaN(bpK) && bpK > 0.001) {
          // Breakaway: branches leave real axis (local max of K)
          // Break-in: branches return to real axis (local min of K)
          const type = prevSlope > 0 ? "breakaway" : "breakin";
          // Check it's not too close to a pole or zero
          const nearPole = olPoles.some(p => Math.abs(p.re - bpSigma) < 0.05 && Math.abs(p.im) < 0.05);
          const nearZero = olZeros.some(z => Math.abs(z.re - bpSigma) < 0.05 && Math.abs(z.im) < 0.05);
          if (!nearPole && !nearZero) {
            points.push({ re: bpSigma, type });
          }
        }
      }
      prevSlope = slope;
      prevK = k;
    }
    return points;
  }, [numC, denC, olPoles, olZeros]);

  // Compute asymptotes: angles and centroid (Ogata §6-3, Nise §8.2)
  // n = #poles, m = #zeros, asymptotes exist when n > m
  // Centroid σ_a = (Σ poles - Σ zeros) / (n - m)
  // Angles θ_k = (2k+1)π / (n-m), k = 0,1,...,n-m-1
  const asymptotes = useMemo(() => {
    const realPoles = olPoles.filter(p => !isNaN(p.re));
    const realZeros = olZeros.filter(z => !isNaN(z.re));
    const n = realPoles.length;
    const m = realZeros.length;
    const diff = n - m;
    if (diff <= 0) return null;

    const sumPoles = realPoles.reduce((s, p) => s + p.re, 0);
    const sumZeros = realZeros.reduce((s, z) => s + z.re, 0);
    const centroid = (sumPoles - sumZeros) / diff;

    const angles: number[] = [];
    for (let k = 0; k < diff; k++) {
      angles.push(((2 * k + 1) * Math.PI) / diff);
    }

    return { centroid, angles, n, m };
  }, [olPoles, olZeros]);

  // Compute bounds
  const allPts = [
    ...olPoles, ...olZeros,
    ...loci.flatMap(b => b),
  ].filter(p => !isNaN(p.re) && Math.abs(p.re) < 100 && Math.abs(p.im) < 100);

  if (allPts.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        Insufficient data for root locus
      </div>
    );
  }

  const reVals = allPts.map(p => p.re);
  const imVals = allPts.map(p => p.im);
  const margin = 0.5;
  const maxAbs = Math.max(
    Math.max(...reVals.map(Math.abs), ...imVals.map(Math.abs)),
    0.5
  ) + margin;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2;
  const scale = (W / 2 - 20) / maxAbs;

  const toX = (re: number) => cx + re * scale;
  const toY = (im: number) => cy - im * scale;

  const branchColors = [
    "hsl(var(--primary))",
    "hsl(var(--accent))",
    "hsl(160, 70%, 50%)",
    "hsl(30, 80%, 55%)",
    "hsl(280, 60%, 55%)",
    "hsl(350, 70%, 55%)",
  ];

  const isStableAtK = clPoles.every(p => p.re <= 1e-8);

  return (
    <div className="space-y-2">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[280px] mx-auto">
        {/* Axes */}
        <line x1={0} y1={cy} x2={W} y2={cy} stroke="hsl(var(--border))" strokeWidth={1} />
        <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={1} />
        <text x={W - 10} y={cy - 4} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Re</text>
        <text x={cx + 4} y={10} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Im</text>

        {/* LHP shading */}
        <rect x={0} y={0} width={cx} height={H} fill="hsl(var(--primary) / 0.03)" />

        {/* jω axis */}
        <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="4 2" />

        {/* Constant damping ratio ζ lines */}
        {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(zeta => {
          // ζ = cos(θ) where θ is angle from negative real axis
          // Line from origin into LHP at angle θ = acos(ζ)
          const theta = Math.acos(zeta);
          const lineLen = maxAbs * 1.8;
          // Upper half: angle π - θ from positive real axis
          const dxU = -lineLen * Math.cos(theta);
          const dyU = lineLen * Math.sin(theta);
          // Lower half: conjugate
          return (
            <g key={`zeta${zeta}`}>
              <line
                x1={cx} y1={cy}
                x2={cx + dxU * scale} y2={cy - dyU * scale}
                stroke="hsl(var(--muted-foreground) / 0.15)"
                strokeWidth={0.7}
                strokeDasharray="3 3"
              />
              <line
                x1={cx} y1={cy}
                x2={cx + dxU * scale} y2={cy + dyU * scale}
                stroke="hsl(var(--muted-foreground) / 0.15)"
                strokeWidth={0.7}
                strokeDasharray="3 3"
              />
              {/* Label on upper line */}
              {(() => {
                const labelDist = maxAbs * 0.75;
                const lx = cx + (-labelDist * Math.cos(theta)) * scale;
                const ly = cy - (labelDist * Math.sin(theta)) * scale;
                return (
                  <text
                    x={lx} y={ly - 3}
                    fill="hsl(var(--muted-foreground) / 0.4)"
                    fontSize={6}
                    fontFamily="monospace"
                    textAnchor="middle"
                    transform={`rotate(${-(90 - theta * 180 / Math.PI)}, ${lx}, ${ly - 3})`}
                  >
                    ζ={zeta}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Constant natural frequency ωn circles */}
        {(() => {
          // Choose ωn values based on the plot scale
          const wnMax = maxAbs * 0.95;
          const step = Math.pow(10, Math.floor(Math.log10(wnMax)));
          const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].map(m => m * step / 10).filter(v => v > 0.05 && v < wnMax);
          // Pick at most 5 evenly spaced values
          const wnValues: number[] = [];
          const desired = Math.min(candidates.length, 5);
          for (let i = 0; i < desired; i++) {
            wnValues.push(candidates[Math.round(i * (candidates.length - 1) / (desired - 1))]);
          }
          return wnValues.map(wn => {
            const r = wn * scale;
            return (
              <g key={`wn${wn}`}>
                <circle
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke="hsl(var(--muted-foreground) / 0.12)"
                  strokeWidth={0.7}
                  strokeDasharray="2 3"
                />
                <text
                  x={cx + 3} y={cy - r - 2}
                  fill="hsl(var(--muted-foreground) / 0.35)"
                  fontSize={5.5}
                  fontFamily="monospace"
                >
                  ωn={wn % 1 === 0 ? wn : wn.toPrecision(2)}
                </text>
              </g>
            );
          });
        })()}

        {/* Asymptote lines and centroid */}
        {asymptotes && (() => {
          const { centroid, angles } = asymptotes;
          const cxA = toX(centroid);
          const cyA = toY(0);
          const lineLen = maxAbs * 2.5; // extend well beyond visible area
          return (
            <g>
              {/* Asymptote lines */}
              {angles.map((angle, i) => {
                const dx = Math.cos(angle) * lineLen * scale;
                const dy = -Math.sin(angle) * lineLen * scale; // negate for SVG coords
                return (
                  <line
                    key={`asym${i}`}
                    x1={cxA}
                    y1={cyA}
                    x2={cxA + dx}
                    y2={cyA + dy}
                    stroke="hsl(var(--muted-foreground) / 0.35)"
                    strokeWidth={1}
                    strokeDasharray="6 3"
                  />
                );
              })}
              {/* Centroid marker */}
              <line x1={cxA - 5} y1={cyA} x2={cxA + 5} y2={cyA} stroke="hsl(45, 90%, 55%)" strokeWidth={2} />
              <line x1={cxA} y1={cyA - 5} x2={cxA} y2={cyA + 5} stroke="hsl(45, 90%, 55%)" strokeWidth={2} />
              <title>Centroid σ_a = {centroid.toFixed(3)}</title>
            </g>
          );
        })()}

        {/* Root locus branches */}
        {loci.map((branch, b) => {
          if (branch.length < 2) return null;
          const color = branchColors[b % branchColors.length];
          const d = branch
            .filter(p => Math.abs(p.re) < maxAbs * 1.5 && Math.abs(p.im) < maxAbs * 1.5)
            .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.re).toFixed(1)},${toY(p.im).toFixed(1)}`)
            .join(" ");
          return <path key={b} d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />;
        })}

        {/* Open-loop poles (×) */}
        {olPoles.filter(p => !isNaN(p.re)).map((p, i) => {
          const x = toX(p.re), y = toY(p.im);
          return (
            <g key={`p${i}`}>
              <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="hsl(var(--destructive))" strokeWidth={2} />
              <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke="hsl(var(--destructive))" strokeWidth={2} />
            </g>
          );
        })}

        {/* Open-loop zeros (○) */}
        {olZeros.filter(z => !isNaN(z.re)).map((z, i) => {
          const x = toX(z.re), y = toY(z.im);
          return (
            <circle key={`z${i}`} cx={x} cy={y} r={5}
              fill="none" stroke="hsl(var(--accent))" strokeWidth={2} />
          );
        })}

        {/* Closed-loop poles at K (◆) */}
        {clPoles.map((p, i) => {
          const x = toX(p.re), y = toY(p.im);
          const inBounds = Math.abs(p.re) < maxAbs * 1.5 && Math.abs(p.im) < maxAbs * 1.5;
          if (!inBounds) return null;
          return (
            <g key={`cl${i}`}>
              <circle cx={x} cy={y} r={7} fill="hsl(var(--warning) / 0.2)" stroke="hsl(var(--warning))" strokeWidth={2} />
              <circle cx={x} cy={y} r={2.5} fill="hsl(var(--warning))" />
            </g>
          );
        })}

        {/* Breakaway / Break-in points (◆) */}
        {breakawayPoints.map((bp, i) => {
          const x = toX(bp.re), y = toY(0);
          const color = bp.type === "breakaway" ? "hsl(320, 80%, 60%)" : "hsl(180, 80%, 50%)";
          const size = 5;
          return (
            <g key={`bp${i}`}>
              <polygon
                points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
                fill={`${color.replace(")", " / 0.3)")}`}
                stroke={color}
                strokeWidth={1.5}
              />
              <title>{bp.type === "breakaway" ? "Breakaway" : "Break-in"} at σ = {bp.re.toFixed(3)}</title>
            </g>
          );
        })}

        {/* Direction arrows on branches */}
        {loci.map((branch, b) => {
          if (branch.length < 10) return null;
          const mid = Math.floor(branch.length / 3);
          const p0 = branch[mid], p1 = branch[mid + 1];
          if (!p0 || !p1) return null;
          const ax = toX(p0.re), ay = toY(p0.im);
          const dx = toX(p1.re) - ax, dy = toY(p1.im) - ay;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1) return null;
          const ux = dx / len, uy = dy / len;
          return (
            <polygon key={`a${b}`}
              points={`${ax + ux * 6},${ay + uy * 6} ${ax - uy * 3},${ay + ux * 3} ${ax + uy * 3},${ay - ux * 3}`}
              fill={branchColors[b % branchColors.length]}
            />
          );
        })}

        {/* Legend */}
        <g transform={`translate(6, ${H - 36})`}>
          <line x1={0} y1={0} x2={6} y2={6} stroke="hsl(var(--destructive))" strokeWidth={1.5} />
          <line x1={6} y1={0} x2={0} y2={6} stroke="hsl(var(--destructive))" strokeWidth={1.5} />
          <text x={10} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Poles</text>
          <circle cx={42} cy={3} r={3} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
          <text x={48} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Zeros</text>
          <circle cx={78} cy={3} r={4} fill="hsl(var(--warning) / 0.3)" stroke="hsl(var(--warning))" strokeWidth={1.5} />
          <text x={85} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">K</text>
          <polygon points="100,0 104,3 100,6 96,3" fill="hsl(320, 80%, 60% / 0.3)" stroke="hsl(320, 80%, 60%)" strokeWidth={1} />
          <text x={108} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Brk</text>
        </g>
        <g transform={`translate(6, ${H - 34})`}>
          <line x1={0} y1={0} x2={8} y2={0} stroke="hsl(var(--muted-foreground) / 0.35)" strokeWidth={1} strokeDasharray="3 2" />
          <text x={12} y={3} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Asymptotes</text>
          <line x1={72} y1={-3} x2={72} y2={3} stroke="hsl(45, 90%, 55%)" strokeWidth={1.5} />
          <line x1={69} y1={0} x2={75} y2={0} stroke="hsl(45, 90%, 55%)" strokeWidth={1.5} />
          <text x={79} y={3} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Centroid</text>
        </g>
        <g transform={`translate(6, ${H - 24})`}>
          <circle cx={4} cy={0} r={4} fill="none" stroke="hsl(var(--muted-foreground) / 0.25)" strokeWidth={0.7} strokeDasharray="2 3" />
          <text x={12} y={3} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">ωn circles</text>
          <line x1={72} y1={0} x2={80} y2={0} stroke="hsl(var(--muted-foreground) / 0.15)" strokeWidth={0.7} strokeDasharray="3 3" />
          <text x={84} y={3} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">ζ lines</text>
        </g>
      </svg>

      {/* K Slider */}
      <div className="px-2 space-y-1">
        <div className="flex items-center justify-between text-[9px] font-mono gap-2">
          <span className="text-muted-foreground">Gain K</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={kValue}
              min={0}
              max={kMax}
              step={kMax / 500}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0) setKValue(Math.min(v, kMax));
              }}
              className="w-16 text-[10px] font-mono bg-secondary/70 border border-border rounded px-1 py-0.5 text-foreground text-right focus:outline-none focus:border-primary"
            />
            <span className={`font-semibold ${isStableAtK ? "text-green-400" : "text-destructive"}`}>
              {isStableAtK ? "✓ Stable" : "✗ Unstable"}
            </span>
          </div>
        </div>
        <Slider
          value={[kValue]}
          onValueChange={([v]) => setKValue(v)}
          min={0}
          max={kMax}
          step={kMax / 500}
          className="w-full"
        />
        <div className="flex items-center justify-between text-[8px] text-muted-foreground font-mono">
          <span>0</span>
          <div className="flex gap-1">
            {[10, 50, 100, 500, 1000].map(m => (
              <button
                key={m}
                onClick={() => { setKMaxState(m); if (kValue > m) setKValue(m); }}
                className={`px-1 py-0.5 rounded ${kMax === m ? "bg-primary/20 text-primary" : "hover:text-foreground"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <span>{kMax}</span>
        </div>
        {/* CL pole positions */}
        {clPoles.length > 0 && (
          <div className="text-[8px] font-mono text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
            <span className="text-[7px] uppercase tracking-wider">CL Poles at K={kValue.toFixed(1)}:</span>
            {clPoles.map((p, i) => (
              <div key={i} className={p.re > 1e-8 ? "text-destructive" : "text-foreground/80"}>
                s{i + 1} = {p.re.toFixed(3)}{Math.abs(p.im) > 1e-10 ? ` ± j${Math.abs(p.im).toFixed(3)}` : ""}
              </div>
            ))}
          </div>
        )}
        {/* Breakaway/Break-in points */}
        {breakawayPoints.length > 0 && (
          <div className="text-[8px] font-mono text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
            <span className="text-[7px] uppercase tracking-wider">Breakaway/Break-in:</span>
            {breakawayPoints.map((bp, i) => (
              <div key={i} className="text-foreground/80">
                <span style={{ color: bp.type === "breakaway" ? "hsl(320, 80%, 60%)" : "hsl(180, 80%, 50%)" }}>
                  {bp.type === "breakaway" ? "◆ Away" : "◆ In"}
                </span>{" "}
                σ = {bp.re.toFixed(3)}
              </div>
            ))}
          </div>
        )}
        {/* Asymptote info */}
        {asymptotes && (
          <div className="text-[8px] font-mono text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
            <span className="text-[7px] uppercase tracking-wider">Asymptotes ({asymptotes.n}P − {asymptotes.m}Z = {asymptotes.n - asymptotes.m}):</span>
            <div className="text-foreground/80">
              σ_a = {asymptotes.centroid.toFixed(3)}
            </div>
            <div className="text-foreground/80">
              θ = {asymptotes.angles.map(a => `${(a * 180 / Math.PI).toFixed(0)}°`).join(", ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nichols Chart (SVG) ─────────────────────────────────────────────────────

function NicholsChart({ result }: { result: SolverResult }) {
  const { data, margins } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const pts: { phaseDeg: number; magDb: number; w: number }[] = [];

    let gcPhase: number | null = null;
    let pcMag: number | null = null;
    let gmDb = Infinity;
    let pmDeg = Infinity;

    let prevMagDb = NaN;
    let prevPhase = NaN;

    for (let exp = -3; exp <= 4; exp += 0.02) {
      const w = Math.pow(10, exp);
      let numRe = 0, numIm = 0;
      for (let k = 0; k < num.coeffs.length; k++) {
        const c = num.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: numRe += c * wk; break;
          case 1: numIm += c * wk; break;
          case 2: numRe -= c * wk; break;
          case 3: numIm -= c * wk; break;
        }
      }
      let denRe = 0, denIm = 0;
      for (let k = 0; k < den.coeffs.length; k++) {
        const c = den.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: denRe += c * wk; break;
          case 1: denIm += c * wk; break;
          case 2: denRe -= c * wk; break;
          case 3: denIm -= c * wk; break;
        }
      }
      const dMagSq = denRe * denRe + denIm * denIm;
      if (dMagSq < 1e-30) continue;
      const gRe = (numRe * denRe + numIm * denIm) / dMagSq;
      const gIm = (numIm * denRe - numRe * denIm) / dMagSq;
      const mag = Math.sqrt(gRe * gRe + gIm * gIm);
      const magDb = 20 * Math.log10(mag || 1e-30);
      const phaseDeg = Math.atan2(gIm, gRe) * (180 / Math.PI);

      // Detect crossovers
      if (!isNaN(prevMagDb)) {
        if (gcPhase === null && ((prevMagDb > 0 && magDb <= 0) || (prevMagDb < 0 && magDb >= 0))) {
          const t = Math.abs(prevMagDb) / (Math.abs(prevMagDb) + Math.abs(magDb) + 1e-30);
          gcPhase = prevPhase + t * (phaseDeg - prevPhase);
          pmDeg = 180 + gcPhase;
        }
        if (pcMag === null && ((prevPhase > -180 && phaseDeg <= -180) || (prevPhase < -180 && phaseDeg >= -180))) {
          const t = Math.abs(prevPhase + 180) / (Math.abs(prevPhase + 180) + Math.abs(phaseDeg + 180) + 1e-30);
          pcMag = prevMagDb + t * (magDb - prevMagDb);
          gmDb = -pcMag;
        }
      }

      if (magDb > -80 && magDb < 80) {
        pts.push({ phaseDeg, magDb, w });
      }
      prevMagDb = magDb;
      prevPhase = phaseDeg;
    }
    return { data: pts, margins: { gcPhase, pcMag, gmDb, pmDeg } };
  }, [result]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        Insufficient data for Nichols chart
      </div>
    );
  }

  // Chart dimensions
  const W = 360, H = 300;
  const padL = 40, padR = 15, padT = 15, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Axis ranges
  const phaseMin = -360, phaseMax = 0;
  const magMin = -40, magMax = 40;
  const phaseRange = phaseMax - phaseMin;
  const magRange = magMax - magMin;

  const toX = (phase: number) => padL + ((phase - phaseMin) / phaseRange) * plotW;
  const toY = (mag: number) => padT + ((magMax - mag) / magRange) * plotH;

  // Build path
  const pathD = data.map((p, i) => {
    const x = toX(Math.max(phaseMin, Math.min(phaseMax, p.phaseDeg)));
    const y = toY(Math.max(magMin, Math.min(magMax, p.magDb)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // M-circle contours (closed-loop magnitude in dB)
  const mCircleValues = [-12, -6, -3, -1, 0, 0.25, 0.5, 1, 3, 6, 12];

  // Generate M-circle points: |G/(1+G)| = M where M = 10^(MdB/20)
  // Parametrically: for each M, sweep angle to get (phase, magdB) locus
  const mCirclePaths: Array<{ mDb: number; path: string }> = [];
  for (const mDb of mCircleValues) {
    const M = Math.pow(10, mDb / 20);
    const pts: string[] = [];
    for (let theta = 0; theta <= 360; theta += 2) {
      const rad = (theta * Math.PI) / 180;
      // G = M*e^(j*theta) / (1 - M*e^(j*theta)) ... but we need the Nichols form
      // Use: for |T|=M, T = G/(1+G), so G = T/(1-T), T = M*e^(j*alpha)
      const tRe = M * Math.cos(rad);
      const tIm = M * Math.sin(rad);
      const dRe = 1 - tRe;
      const dIm = -tIm;
      const dMagSq = dRe * dRe + dIm * dIm;
      if (dMagSq < 1e-10) continue;
      const gRe = (tRe * dRe + tIm * dIm) / dMagSq;
      const gIm = (tIm * dRe - tRe * dIm) / dMagSq;
      const gMag = Math.sqrt(gRe * gRe + gIm * gIm);
      const gMagDb = 20 * Math.log10(gMag || 1e-30);
      const gPhaseDeg = Math.atan2(gIm, gRe) * (180 / Math.PI);

      if (gPhaseDeg >= phaseMin && gPhaseDeg <= phaseMax && gMagDb >= magMin && gMagDb <= magMax) {
        const x = toX(gPhaseDeg);
        const y = toY(gMagDb);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
    }
    if (pts.length > 3) {
      mCirclePaths.push({ mDb, path: "M" + pts.join(" L") });
    }
  }

  // Direction arrow
  const midIdx = Math.floor(data.length / 3);
  const arrowData = midIdx < data.length - 1 ? {
    x1: toX(data[midIdx].phaseDeg), y1: toY(data[midIdx].magDb),
    x2: toX(data[midIdx + 1].phaseDeg), y2: toY(data[midIdx + 1].magDb),
  } : null;

  const { gcPhase, pcMag, gmDb, pmDeg } = margins;

  return (
    <div className="space-y-1">
      <div className="flex gap-3 px-2 py-1 text-[9px] font-mono text-muted-foreground">
        <span>GM: <span className={gmDb !== Infinity ? (gmDb > 0 ? "text-green-400" : "text-destructive") : ""}>{gmDb === Infinity ? "∞" : `${gmDb.toFixed(1)} dB`}</span></span>
        <span>PM: <span className={pmDeg !== Infinity ? (pmDeg > 0 ? "text-green-400" : "text-destructive") : ""}>{pmDeg === Infinity ? "∞" : `${pmDeg.toFixed(1)}°`}</span></span>
      </div>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[360px] mx-auto">
        {/* Grid lines */}
        {[-360, -315, -270, -225, -180, -135, -90, -45, 0].map(p => (
          <line key={`gp${p}`} x1={toX(p)} y1={padT} x2={toX(p)} y2={padT + plotH}
            stroke={p === -180 ? "hsl(var(--destructive) / 0.4)" : "hsl(var(--border) / 0.5)"}
            strokeWidth={p === -180 ? 1.5 : 0.5}
            strokeDasharray={p === -180 ? "6 3" : "2 3"} />
        ))}
        {[-40, -20, 0, 20, 40].map(m => (
          <line key={`gm${m}`} x1={padL} y1={toY(m)} x2={padL + plotW} y2={toY(m)}
            stroke={m === 0 ? "hsl(var(--warning) / 0.5)" : "hsl(var(--border) / 0.5)"}
            strokeWidth={m === 0 ? 1.5 : 0.5}
            strokeDasharray={m === 0 ? "6 3" : "2 3"} />
        ))}

        {/* M-circles */}
        {mCirclePaths.map(({ mDb, path }) => (
          <path key={`mc${mDb}`} d={path} fill="none"
            stroke={Math.abs(mDb) <= 1 ? "hsl(var(--primary) / 0.3)" : "hsl(var(--muted-foreground) / 0.15)"}
            strokeWidth={Math.abs(mDb) <= 1 ? 0.8 : 0.5}
            strokeDasharray="3 4" />
        ))}
        {/* M-circle labels */}
        {mCirclePaths.map(({ mDb, path }) => {
          const match = path.match(/M([\d.]+),([\d.]+)/);
          if (!match) return null;
          return (
            <text key={`ml${mDb}`} x={parseFloat(match[1]) + 2} y={parseFloat(match[2]) - 2}
              fill="hsl(var(--muted-foreground) / 0.4)" fontSize={6} fontFamily="monospace">
              {mDb > 0 ? `+${mDb}` : mDb}dB
            </text>
          );
        })}

        {/* N-circles (constant closed-loop phase contours) */}
        {(() => {
          const nPhaseValues = [-150, -120, -90, -60, -30, -10, 10, 30, 60, 90, 120, 150];
          const nPaths: Array<{ nDeg: number; path: string }> = [];
          for (const nDeg of nPhaseValues) {
            const alpha = (nDeg * Math.PI) / 180;
            const pts: Array<[number, number]> = [];
            // Sweep |T| from very small to very large to trace the N-circle
            for (let logM = -2; logM <= 2; logM += 0.02) {
              const Mmag = Math.pow(10, logM);
              const tRe = Mmag * Math.cos(alpha);
              const tIm = Mmag * Math.sin(alpha);
              const dRe = 1 - tRe;
              const dIm = -tIm;
              const dMagSq = dRe * dRe + dIm * dIm;
              if (dMagSq < 1e-10) continue;
              const gRe2 = (tRe * dRe + tIm * dIm) / dMagSq;
              const gIm2 = (tIm * dRe - tRe * dIm) / dMagSq;
              const gMag2 = Math.sqrt(gRe2 * gRe2 + gIm2 * gIm2);
              const gMagDb2 = 20 * Math.log10(gMag2 || 1e-30);
              const gPhaseDeg2 = Math.atan2(gIm2, gRe2) * (180 / Math.PI);
              if (gPhaseDeg2 >= phaseMin && gPhaseDeg2 <= phaseMax && gMagDb2 >= magMin && gMagDb2 <= magMax) {
                pts.push([toX(gPhaseDeg2), toY(gMagDb2)]);
              }
            }
            // Filter out large jumps (discontinuities from wrapping)
            if (pts.length > 3) {
              const segments: string[] = [];
              let seg: string[] = [`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`];
              for (let i = 1; i < pts.length; i++) {
                const dx = pts[i][0] - pts[i - 1][0];
                const dy = pts[i][1] - pts[i - 1][1];
                if (Math.sqrt(dx * dx + dy * dy) > 50) {
                  if (seg.length > 2) segments.push(seg.join(" "));
                  seg = [`M${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`];
                } else {
                  seg.push(`L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`);
                }
              }
              if (seg.length > 2) segments.push(seg.join(" "));
              if (segments.length > 0) {
                nPaths.push({ nDeg, path: segments.join(" ") });
              }
            }
          }
          return (
            <>
              {nPaths.map(({ nDeg, path }) => (
                <path key={`nc${nDeg}`} d={path} fill="none"
                  stroke="hsl(var(--chart-4) / 0.25)"
                  strokeWidth={0.5}
                  strokeDasharray="2 4" />
              ))}
              {nPaths.map(({ nDeg, path }) => {
                const match = path.match(/M([\d.]+),([\d.]+)/);
                if (!match) return null;
                return (
                  <text key={`nl${nDeg}`} x={parseFloat(match[1]) + 2} y={parseFloat(match[2]) + 6}
                    fill="hsl(var(--chart-4) / 0.35)" fontSize={5.5} fontFamily="monospace">
                    {nDeg}°
                  </text>
                );
              })}
            </>
          );
        })()}

        {/* Critical point (-180°, 0 dB) */}
        <circle cx={toX(-180)} cy={toY(0)} r={5}
          fill="hsl(var(--destructive) / 0.2)" stroke="hsl(var(--destructive))" strokeWidth={2} />

        {/* GM annotation */}
        {pcMag !== null && (
          <>
            <line x1={toX(-180)} y1={toY(pcMag)} x2={toX(-180)} y2={toY(0)}
              stroke="hsl(var(--destructive) / 0.6)" strokeWidth={2} strokeDasharray="4 2" />
            <circle cx={toX(-180)} cy={toY(pcMag)} r={3}
              fill="hsl(var(--destructive))" stroke="none" />
          </>
        )}

        {/* PM annotation */}
        {gcPhase !== null && (
          <>
            <line x1={toX(gcPhase)} y1={toY(0)} x2={toX(-180)} y2={toY(0)}
              stroke="hsl(var(--primary) / 0.6)" strokeWidth={2} strokeDasharray="4 2" />
            <circle cx={toX(gcPhase)} cy={toY(0)} r={3}
              fill="hsl(var(--primary))" stroke="none" />
          </>
        )}

        {/* Open-loop curve */}
        <path d={pathD} fill="none" stroke="hsl(var(--accent))" strokeWidth={2} />

        {/* Direction arrow */}
        {arrowData && (() => {
          const dx = arrowData.x2 - arrowData.x1;
          const dy = arrowData.y2 - arrowData.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1) return null;
          const ux = dx / len, uy = dy / len;
          return (
            <polygon
              points={`${arrowData.x1 + ux * 7},${arrowData.y1 + uy * 7} ${arrowData.x1 - uy * 3.5},${arrowData.y1 + ux * 3.5} ${arrowData.x1 + uy * 3.5},${arrowData.y1 - ux * 3.5}`}
              fill="hsl(var(--accent))"
            />
          );
        })()}

        {/* Axis labels */}
        {[-360, -270, -180, -90, 0].map(p => (
          <text key={`xl${p}`} x={toX(p)} y={padT + plotH + 15} textAnchor="middle"
            fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">{p}°</text>
        ))}
        {[-40, -20, 0, 20, 40].map(m => (
          <text key={`yl${m}`} x={padL - 5} y={toY(m) + 3} textAnchor="end"
            fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">{m}</text>
        ))}
        <text x={padL + plotW / 2} y={H - 2} textAnchor="middle"
          fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Open-Loop Phase (deg)</text>
        <text x={8} y={padT + plotH / 2} textAnchor="middle"
          fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace"
          transform={`rotate(-90, 8, ${padT + plotH / 2})`}>dB</text>

        {/* Legend */}
        <g transform={`translate(${padL + 5}, ${padT + 5})`}>
          <line x1={0} y1={3} x2={12} y2={3} stroke="hsl(var(--accent))" strokeWidth={2} />
          <text x={16} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">G(jω)</text>
          <line x1={50} y1={3} x2={62} y2={3} stroke="hsl(var(--primary) / 0.3)" strokeWidth={0.8} strokeDasharray="3 4" />
          <text x={66} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">M-circles</text>
          <line x1={115} y1={3} x2={127} y2={3} stroke="hsl(var(--chart-4) / 0.4)" strokeWidth={0.5} strokeDasharray="2 4" />
          <text x={131} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">N-circles</text>
        </g>
      </svg>
    </div>
  );
}

// ─── Combined Panel ──────────────────────────────────────────────────────────

type PlotTab = "pzmap" | "step" | "bode" | "nyquist" | "nichols" | "rlocus";

export function AnalysisPlots({ result }: { result: SolverResult }) {
  const [tab, setTab] = React.useState<PlotTab>("pzmap");
  const plotRef = useRef<HTMLDivElement>(null);

  const tabs: { id: PlotTab; label: string }[] = [
    { id: "pzmap", label: "P-Z" },
    { id: "step", label: "Step" },
    { id: "bode", label: "Bode" },
    { id: "nyquist", label: "Nyquist" },
    { id: "nichols", label: "Nichols" },
    { id: "rlocus", label: "R.Locus" },
  ];

  const handleExport = useCallback(async () => {
    if (!plotRef.current) return;

    try {
      const canvas = await html2canvas(plotRef.current, {
        backgroundColor: "#0d1117",
        scale: 2,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `${tab}-plot.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [tab]);

  return (
    <div className="panel-section overflow-hidden">
      <div className="flex border-b border-border items-center">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[10px] font-semibold tracking-wide uppercase transition-all ${
              tab === t.id
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={handleExport}
          className="px-2 py-2 text-muted-foreground hover:text-primary transition-colors"
          title="Export as PNG"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
      <div ref={plotRef} className="p-3 min-h-[220px] bg-background">
        {tab === "pzmap" && <PoleZeroMap result={result} />}
        {tab === "step" && <TimeResponsePlot result={result} />}
        {tab === "bode" && <BodePlot result={result} />}
        {tab === "nyquist" && <NyquistPlot result={result} />}
        {tab === "nichols" && <NicholsChart result={result} />}
        {tab === "rlocus" && <RootLocusPlot result={result} />}
      </div>
    </div>
  );
}
