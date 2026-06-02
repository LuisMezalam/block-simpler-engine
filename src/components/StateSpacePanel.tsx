/**
 * State-Space Input Panel
 * Allows users to enter A, B, C, D matrices and converts to G(s) via exact polynomial arithmetic.
 */
import React, { useState, useCallback } from "react";
import {
  StateSpaceSystem, SSConversionResult, SSPreset,
  stateSpaceToTF, validateStateSpace, matMake, SS_PRESETS,
} from "@/lib/stateSpace";
import { format } from "@/lib/polynomial";
import { cn } from "@/lib/utils";

// ─── Matrix cell editor ───────────────────────────────────────────────────────

function MatrixEditor({
  label,
  rows,
  cols,
  data,
  onChange,
}: {
  label: string;
  rows: number;
  cols: number;
  data: number[][];
  onChange: (data: number[][]) => void;
}) {
  const handleCell = (r: number, c: number, val: string) => {
    const next = data.map(row => [...row]);
    next[r][c] = parseFloat(val) || 0;
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
        {label}
        <span className="ml-1 text-muted-foreground/60">({rows}×{cols})</span>
      </div>
      <div className="inline-block">
        {/* Left bracket */}
        <div className="flex items-stretch gap-0.5">
          <div className="flex flex-col justify-between py-1">
            <span className="text-signal text-lg leading-none font-light">⎡</span>
            {Array.from({ length: rows - 2 }).map((_, i) => (
              <span key={i} className="text-signal text-lg leading-none font-light">⎢</span>
            ))}
            <span className="text-signal text-lg leading-none font-light">⎣</span>
          </div>

          {/* Grid of inputs */}
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: rows }).map((_, r) =>
              Array.from({ length: cols }).map((_, c) => (
                <input
                  key={`${r}-${c}`}
                  type="number"
                  step="any"
                  value={data[r]?.[c] ?? 0}
                  onChange={e => handleCell(r, c, e.target.value)}
                  className="w-14 bg-secondary/70 border border-border rounded px-1.5 py-1 text-xs font-mono text-foreground text-center focus:outline-none focus:border-primary transition-colors"
                />
              ))
            )}
          </div>

          {/* Right bracket */}
          <div className="flex flex-col justify-between py-1">
            <span className="text-signal text-lg leading-none font-light">⎤</span>
            {Array.from({ length: rows - 2 }).map((_, i) => (
              <span key={i} className="text-signal text-lg leading-none font-light">⎥</span>
            ))}
            <span className="text-signal text-lg leading-none font-light">⎦</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Default data ─────────────────────────────────────────────────────────────

function makeDefaultData(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => r === c ? 1 : 0)
  );
}

// ─── Result display ───────────────────────────────────────────────────────────

function SSResultDisplay({ result }: { result: SSConversionResult }) {
  const [showDerivation, setShowDerivation] = useState(false);
  const poleStrs = result.poles.map(p => {
    if (isNaN(p.re)) return "?";
    if (Math.abs(p.im) < 1e-10) return p.re.toFixed(4);
    const sign = p.im >= 0 ? "+" : "-";
    return `${p.re.toFixed(3)} ${sign} j${Math.abs(p.im).toFixed(3)}`;
  });
  const zeroStrs = result.zeros.map(z => {
    if (isNaN(z.re)) return "?";
    if (Math.abs(z.im) < 1e-10) return z.re.toFixed(4);
    const sign = z.im >= 0 ? "+" : "-";
    return `${z.re.toFixed(3)} ${sign} j${Math.abs(z.im).toFixed(3)}`;
  });

  return (
    <div className="panel-section overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
        <h3 className="text-sm font-bold text-foreground">State-Space → G(s) Result</h3>
        {result.system.label && (
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            {result.system.label}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Main TF result */}
        <div className="result-display rounded-lg p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            G(s) = C(sI−A)⁻¹B + D =
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="text-sm font-mono text-primary font-medium leading-relaxed">
              {result.display.num}
            </div>
            <div className="h-px w-full bg-primary/40" />
            <div className="text-sm font-mono text-foreground/80 leading-relaxed">
              {result.display.den}
            </div>
          </div>
        </div>

        {/* Characteristic polynomial */}
        <div className="bg-secondary/50 rounded px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Characteristic Polynomial — det(sI − A)
          </div>
          <div className="text-xs font-mono text-accent">
            {format(result.charPoly)} = 0
          </div>
        </div>

        {/* Poles & Zeros */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Open-Loop Poles (eigenvalues of A)
            </div>
            {poleStrs.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">None</div>
            ) : poleStrs.map((p, i) => (
              <div key={i} className="text-xs font-mono text-foreground/90">s = {p}</div>
            ))}
          </div>
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Transmission Zeros
            </div>
            {zeroStrs.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">None</div>
            ) : zeroStrs.map((z, i) => (
              <div key={i} className="text-xs font-mono text-foreground/90">s = {z}</div>
            ))}
          </div>
        </div>

        {/* Step-by-step derivation toggle */}
        <div>
          <button
            onClick={() => setShowDerivation(!showDerivation)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider py-1 border-t border-border pt-3"
          >
            <span>Step-by-Step Derivation</span>
            <span>{showDerivation ? "▲" : "▼"}</span>
          </button>
          {showDerivation && (
            <ol className="mt-2 space-y-1">
              {result.derivation.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground font-mono flex-shrink-0 w-4">{i + 1}.</span>
                  <span className="font-mono text-foreground/85 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function StateSpacePanel() {
  const [order, setOrder] = useState(2); // n (system order)
  const [aData, setAData] = useState<number[][]>(() => makeDefaultData(2, 2));
  const [bData, setBData] = useState<number[][]>(() => [[0], [1]]);
  const [cData, setCData] = useState<number[][]>(() => [[1, 0]]);
  const [dData, setDData] = useState<number[][]>(() => [[0]]);
  const [result, setResult] = useState<SSConversionResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showPresets, setShowPresets] = useState(false);

  const applyPreset = (preset: SSPreset) => {
    const sys = preset.system;
    const n = sys.A.rows;
    setOrder(n);
    setAData(sys.A.data.map(r => [...r]));
    setBData(sys.B.data.map(r => [...r]));
    setCData(sys.C.data.map(r => [...r]));
    setDData(sys.D.data.map(r => [...r]));
    setResult(null);
    setErrors([]);
    setShowPresets(false);
  };

  const changeOrder = (n: number) => {
    setOrder(n);
    setAData(makeDefaultData(n, n));
    setBData(Array.from({ length: n }, () => [0]));
    setCData([Array.from({ length: n }, (_, i) => i === 0 ? 1 : 0)]);
    setDData([[0]]);
    setResult(null);
    setErrors([]);
  };

  const handleConvert = useCallback(() => {
    const sys: StateSpaceSystem = {
      A: matMake(order, order, aData),
      B: matMake(order, 1, bData),
      C: matMake(1, order, cData),
      D: matMake(1, 1, dData),
      label: `n=${order} system`,
    };

    const validationErrors = validateStateSpace(sys);
    if (validationErrors.length > 0) {
      setErrors(validationErrors.map(e => `${e.field}: ${e.message}`));
      setResult(null);
      return;
    }

    try {
      setErrors([]);
      const res = stateSpaceToTF(sys);
      setResult(res);
    } catch (e: unknown) {
      setErrors([e instanceof Error ? e.message : "Conversion failed"]);
      setResult(null);
    }
  }, [order, aData, bData, cData, dData]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <h2 className="text-sm font-bold text-foreground tracking-wide uppercase">
            State-Space Solver
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          ẋ = Ax + Bu · y = Cx + Du · G(s) = C(sI−A)⁻¹B + D
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Presets */}
        <div>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider py-1"
          >
            <span>System Presets</span>
            <span>{showPresets ? "▲" : "▼"}</span>
          </button>
          {showPresets && (
            <div className="mt-2 space-y-1">
              {SS_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(p)}
                  className="w-full text-left px-3 py-2 rounded bg-secondary hover:bg-secondary/80 text-xs text-foreground hover:text-primary transition-colors"
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.description}</div>
                  {p.expectedTF && (
                    <div className="text-[10px] text-accent mt-0.5 font-mono">Expected: {p.expectedTF}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* System order selector */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">
            System Order (n)
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => changeOrder(n)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-mono rounded border transition-all",
                  order === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                )}
              >
                n = {n}
              </button>
            ))}
          </div>
        </div>

        {/* Matrix editors */}
        <div className="space-y-4">
          <MatrixEditor label="A — System matrix" rows={order} cols={order} data={aData} onChange={setAData} />
          <div className="grid grid-cols-2 gap-4">
            <MatrixEditor label="B — Input matrix" rows={order} cols={1} data={bData} onChange={setBData} />
            <MatrixEditor label="D — Feedthrough" rows={1} cols={1} data={dData} onChange={setDData} />
          </div>
          <MatrixEditor label="C — Output matrix" rows={1} cols={order} data={cData} onChange={setCData} />
        </div>

        {/* Equations reminder */}
        <div className="eq-display rounded px-3 py-2 space-y-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Transfer Function Formula</div>
          <div className="text-xs font-mono text-accent">G(s) = C·adj(sI−A)·B + D·det(sI−A)</div>
          <div className="text-xs font-mono text-muted-foreground">              ─────────────────────────</div>
          <div className="text-xs font-mono text-accent">               det(sI − A)</div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="text-xs text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded p-3 space-y-1">
            {errors.map((e, i) => <div key={i}>⚠️ {e}</div>)}
          </div>
        )}

        {/* Convert button */}
        <button
          onClick={handleConvert}
          className="btn-glow w-full py-2.5 rounded-lg text-sm font-bold tracking-wide"
        >
          ⚡ Convert to G(s)
        </button>

        {/* Result */}
        {result && <SSResultDisplay result={result} />}
      </div>
    </div>
  );
}
