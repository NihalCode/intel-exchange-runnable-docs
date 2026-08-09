"use client";

/** Lightweight SVG intelligence field — no WebGL; pauses under reduced motion via CSS. */
export function TopologyField({ className = "" }: { className?: string }) {
  return (
    <div className={`atlas-topology ${className}`} aria-hidden="true" data-testid="atlas-topology">
      <svg viewBox="0 0 800 520" className="atlas-topology__svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="atlasOrb" cx="50%" cy="48%" r="48%">
            <stop offset="0%" stopColor="rgba(127,242,218,0.22)" />
            <stop offset="45%" stopColor="rgba(40,199,170,0.08)" />
            <stop offset="100%" stopColor="rgba(7,11,13,0)" />
          </radialGradient>
          <linearGradient id="atlasTrail" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(127,242,218,0)" />
            <stop offset="50%" stopColor="rgba(127,242,218,0.45)" />
            <stop offset="100%" stopColor="rgba(169,154,232,0.15)" />
          </linearGradient>
        </defs>
        <circle cx="400" cy="250" r="210" fill="url(#atlasOrb)" className="atlas-topology__glow" />
        <ellipse
          cx="400"
          cy="250"
          rx="220"
          ry="90"
          fill="none"
          stroke="rgba(170,205,201,0.18)"
          strokeWidth="1"
          className="atlas-topology__orbit atlas-topology__orbit--a"
        />
        <ellipse
          cx="400"
          cy="250"
          rx="170"
          ry="190"
          fill="none"
          stroke="rgba(170,205,201,0.12)"
          strokeWidth="1"
          className="atlas-topology__orbit atlas-topology__orbit--b"
        />
        <ellipse
          cx="400"
          cy="250"
          rx="260"
          ry="120"
          fill="none"
          stroke="rgba(127,242,218,0.2)"
          strokeWidth="1"
          strokeDasharray="4 10"
          className="atlas-topology__orbit atlas-topology__orbit--c"
        />
        <path
          d="M120 180 C220 120, 320 140, 400 250 S580 360, 700 300"
          fill="none"
          stroke="url(#atlasTrail)"
          strokeWidth="1.25"
          className="atlas-topology__trail"
        />
        <path
          d="M160 340 C260 300, 340 280, 400 250 S520 180, 660 160"
          fill="none"
          stroke="rgba(169,154,232,0.35)"
          strokeWidth="1"
          className="atlas-topology__trail atlas-topology__trail--slow"
        />
        {[
          [400, 250, 5],
          [280, 190, 3.5],
          [520, 300, 3.5],
          [340, 320, 2.5],
          [480, 170, 2.5],
          [220, 280, 2],
          [610, 240, 2],
        ].map(([cx, cy, r], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            className={`atlas-topology__node atlas-topology__node--${i % 3}`}
            fill={i === 0 ? "#7ff2da" : i % 2 ? "#a99ae8" : "#e5b772"}
            opacity={i === 0 ? 0.95 : 0.75}
          />
        ))}
      </svg>
      <div className="atlas-topology__haze" />
    </div>
  );
}
