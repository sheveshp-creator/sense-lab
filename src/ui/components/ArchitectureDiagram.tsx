/**
 * The architecture as an SVG: what runs where and what crosses the boundary between the worker and the page.
 * Data-driven (boxes and arrows are tables), so the diagram can be edited without redrawing it.
 */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
}

const W = 900;
const H = 470;

const SOLO: Box[] = [
  { x: 22, y: 206, w: 92, h: 64, title: 'Camera', sub: '640 × 480' },
  { x: 140, y: 206, w: 156, h: 64, title: 'Frame loop', sub: 'requestVideoFrameCallback' },
];
const WORKER: Box[] = [
  { x: 382, y: 92, w: 196, h: 56, title: 'FaceLandmarker', sub: '478 landmarks · 52 blendshapes' },
  { x: 382, y: 162, w: 196, h: 56, title: 'HandLandmarker', sub: '2 hands · 21 landmarks each' },
  {
    x: 382,
    y: 232,
    w: 196,
    h: 56,
    title: 'GestureRecognizer',
    sub: 'cross-check, every 8th frame',
  },
  { x: 382, y: 302, w: 196, h: 56, title: 'Face embedding (ONNX)', sub: 'SFace · WebGPU or WASM' },
];
const MAIN: Box[] = [
  { x: 676, y: 92, w: 190, h: 50, title: 'Trackers', sub: 'stable IDs · One-Euro filter' },
  {
    x: 676,
    y: 154,
    w: 190,
    h: 50,
    title: 'Recognisers',
    sub: 'gestures · expression · blinks · gaze',
  },
  { x: 676, y: 216, w: 190, h: 50, title: 'Event bus + store', sub: 'typed events · Zustand' },
];
const CONSUMERS: Box[] = [
  { x: 676, y: 304, w: 58, h: 44, title: 'Canvas' },
  { x: 741, y: 304, w: 58, h: 44, title: 'Panels' },
  { x: 806, y: 304, w: 60, h: 44, title: 'Demos' },
];
const DB: Box = {
  x: 676,
  y: 366,
  w: 190,
  h: 50,
  title: 'IndexedDB',
  sub: 'names + embeddings only',
};

const Rect = ({ b, tone = 'box' }: { b: Box; tone?: 'box' | 'accent' }) => (
  <g>
    <rect
      x={b.x}
      y={b.y}
      width={b.w}
      height={b.h}
      rx={3}
      fill="var(--surface-2)"
      stroke={tone === 'accent' ? 'var(--color-accent)' : 'var(--grid)'}
      strokeWidth={tone === 'accent' ? 1.5 : 1}
    />
    <text
      x={b.x + b.w / 2}
      y={b.y + (b.sub ? b.h / 2 - 3 : b.h / 2 + 4)}
      textAnchor="middle"
      fontSize={13}
      fontWeight={600}
      fill="var(--text-primary)"
    >
      {b.title}
    </text>
    {b.sub && (
      <text
        x={b.x + b.w / 2}
        y={b.y + b.h / 2 + 13}
        textAnchor="middle"
        fontSize={10}
        fill="var(--text-secondary)"
      >
        {b.sub}
      </text>
    )}
  </g>
);

const Arrow = ({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) => (
  <g>
    <path
      d={d}
      fill="none"
      stroke="var(--text-secondary)"
      strokeWidth={1.5}
      markerEnd="url(#arrow)"
    />
    {label && (
      <text x={lx} y={ly} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
        {label}
      </text>
    )}
  </g>
);

export function ArchitectureDiagram() {
  return (
    <figure className="viz-root space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-sm"
        role="img"
        aria-labelledby="arch-title"
        aria-describedby="arch-desc"
        data-testid="architecture-diagram"
      >
        <title id="arch-title">SenseLab architecture</title>
        <desc id="arch-desc">
          Camera frames go to a frame loop, which sends each frame as an ImageBitmap to a Web Worker
          running the face, hand, gesture and face-embedding models. The worker returns numbers
          only. On the main thread, trackers, recognisers, an event bus and a store feed the canvas
          overlay, the panels and the demos. Only names and embeddings are saved, in IndexedDB. All
          of it stays inside the browser tab.
        </desc>
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-secondary)" />
          </marker>
        </defs>
        <rect width={W} height={H} rx={3} fill="var(--surface-1)" />
        {/* The browser tab: nothing leaves it. */}
        <rect
          x={8}
          y={8}
          width={W - 16}
          height={H - 16}
          rx={3}
          fill="none"
          stroke="var(--text-muted)"
          strokeDasharray="5 5"
        />
        <text x={22} y={32} fontSize={11} fill="var(--text-secondary)">
          Everything below runs inside your browser tab. Nothing is uploaded.
        </text>

        {SOLO.map((b) => (
          <Rect key={b.title} b={b} />
        ))}
        <Arrow d="M 114 238 L 138 238" />
        <Arrow d="M 294 238 L 378 238" label="ImageBitmap" lx={336} ly={228} />
        <text x={337} y={256} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          transferred,
        </text>
        <text x={337} y={267} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          not copied
        </text>

        {/* Worker */}
        <rect
          x={362}
          y={52}
          width={236}
          height={344}
          rx={3}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
        />
        <text x={380} y={74} fontSize={13} fontWeight={700} fill="var(--text-primary)">
          Web Worker
        </text>
        <text x={470} y={74} fontSize={10} fill="var(--text-secondary)">
          inference, off the page
        </text>
        {WORKER.map((b) => (
          <Rect key={b.title} b={b} tone="accent" />
        ))}
        <text x={480} y={384} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          reads each frame once, then releases it
        </text>

        <Arrow d="M 598 238 L 672 238" label="numbers only" lx={635} ly={228} />
        <text x={635} y={256} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          Float32Array
        </text>

        {/* Main thread */}
        <rect
          x={656}
          y={52}
          width={230}
          height={380}
          rx={3}
          fill="none"
          stroke="var(--grid)"
          strokeWidth={1.5}
        />
        <text x={674} y={74} fontSize={13} fontWeight={700} fill="var(--text-primary)">
          Main thread
        </text>
        {MAIN.map((b) => (
          <Rect key={b.title} b={b} />
        ))}
        <Arrow d="M 771 142 L 771 152" />
        <Arrow d="M 771 204 L 771 214" />
        {CONSUMERS.map((b) => (
          <Rect key={b.title} b={b} />
        ))}
        <Arrow d="M 771 266 L 705 302" />
        <Arrow d="M 771 266 L 770 302" />
        <Arrow d="M 771 266 L 836 302" />
        <Rect b={DB} />
        <Arrow d="M 866 179 L 876 179 L 876 391 L 868 391" />
        <text x={771} y={362} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          draw · render · react
        </text>
      </svg>
    </figure>
  );
}
