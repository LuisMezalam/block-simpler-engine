import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { solve, SolverResult, ConnectionType, stabilityLabel } from "@/lib/solver";
import { computeMargins, StabilityMargins } from "@/lib/margins";
import { BlockDiagram } from "@/components/BlockDiagram";
import { DiagramEditor } from "@/components/DiagramEditor";
import { SanityLibrary } from "@/components/SanityLibrary";
import { RoboticsResourceHub } from "@/components/RoboticsResourceHub";
import { StateSpacePanel } from "@/components/StateSpacePanel";
import { AnalysisPlots } from "@/components/AnalysisPlots";
import { CourseInsightPanel } from "@/components/CourseInsightPanel";
import {
  AWESOME_MATLAB_ROBOTICS_LICENSE_URL,
  AWESOME_MATLAB_ROBOTICS_URL,
  ROBOTICS_RESOURCES,
} from "@/lib/roboticsResources";
import { cn } from "@/lib/utils";
import {
  Bot,
  BookOpen,
  Calculator,
  CheckCircle2,
  Download,
  ExternalLink,
  FlaskConical,
  HelpCircle,
  Library,
  Network,
  PlayCircle,
  Share2,
  Sigma,
  Upload,
} from "lucide-react";

type ConnectionMode = ConnectionType;
type AppTab = "builder" | "statespace" | "library" | "robotics";
type Preset = {
  label: string;
  category?: string;
  goal?: string;
  connection: ConnectionMode;
  blocks: BlockState[];
  feedbackBlock: BlockState;
};

const CONNECTION_OPTIONS: {
  value: ConnectionMode;
  label: string;
  desc: string;
  icon: string;
  useCase: string;
  inputs: string;
  next: string;
}[] = [
  {
    value: "series",
    label: "Series (Cascade)",
    desc: "G_eq = G1 * G2 * ... * Gn",
    icon: "->",
    useCase: "Blocks happen one after another in the forward path.",
    inputs: "Two or more G blocks",
    next: "Check pole and zero growth after multiplication.",
  },
  {
    value: "parallel",
    label: "Parallel",
    desc: "G_eq = G1 + G2 + ...",
    icon: "+",
    useCase: "Branches share an input and recombine at a summing junction.",
    inputs: "Two or more branch blocks",
    next: "Watch the new numerator zeros after cross-multiplication.",
  },
  {
    value: "feedback_negative",
    label: "Negative Feedback",
    desc: "G_eq = G / (1 + GH)",
    icon: "-fb",
    useCase: "Output is measured through H(s) and subtracted from the reference.",
    inputs: "Forward G and feedback H",
    next: "Use Routh and static error checks after solving.",
  },
  {
    value: "unity_feedback",
    label: "Unity Feedback",
    desc: "G_eq = G / (1 + G)",
    icon: "1fb",
    useCase: "Standard course loop where H(s) = 1.",
    inputs: "One forward G block",
    next: "Best starting point for time-response and error constants.",
  },
  {
    value: "feedback_positive",
    label: "Positive Feedback",
    desc: "G_eq = G / (1 - GH)",
    icon: "+fb",
    useCase: "Fed-back signal is added, often creating instability.",
    inputs: "Forward G and feedback H",
    next: "Verify stability immediately with Routh-Hurwitz.",
  },
];

type BlockState = { id: string; label: string; num: string; den: string };

type SavedProjectV1 = {
  version: 1;
  savedAt: string;
  app: "block-diagram-simplifier";
  connectionType: ConnectionMode;
  blocks: BlockState[];
  feedbackBlock: BlockState;
};

const PROJECT_QUERY_PARAM = "project";

const DEFAULT_BLOCKS: BlockState[] = [
  { id: "g1", label: "G₁", num: "1", den: "s + 1" },
  { id: "g2", label: "G₂", num: "2", den: "s + 2" },
];
const DEFAULT_FEEDBACK: BlockState = { id: "h1", label: "H", num: "1", den: "1" };

function isConnectionMode(value: unknown): value is ConnectionMode {
  return typeof value === "string" && CONNECTION_OPTIONS.some((option) => option.value === value);
}

function isBlockState(value: unknown): value is BlockState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BlockState>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.num === "string" &&
    typeof candidate.den === "string" &&
    candidate.id.trim().length > 0 &&
    candidate.label.trim().length > 0 &&
    candidate.num.trim().length > 0 &&
    candidate.den.trim().length > 0
  );
}

function validateProjectPayload(payload: unknown): SavedProjectV1 {
  if (!payload || typeof payload !== "object") {
    throw new Error("Project file is not valid JSON data.");
  }

  const project = payload as Partial<SavedProjectV1>;
  if (project.version !== 1 || project.app !== "block-diagram-simplifier") {
    throw new Error("Project file version is not supported.");
  }
  if (!isConnectionMode(project.connectionType)) {
    throw new Error("Project file has an invalid connection type.");
  }
  if (!Array.isArray(project.blocks) || project.blocks.length === 0 || project.blocks.some((block) => !isBlockState(block))) {
    throw new Error("Project file has invalid transfer-function blocks.");
  }
  if (!isBlockState(project.feedbackBlock)) {
    throw new Error("Project file has an invalid feedback block.");
  }

  const minimumBlocks = project.connectionType === "series" || project.connectionType === "parallel" ? 2 : 1;
  if (project.blocks.length < minimumBlocks) {
    throw new Error(`${project.connectionType} projects need at least ${minimumBlocks} block(s).`);
  }

  return {
    version: 1,
    savedAt: typeof project.savedAt === "string" ? project.savedAt : new Date().toISOString(),
    app: "block-diagram-simplifier",
    connectionType: project.connectionType,
    blocks: project.blocks.slice(0, 8).map((block) => ({ ...block })),
    feedbackBlock: { ...project.feedbackBlock },
  };
}

function encodeProjectSnapshot(snapshot: SavedProjectV1): string {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeProjectSnapshot(encoded: string): SavedProjectV1 {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return validateProjectPayload(JSON.parse(new TextDecoder().decode(bytes)));
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some embedded browsers deny clipboard writes unless the page is focused.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

// ─── Typed block input component ─────────────────────────────────────────────
function TFInput({
  label,
  num,
  den,
  onChange,
  hint,
}: {
  label: string;
  num: string;
  den: string;
  onChange: (num: string, den: string) => void;
  hint?: string;
}) {
  return (
    <div className="tf-block rounded-lg p-3">
      <div className="text-xs font-bold text-primary mb-2 font-mono">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/60 font-mono mb-1.5">{hint}</div>}
      <div className="space-y-1.5">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">
            Numerator N(s)
          </label>
          <input
            type="text"
            value={num}
            onChange={e => onChange(e.target.value, den)}
            placeholder="e.g. 1, s+1, 2s^2+3s+1"
            className="w-full bg-secondary/70 border border-border rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="h-px bg-primary/30 mx-1" />
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">
            Denominator D(s)
          </label>
          <input
            type="text"
            value={den}
            onChange={e => onChange(num, e.target.value)}
            placeholder="e.g. s, s+2, s^2+3s+2"
            className="w-full bg-secondary/70 border border-border rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

function WorkflowGuide({ activeTab }: { activeTab: AppTab }) {
  const steps = activeTab === "builder"
    ? [
        { icon: Network, label: "Pick topology", detail: "Choose series, parallel, or feedback." },
        { icon: Calculator, label: "Enter G(s)", detail: "Use numeric polynomial terms in s." },
        { icon: PlayCircle, label: "Calculate", detail: "Get G_eq, course checks, and plots." },
      ]
    : activeTab === "statespace"
      ? [
          { icon: Sigma, label: "Enter A B C D", detail: "Use matrices from your model." },
          { icon: Calculator, label: "Convert", detail: "Generate the SISO transfer function." },
          { icon: FlaskConical, label: "Analyze", detail: "Bring it back into the block tools." },
        ]
      : activeTab === "library"
        ? [
          { icon: Library, label: "Search", detail: "Find identities by topic or coverage." },
          { icon: CheckCircle2, label: "Check status", detail: "Live, partial, or reference." },
          { icon: BookOpen, label: "Study", detail: "Read formula, derivation, and notes." },
        ]
        : [
          { icon: Bot, label: "Find tooling", detail: "Browse MATLAB robotics resources." },
          { icon: CheckCircle2, label: "Check needs", detail: "Review licenses and toolbox requirements." },
          { icon: ExternalLink, label: "Open source", detail: "Jump to GitHub, docs, or File Exchange." },
        ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {steps.map(({ icon: Icon, label, detail }) => (
        <div key={label} className="rounded border border-border bg-secondary/25 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Icon className="h-3.5 w-3.5 text-primary" />
            {label}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  );
}

function ModeCoach({ option }: { option: (typeof CONNECTION_OPTIONS)[number] }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <HelpCircle className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Mode Coach
        </span>
      </div>
      <div className="space-y-2 text-[11px] leading-snug text-muted-foreground">
        <p><span className="font-semibold text-foreground">Use when:</span> {option.useCase}</p>
        <p><span className="font-semibold text-foreground">Needs:</span> {option.inputs}</p>
        <p><span className="font-semibold text-foreground">Next check:</span> {option.next}</p>
      </div>
    </div>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────
function ResultPanel({ result, error }: { result: SolverResult | null; error: string }) {
  const [showDerivation, setShowDerivation] = useState(false);

  const margins = useMemo<StabilityMargins | null>(() => {
    if (!result) return null;
    try {
      return computeMargins(result.equivalentTF.num, result.equivalentTF.den);
    } catch {
      return null;
    }
  }, [result]);

  if (error) {
    return (
      <div className="panel-section p-4">
        <div className="text-xs text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded p-3">
          ⚠️ {error}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="panel-section p-6">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
          <Calculator className="h-4 w-4 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Ready for a transfer function.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a topology, load an example if you want a starting point, then calculate G_eq(s).
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {["Exact simplification", "Stability verdict", "Course checks"].map((label) => (
            <div key={label} className="rounded border border-border bg-secondary/30 px-3 py-2 text-center text-[10px] text-muted-foreground">
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stab = stabilityLabel(result.stability);
  const connLabel = CONNECTION_OPTIONS.find(o => o.value === result.connectionType)?.label ?? result.connectionType;

  return (
    <div className="panel-section overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold badge-series">
          {connLabel}
        </span>
        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded font-semibold border", stab.color,
          result.stability === "stable" ? "bg-success/10 border-success/30" :
          result.stability === "unstable" ? "bg-destructive/10 border-destructive/30" :
          "bg-warning/10 border-warning/30"
        )}>
          {stab.label}
        </span>
        <h3 className="text-sm font-bold text-foreground">G_eq(s)</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Main TF result — exact polynomial form */}
        <div className="result-display rounded-lg p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Exact G_eq(s) — Polynomial Arithmetic Result
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="text-sm font-mono text-primary font-medium leading-relaxed break-all">
              {result.display.num}
            </div>
            <div className="h-px w-full bg-primary/40" />
            <div className="text-sm font-mono text-foreground/80 leading-relaxed break-all">
              {result.display.den}
            </div>
          </div>
        </div>

        {/* Formula identity */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Identity Applied</div>
          <div className="eq-display rounded px-3 py-2 text-xs font-mono text-accent leading-relaxed break-all">
            {result.formula}
          </div>
        </div>

        {/* Characteristic equation */}
        <div className="bg-secondary/50 rounded px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Characteristic Equation</div>
          <div className="text-xs font-mono text-warning break-all">{result.charEq}</div>
        </div>

        {/* Poles & Zeros */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Closed-Loop Poles</div>
            {result.poles.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">None</div>
            ) : result.poles.map((p, i) => (
              <div key={i} className={cn("text-xs font-mono", isNaN(p.re) ? "text-muted-foreground" : p.re > 1e-8 ? "text-destructive" : "text-foreground/90")}>
                s = {isNaN(p.re) ? `solve: ${result.charEq}` : `${p.re > 0 ? "+" : ""}${p.re.toFixed(4)}${Math.abs(p.im) > 1e-10 ? ` ± j${Math.abs(p.im).toFixed(4)}` : ""}`}
              </div>
            ))}
          </div>
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Zeros</div>
            {result.zeros.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">None</div>
            ) : result.zeros.map((z, i) => (
              <div key={i} className="text-xs font-mono text-foreground/90">
                s = {isNaN(z.re) ? "?" : `${z.re.toFixed(4)}${Math.abs(z.im) > 1e-10 ? ` ± j${Math.abs(z.im).toFixed(4)}` : ""}`}
              </div>
            ))}
          </div>
        </div>

        {/* Stability Margins */}
        {margins && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary/50 rounded px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gain Margin</div>
              <div className={cn(
                "text-sm font-mono font-bold",
                margins.gainMarginDb === Infinity ? "text-success" :
                margins.gainMarginDb > 0 ? "text-success" : "text-destructive"
              )}>
                {margins.gainMarginDb === Infinity ? "∞ dB" : `${margins.gainMarginDb.toFixed(2)} dB`}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                {margins.phaseCrossoverFreq !== null
                  ? `ω_pc = ${margins.phaseCrossoverFreq.toFixed(3)} rad/s`
                  : "No phase crossover"}
              </div>
            </div>
            <div className="bg-secondary/50 rounded px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Phase Margin</div>
              <div className={cn(
                "text-sm font-mono font-bold",
                margins.phaseMarginDeg === Infinity ? "text-success" :
                margins.phaseMarginDeg > 0 ? "text-success" : "text-destructive"
              )}>
                {margins.phaseMarginDeg === Infinity ? "∞°" : `${margins.phaseMarginDeg.toFixed(2)}°`}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
                {margins.gainCrossoverFreq !== null
                  ? `ω_gc = ${margins.gainCrossoverFreq.toFixed(3)} rad/s`
                  : "No gain crossover"}
              </div>
            </div>
          </div>
        )}

        <div>
          <button
            onClick={() => setShowDerivation(!showDerivation)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider py-1 border-t border-border pt-3"
          >
            <span>Step-by-Step Algebraic Derivation</span>
            <span>{showDerivation ? "▲" : "▼"}</span>
          </button>
          {showDerivation && (
            <ol className="mt-2 space-y-1.5">
              {result.derivation.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground font-mono flex-shrink-0 w-4">{i + 1}.</span>
                  <span className={cn(
                    "font-mono leading-relaxed break-all",
                    step.includes("⚠️") || step.includes("❌") ? "text-warning" :
                    step.includes("🔑") ? "text-accent" :
                    step === "" ? "hidden" :
                    "text-foreground/85"
                  )}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Numeric presets (use parseable polynomial strings) ───────────────────────
const PRESETS: Preset[] = [
  {
    label: "First-Order Unity Feedback",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "1", den: "s + 1" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Second-Order (ωn=2, ζ=0.5)",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "4", den: "s^2 + 2s" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Double Integrator w/ Feedback",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "1", den: "s^2" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Series: Two First-Order Plants",
    connection: "series" as ConnectionMode,
    blocks: [
      { id: "g1", label: "G₁", num: "1", den: "s + 1" },
      { id: "g2", label: "G₂", num: "2", den: "s + 2" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Tachometer Feedback",
    connection: "feedback_negative" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "10", den: "s^2 + s" }],
    feedbackBlock: { id: "h1", label: "H", num: "2s", den: "1" },
  },
  {
    label: "Parallel: Proportional + Integral",
    connection: "parallel" as ConnectionMode,
    blocks: [
      { id: "g1", label: "P", num: "2", den: "1" },
      { id: "g2", label: "I", num: "1", den: "s" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "PD Controller Identity",
    category: "Controller",
    goal: "Combine derivative and proportional action before checking noise tradeoffs.",
    connection: "parallel",
    blocks: [
      { id: "g1", label: "P", num: "3", den: "1" },
      { id: "g2", label: "D", num: "0.4s", den: "1" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "PID Controller Identity",
    category: "Controller",
    goal: "Build C(s) from P, I, and D terms for analysis in the plot studio.",
    connection: "parallel",
    blocks: [
      { id: "g1", label: "P", num: "2", den: "1" },
      { id: "g2", label: "I", num: "1", den: "s" },
      { id: "g3", label: "D", num: "0.25s", den: "1" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Lead Compensator Starter",
    category: "Controller",
    goal: "Add phase with a controller zero closer to the origin than its pole.",
    connection: "series",
    blocks: [
      { id: "g1", label: "Clead", num: "s + 1", den: "s + 5" },
      { id: "g2", label: "G", num: "10", den: "s^2 + 3s + 2" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Lag Compensator Starter",
    category: "Controller",
    goal: "Raise low-frequency loop gain while keeping dominant dynamics similar.",
    connection: "series",
    blocks: [
      { id: "g1", label: "Clag", num: "s + 2", den: "s + 0.2" },
      { id: "g2", label: "G", num: "4", den: "s^2 + 2.4s + 4" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Positive Feedback Warning",
    category: "Stability",
    goal: "See why positive feedback needs immediate stability checks.",
    connection: "feedback_positive",
    blocks: [{ id: "g1", label: "G", num: "4", den: "s^2 + 2s + 2" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Index() {
  const [connectionType, setConnectionType] = useState<ConnectionMode>("series");
  const [blocks, setBlocks] = useState<BlockState[]>(DEFAULT_BLOCKS);
  const [feedbackBlock, setFeedbackBlock] = useState<BlockState>(DEFAULT_FEEDBACK);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AppTab>("builder");
  const [showPresets, setShowPresets] = useState(false);
  const [projectStatus, setProjectStatus] = useState<string>("");
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const sharedProjectLoadedRef = useRef(false);

  const needsFeedback = connectionType === "feedback_negative" || connectionType === "feedback_positive";
  const needsMultiBlock = connectionType === "series" || connectionType === "parallel";
  const selectedConnection = CONNECTION_OPTIONS.find((option) => option.value === connectionType) ?? CONNECTION_OPTIONS[0];
  const roboticsGithubCount = ROBOTICS_RESOURCES.filter((resource) => resource.access === "github").length;
  const roboticsSourceCount = new Set(ROBOTICS_RESOURCES.map((resource) => resource.sourceSection)).size;

  const createProjectSnapshot = useCallback((): SavedProjectV1 => ({
    version: 1,
    savedAt: new Date().toISOString(),
    app: "block-diagram-simplifier",
    connectionType,
    blocks: blocks.map((block) => ({ ...block })),
    feedbackBlock: { ...feedbackBlock },
  }), [blocks, connectionType, feedbackBlock]);

  const applyProjectSnapshot = useCallback((project: SavedProjectV1, source: string) => {
    setConnectionType(project.connectionType);
    setBlocks(project.blocks.map((block) => ({ ...block })));
    setFeedbackBlock({ ...project.feedbackBlock });
    setResult(null);
    setError("");
    setShowPresets(false);
    setActiveTab("builder");
    setProjectStatus(`${source} loaded.`);
  }, []);

  useEffect(() => {
    if (sharedProjectLoadedRef.current) return;
    sharedProjectLoadedRef.current = true;

    const encodedProject = new URLSearchParams(window.location.search).get(PROJECT_QUERY_PARAM);
    if (!encodedProject) return;

    try {
      applyProjectSnapshot(decodeProjectSnapshot(encodedProject), "Shared project");
    } catch (e: unknown) {
      setProjectStatus(e instanceof Error ? e.message : "Shared project could not be loaded.");
    }
  }, [applyProjectSnapshot]);

  const handleCalculate = useCallback(() => {
    try {
      setError("");
      for (const b of blocks) {
        if (!b.num.trim() || !b.den.trim()) {
          throw new Error(`Block ${b.label}: numerator and denominator cannot be empty.`);
        }
      }
      if (needsFeedback && !feedbackBlock.num.trim()) {
        throw new Error("Feedback block H(s): numerator cannot be empty.");
      }

      const activeBlocks = needsFeedback || connectionType === "unity_feedback"
        ? [blocks[0]] : blocks;

      const res = solve(
        connectionType,
        activeBlocks.map(b => ({ id: b.id, label: b.label, numStr: b.num, denStr: b.den })),
        needsFeedback
          ? { id: feedbackBlock.id, label: feedbackBlock.label, numStr: feedbackBlock.num, denStr: feedbackBlock.den }
          : undefined
      );
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Calculation error");
      setResult(null);
    }
  }, [connectionType, blocks, feedbackBlock, needsFeedback]);

  const handleSaveProject = useCallback(() => {
    const snapshot = createProjectSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `block-simplifier-project-${snapshot.savedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setProjectStatus("Project JSON saved.");
  }, [createProjectSnapshot]);

  const handleLoadProjectFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      applyProjectSnapshot(validateProjectPayload(JSON.parse(text)), file.name);
    } catch (e: unknown) {
      setProjectStatus(e instanceof Error ? e.message : "Project file could not be loaded.");
    } finally {
      event.target.value = "";
    }
  }, [applyProjectSnapshot]);

  const handleCopyShareLink = useCallback(async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(PROJECT_QUERY_PARAM, encodeProjectSnapshot(createProjectSnapshot()));
      window.history.replaceState(null, "", url);
      const copied = await copyTextToClipboard(url.toString());
      setProjectStatus(copied ? "Share link copied." : "Share link ready in the address bar.");
    } catch (e: unknown) {
      setProjectStatus(e instanceof Error ? e.message : "Share link could not be created.");
    }
  }, [createProjectSnapshot]);

  const addBlock = () => {
    const n = blocks.length + 1;
    setBlocks([...blocks, { id: `g${n}`, label: `G${n}`, num: "1", den: "s + 1" }]);
  };

  const removeBlock = (id: string) => {
    if (blocks.length <= 2) return;
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, num: string, den: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, num, den } : b));
  };

  const applyPreset = (preset: Preset) => {
    setConnectionType(preset.connection);
    setBlocks(preset.blocks.map((block) => ({ ...block })));
    setFeedbackBlock({ ...preset.feedbackBlock });
    setResult(null);
    setError("");
    setShowPresets(false);
    setProjectStatus(`${preset.label} loaded.`);
  };

  // Convert BlockState to BlockConfig for BlockDiagram
  const diagramBlocks = (needsFeedback || connectionType === "unity_feedback" ? [blocks[0]] : blocks)
    .map(b => ({ id: b.id, label: b.label, tf: { num: b.num, den: b.den } }));
  const diagramFeedback = needsFeedback
    ? { id: feedbackBlock.id, label: feedbackBlock.label, tf: { num: feedbackBlock.num, den: feedbackBlock.den } }
    : undefined;

  const TAB_LABELS: { id: AppTab; icon: typeof Calculator; label: string }[] = [
    { id: "builder", icon: Network, label: "Builder" },
    { id: "statespace", icon: Sigma, label: "State-Space" },
    { id: "library", icon: Library, label: "Library" },
    { id: "robotics", icon: Bot, label: "Robotics" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Nav */}
      <header className="border-b border-border bg-card/95 px-4 py-3 sm:px-6 flex flex-col gap-3 flex-shrink-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
            <Network className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-wide">
              Block Diagram Simplifier
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Exact polynomial arithmetic, visual reduction, and ME 484 course checks.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground sm:flex sm:items-center">
          <span className="rounded border border-border bg-secondary/35 px-2 py-1">Live solver</span>
          <span className="rounded border border-border bg-secondary/35 px-2 py-1">Course checks</span>
          <span className="rounded border border-border bg-secondary/35 px-2 py-1">Library coverage</span>
          <span className="rounded border border-border bg-secondary/35 px-2 py-1">Robotics links</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Left Panel */}
        <div className="w-full max-h-[68vh] flex-shrink-0 border-b border-border bg-card flex flex-col lg:max-h-none lg:w-[22rem] lg:border-b-0 lg:border-r xl:w-96">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {TAB_LABELS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 py-2.5 text-[10px] font-semibold tracking-wide uppercase transition-all",
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="mx-auto mb-1 h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Builder Tab */}
          {activeTab === "builder" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <WorkflowGuide activeTab={activeTab} />

              {/* Project tools */}
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Network className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Project
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{blocks.length} block{blocks.length === 1 ? "" : "s"}</span>
                </div>
                <input
                  ref={projectFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleLoadProjectFile}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={handleSaveProject}
                    className="flex items-center justify-center gap-1.5 rounded border border-border bg-background/35 px-2 py-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    title="Save project JSON"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    onClick={() => projectFileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded border border-border bg-background/35 px-2 py-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    title="Load project JSON"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Load
                  </button>
                  <button
                    onClick={handleCopyShareLink}
                    className="flex items-center justify-center gap-1.5 rounded border border-border bg-background/35 px-2 py-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    title="Copy share link"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </button>
                </div>
                {projectStatus && (
                  <div className="mt-2 rounded border border-primary/20 bg-primary/5 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
                    {projectStatus}
                  </div>
                )}
              </div>

              {/* Presets */}
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PlayCircle className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Start With An Example
                    </span>
                  </div>
                  <button
                    onClick={() => setShowPresets(!showPresets)}
                    className="text-[10px] font-semibold text-primary hover:text-accent"
                  >
                    {showPresets ? "Show less" : "More"}
                  </button>
                </div>
                <div className="grid gap-1.5">
                  {(showPresets ? PRESETS : PRESETS.slice(0, 3)).map((p, i) => (
                    <button
                      key={i}
                      onClick={() => applyPreset(p)}
                      className="group w-full rounded border border-border bg-background/35 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground group-hover:text-primary">{p.label}</span>
                        <span className="flex-shrink-0 rounded border border-border bg-secondary/35 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                          {p.category ?? CONNECTION_OPTIONS.find((option) => option.value === p.connection)?.label.split(" ")[0] ?? "Example"}
                        </span>
                      </div>
                      {p.goal && (
                        <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                          {p.goal}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection type */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">
                  Connection Type
                </label>
                <div className="space-y-1.5">
                  {CONNECTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setConnectionType(opt.value);
                        setResult(null);
                        setError("");
                        if ((opt.value === "feedback_negative" || opt.value === "feedback_positive" || opt.value === "unity_feedback") && blocks.length > 1) {
                          setBlocks([blocks[0]]);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded border text-left transition-all",
                        connectionType === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground"
                      )}
                    >
                      <span className="w-9 flex-shrink-0 rounded border border-border bg-background/40 px-1.5 py-1 text-center text-[10px] font-mono text-primary">
                        {opt.icon}
                      </span>
                      <div>
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <ModeCoach option={selectedConnection} />
                </div>
              </div>

              {/* Forward path blocks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {needsFeedback || connectionType === "unity_feedback" ? "Forward Path G(s)" : "Transfer Function Blocks"}
                  </label>
                  {needsMultiBlock && (
                    <button
                      onClick={addBlock}
                      className="text-[10px] text-primary hover:text-accent font-mono px-2 py-0.5 rounded border border-primary/30 hover:border-accent/50 transition-all"
                    >
                      + Add Block
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(needsFeedback || connectionType === "unity_feedback" ? [blocks[0]] : blocks).map(block => (
                    <div key={block.id} className="relative">
                      <TFInput
                        label={`${block.label}(s)`}
                        num={block.num}
                        den={block.den}
                        onChange={(num, den) => updateBlock(block.id, num, den)}
                        hint="e.g. num: 1  den: s+1  →  G(s)=1/(s+1)"
                      />
                      {needsMultiBlock && blocks.length > 2 && (
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="absolute top-2 right-2 text-[10px] text-muted-foreground hover:text-destructive"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback block */}
              {needsFeedback && (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">
                    Feedback Path H(s)
                  </label>
                  <TFInput
                    label="H(s)"
                    num={feedbackBlock.num}
                    den={feedbackBlock.den}
                    onChange={(num, den) => setFeedbackBlock({ ...feedbackBlock, num, den })}
                  />
                </div>
              )}

              {connectionType === "unity_feedback" && (
                <div className="eq-display rounded px-3 py-2 text-[10px] font-mono text-muted-foreground">
                  Unity feedback: H(s) = 1 · Uses exact N_G / (D_G + N_G) identity
                </div>
              )}

              {/* Info banner */}
              <div className="eq-display rounded px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Polynomial Solver</div>
                <div className="text-[10px] font-mono text-muted-foreground leading-snug">
                  Coefficients are parsed into exact number arrays · GCD cancellation · Stability via pole real parts
                </div>
              </div>

              <button
                onClick={handleCalculate}
                className="btn-glow w-full py-2.5 rounded-lg text-sm font-bold tracking-wide"
              >
                ⚡ Calculate G_eq(s)
              </button>
            </div>
          )}

          {/* State-Space Tab */}
          {activeTab === "statespace" && (
            <div className="flex-1 overflow-hidden">
              <StateSpacePanel />
            </div>
          )}

          {/* Library Tab */}
          {activeTab === "library" && (
            <div className="flex-1 overflow-hidden">
              <SanityLibrary />
            </div>
          )}

          {/* Robotics Tab */}
          {activeTab === "robotics" && (
            <div className="flex-1 overflow-hidden">
              <RoboticsResourceHub />
            </div>
          )}
        </div>

        {/* Main canvas + result */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Interactive Block Diagram Editor (builder tab) */}
          {activeTab === "builder" && (
            <div className="panel-section m-3 mb-2 h-[420px] flex flex-col overflow-hidden flex-shrink-0 sm:m-4 sm:mb-2 lg:h-[500px]">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-signal" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Block Diagram Editor
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/60 ml-auto">
                  Drag to move · ⤳ to connect · Click ✎ to edit G(s)
                </span>
              </div>
              <DiagramEditor
                onAnalyze={(res, err) => {
                  if (res) {
                    setResult(res);
                    setError("");
                  } else {
                    setResult(null);
                    setError(err);
                  }
                }}
              />
            </div>
          )}

          {/* State-space diagram placeholder */}
          {activeTab === "statespace" && (
            <div className="panel-section m-4 mb-2 flex-shrink-0">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  State-Space Representation
                </span>
              </div>
              <div className="p-4">
                <svg width="500" height="80" className="mx-auto overflow-visible" viewBox="0 0 500 80">
                  {/* u(t) → B → Σ → integrate → x(t) → C → y(t) */}
                  <text x="10" y="42" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">u(t)</text>
                  <line x1="40" y1="38" x2="70" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <rect x="70" y="24" width="40" height="28" rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
                  <text x="90" y="42" textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={10} fontFamily="monospace">B</text>
                  <line x1="110" y1="38" x2="135" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <circle cx="147" cy="38" r="12" fill="hsl(220,18%,16%)" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <text x="147" y="43" textAnchor="middle" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">Σ</text>
                  <line x1="159" y1="38" x2="185" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <rect x="185" y="24" width="50" height="28" rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
                  <text x="210" y="42" textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={10} fontFamily="monospace">∫ dt</text>
                  <line x1="235" y1="38" x2="275" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <text x="255" y="30" fill="hsl(174,80%,55%)" fontSize={9} fontFamily="monospace">x(t)</text>
                  <circle cx="275" cy="38" r="3" fill="hsl(174,80%,55%)" />
                  <rect x="285" y="24" width="40" height="28" rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
                  <text x="305" y="42" textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={10} fontFamily="monospace">C</text>
                  <line x1="325" y1="38" x2="370" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <circle cx="370" cy="38" r="12" fill="hsl(220,18%,16%)" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <text x="370" y="43" textAnchor="middle" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">Σ</text>
                  <line x1="382" y1="38" x2="420" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <polygon points="416,34 424,38 416,42" fill="hsl(174,80%,55%)" />
                  <text x="430" y="42" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">y(t)</text>
                  {/* D feedthrough */}
                  <line x1="40" y1="38" x2="40" y2="70" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
                  <line x1="40" y1="70" x2="370" y2="70" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
                  <rect x="178" y="60" width="30" height="18" rx={3} fill="hsl(220,18%,13%)" stroke="hsl(196,60%,35%)" strokeWidth={1} />
                  <text x="193" y="73" textAnchor="middle" fill="hsl(196,85%,50%)" fontSize={9} fontFamily="monospace">D</text>
                  <line x1="370" y1="70" x2="370" y2="50" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
                  {/* A feedback */}
                  <line x1="275" y1="38" x2="275" y2="10" stroke="hsl(215,15%,55%)" strokeWidth={1} strokeDasharray="3 2" />
                  <line x1="147" y1="10" x2="275" y2="10" stroke="hsl(215,15%,55%)" strokeWidth={1} strokeDasharray="3 2" />
                  <rect x="178" y="3" width="30" height="14" rx={3} fill="hsl(220,18%,13%)" stroke="hsl(215,25%,30%)" strokeWidth={1} />
                  <text x="193" y="14" textAnchor="middle" fill="hsl(215,15%,55%)" fontSize={9} fontFamily="monospace">A</text>
                  <line x1="147" y1="10" x2="147" y2="26" stroke="hsl(215,15%,55%)" strokeWidth={1} strokeDasharray="3 2" />
                </svg>
              </div>
            </div>
          )}

          {/* Result panel (builder only) */}
          {activeTab === "builder" && (
            <div className="overflow-y-auto px-3 pb-4 space-y-3 sm:px-4 lg:max-h-[50vh]">
              <ResultPanel result={result} error={error} />
              {result && <CourseInsightPanel result={result} />}
              {result && <AnalysisPlots result={result} />}
            </div>
          )}

          {/* Library full-width info */}
          {activeTab === "library" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="panel-section p-6 text-center">
                <div className="text-3xl mb-3">📚</div>
                <h3 className="text-sm font-bold text-foreground mb-2">Sanity Check Library</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Browse verified block diagram identities and ME 484 course checks in the left panel. Each card includes
                  the formula, derivation steps, notes, and the chapter or handout it came from.
                </p>
              </div>
            </div>
          )}

          {/* Robotics full-width info */}
          {activeTab === "robotics" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="panel-section p-6">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold text-foreground">Robotics Freeware and Resource Hub</h3>
                  <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">
                    The left panel maps the MathWorks robotics list into searchable project links, docs, File Exchange items,
                    and toolbox examples so the control-system tools can connect to real robotics workflows.
                  </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded border border-border bg-secondary/25 px-4 py-3 text-center">
                    <div className="text-lg font-bold text-primary">{ROBOTICS_RESOURCES.length}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Curated links</div>
                  </div>
                  <div className="rounded border border-border bg-secondary/25 px-4 py-3 text-center">
                    <div className="text-lg font-bold text-primary">{roboticsGithubCount}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">GitHub entries</div>
                  </div>
                  <div className="rounded border border-border bg-secondary/25 px-4 py-3 text-center">
                    <div className="text-lg font-bold text-primary">{roboticsSourceCount}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Source sections</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <a
                    href={AWESOME_MATLAB_ROBOTICS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-border bg-secondary/20 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-foreground">Upstream GitHub List</span>
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      Original awesome list maintained by mathworks-robotics.
                    </p>
                  </a>
                  <a
                    href={AWESOME_MATLAB_ROBOTICS_LICENSE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-border bg-secondary/20 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-foreground">License Boundary</span>
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      The app links outward and preserves source attribution instead of bundling third-party code.
                    </p>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
