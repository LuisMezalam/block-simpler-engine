import React from "react";
import { ConnectionType, BlockConfig } from "@/lib/transferFunctions";
import { cn } from "@/lib/utils";

type DiagramProps = {
  connectionType: ConnectionType | "unity_feedback";
  blocks: BlockConfig[];
  feedbackBlock?: BlockConfig;
};

// Arrow component
const Arrow = ({ label }: { label?: string }) => (
  <div className="flex items-center gap-0">
    {label && <span className="text-[10px] font-mono text-signal px-1">{label}</span>}
    <div className="flex items-center">
      <div className="h-px w-8 bg-signal" />
      <div
        className="border-l-[6px] border-l-signal border-y-4 border-y-transparent"
        style={{ width: 0, height: 0 }}
      />
    </div>
  </div>
);

// Block box
const TFBlock = ({ label, tf }: { label: string; tf: string }) => (
  <div className="tf-block rounded px-3 py-2 min-w-[80px] text-center">
    <div className="text-[10px] font-mono text-muted-foreground">{label}</div>
    <div className="text-xs font-mono text-primary font-medium mt-0.5">{tf}</div>
  </div>
);

// Summing junction circle
const SumJunction = ({ signs }: { signs: [string, string] }) => (
  <div className="relative flex items-center justify-center">
    <div className="w-7 h-7 rounded-full border-2 border-signal bg-junction flex items-center justify-center">
      <span className="text-[9px] font-mono text-signal">⊕</span>
    </div>
    {/* Top/bottom sign labels */}
    <span className="absolute -bottom-4 text-[9px] font-mono text-muted-foreground">{signs[1]}</span>
  </div>
);

export function BlockDiagram({ connectionType, blocks, feedbackBlock }: DiagramProps) {
  return (
    <div className="w-full overflow-x-auto py-4">
      {connectionType === "series" && (
        <SeriesDiagram blocks={blocks} />
      )}
      {connectionType === "parallel" && (
        <ParallelDiagram blocks={blocks} />
      )}
      {(connectionType === "feedback_negative" || connectionType === "unity_feedback") && (
        <FeedbackDiagram
          forwardBlock={blocks[0]}
          feedbackBlock={feedbackBlock}
          isUnity={connectionType === "unity_feedback"}
          isPositive={false}
        />
      )}
      {connectionType === "feedback_positive" && (
        <FeedbackDiagram
          forwardBlock={blocks[0]}
          feedbackBlock={feedbackBlock}
          isUnity={false}
          isPositive={true}
        />
      )}
    </div>
  );
}

function SeriesDiagram({ blocks }: { blocks: BlockConfig[] }) {
  return (
    <div className="flex items-center justify-center gap-0 min-w-max mx-auto">
      <Arrow label="U(s)" />
      {blocks.map((block, i) => (
        <React.Fragment key={block.id}>
          <TFBlock label={block.label} tf={block.tf.num + " / " + block.tf.den} />
          {i < blocks.length - 1 && <Arrow />}
        </React.Fragment>
      ))}
      <Arrow label="C(s)" />
    </div>
  );
}

function ParallelDiagram({ blocks }: { blocks: BlockConfig[] }) {
  return (
    <div className="flex items-center justify-center min-w-max mx-auto">
      {/* Input */}
      <div className="flex items-center">
        <Arrow label="U(s)" />
        {/* Pick-off point */}
        <div className="relative flex flex-col items-center">
          <div className="w-2 h-2 rounded-full bg-signal" />
          {/* Vertical lines for branching */}
          <svg
            width={Math.max(blocks.length * 100, 200)}
            height={blocks.length * 64 + 20}
            className="overflow-visible"
          >
            {blocks.map((block, i) => {
              const yOffset = (i - (blocks.length - 1) / 2) * 64;
              const blockW = 80;
              const totalW = Math.max(blocks.length * 100, 200);
              const cx = totalW / 2;
              return (
                <g key={block.id}>
                  {/* Horizontal line to block */}
                  <line x1={0} y1={0} x2={cx - blockW / 2} y2={yOffset + 24} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  {/* Block rect */}
                  <rect
                    x={cx - blockW / 2}
                    y={yOffset + 12}
                    width={blockW}
                    height={28}
                    rx={4}
                    fill="hsl(220,18%,13%)"
                    stroke="hsl(174,60%,35%)"
                    strokeWidth={1.5}
                  />
                  <text x={cx} y={yOffset + 22} textAnchor="middle" className="font-mono" fill="hsl(215,15%,55%)" fontSize={8}>
                    {block.label}
                  </text>
                  <text x={cx} y={yOffset + 35} textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={9} fontFamily="monospace" fontWeight="500">
                    {block.tf.num}/{block.tf.den}
                  </text>
                  {/* Line from block to summing junction */}
                  <line x1={cx + blockW / 2} y1={yOffset + 24} x2={totalW} y2={0} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                </g>
              );
            })}
          </svg>
        </div>
        {/* Summing junction */}
        <div className="flex flex-col items-center justify-center w-8 h-8 rounded-full border-2 border-signal bg-junction">
          <span className="text-[9px] font-mono text-signal">⊕</span>
        </div>
        <Arrow label="C(s)" />
      </div>
    </div>
  );
}

function FeedbackDiagram({
  forwardBlock,
  feedbackBlock,
  isUnity,
  isPositive,
}: {
  forwardBlock: BlockConfig;
  feedbackBlock?: BlockConfig;
  isUnity: boolean;
  isPositive: boolean;
}) {
  const sign = isPositive ? "+" : "−";
  const feedbackLabel = isUnity ? "H(s) = 1" : feedbackBlock?.label || "H";
  const feedbackTf = isUnity ? "1" : `${feedbackBlock?.tf.num} / ${feedbackBlock?.tf.den}`;

  return (
    <svg width="520" height="140" className="mx-auto overflow-visible" viewBox="0 0 520 140">
      {/* Reference input arrow */}
      <line x1={0} y1={55} x2={50} y2={55} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      <polygon points="50,51 58,55 50,59" fill="hsl(174,80%,55%)" />
      <text x={10} y={48} fill="hsl(174,80%,55%)" fontSize={10} fontFamily="monospace">R(s)</text>

      {/* Summing junction */}
      <circle cx={70} cy={55} r={14} fill="hsl(220,18%,16%)" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      <text x={70} y={59} textAnchor="middle" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">⊕</text>
      {/* Junction sign (top = +R) */}
      <text x={56} y={46} fill="hsl(174,80%,55%)" fontSize={9} fontFamily="monospace">+</text>
      {/* Bottom sign (feedback) */}
      <text x={62} y={74} fill={isPositive ? "hsl(38,95%,65%)" : "hsl(0,75%,65%)"} fontSize={9} fontFamily="monospace">{sign}</text>

      {/* Line from junction to G block */}
      <line x1={84} y1={55} x2={130} y2={55} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      <polygon points="130,51 138,55 130,59" fill="hsl(174,80%,55%)" />

      {/* Forward block G(s) */}
      <rect x={138} y={35} width={110} height={40} rx={5} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
      <text x={193} y={52} textAnchor="middle" fill="hsl(215,15%,55%)" fontSize={9} fontFamily="monospace">{forwardBlock.label}</text>
      <text x={193} y={67} textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={9} fontFamily="monospace" fontWeight="500">
        {forwardBlock.tf.num}/{forwardBlock.tf.den}
      </text>

      {/* Line from G to output pick-off */}
      <line x1={248} y1={55} x2={390} y2={55} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      {/* Pick-off point */}
      <circle cx={370} cy={55} r={3} fill="hsl(174,80%,55%)" />

      {/* Output arrow */}
      <polygon points="405,51 415,55 405,59" fill="hsl(174,80%,55%)" />
      <line x1={415} y1={55} x2={465} y2={55} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      <text x={430} y={48} fill="hsl(174,80%,55%)" fontSize={10} fontFamily="monospace">C(s)</text>

      {/* Feedback path (down from pick-off, left, up to junction) */}
      {/* Vertical down */}
      <line x1={370} y1={55} x2={370} y2={110} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      {/* Horizontal left */}
      <line x1={70} y1={110} x2={370} y2={110} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      {/* Vertical up to junction */}
      <line x1={70} y1={69} x2={70} y2={110} stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
      <polygon points="66,69 70,61 74,69" fill="hsl(174,80%,55%)" />

      {/* Feedback block H(s) */}
      {!isUnity ? (
        <>
          <rect x={175} y={90} width={110} height={38} rx={5} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
          <text x={230} y={107} textAnchor="middle" fill="hsl(215,15%,55%)" fontSize={9} fontFamily="monospace">{feedbackLabel}</text>
          <text x={230} y={122} textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={9} fontFamily="monospace" fontWeight="500">
            {feedbackTf}
          </text>
        </>
      ) : (
        <>
          <rect x={185} y={96} width={90} height={26} rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} strokeDasharray="4 2" />
          <text x={230} y={114} textAnchor="middle" fill="hsl(215,15%,55%)" fontSize={9} fontFamily="monospace">H(s) = 1</text>
        </>
      )}
    </svg>
  );
}
