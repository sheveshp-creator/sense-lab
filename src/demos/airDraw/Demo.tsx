import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { frameStore } from '../../core/frameStore';
import { ActionBar, ControlsTable } from '../ActionBar';
import { useBus, useCameraRunning, useFrameLoop } from '../hooks';
import { AIR_DRAW_ACTIONS } from './actions';
import type { AirDrawAction } from './actions';
import { AirDrawModel, ERASER_RADIUS, PALETTE } from './model';

const KEY_STEP = 0.015;

// One model for the whole session, so the drawing survives switching to another demo and back.
const model = new AirDrawModel();

/** Air Draw. Draws from the live pinch point; the mouse, touch and keyboard draw too. */
export default function AirDraw() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const kb = useRef({ x: 0.5, y: 0.5, down: false, used: false });
  const [color, setColor] = useState<string>(model.color);
  const [count, setCount] = useState(0);
  const running = useCameraRunning();

  const colour = useCallback(() => setColor(model.nextColour()), []);
  const penToggle = useCallback(() => {
    const k = kb.current;
    k.used = true;
    if (k.down) {
      model.end('keyboard');
      k.down = false;
    } else {
      model.begin('keyboard', k.x, k.y);
      k.down = true;
    }
    model.cursor.visible = true;
  }, []);
  const handlers: Record<AirDrawAction, () => void> = useMemo(
    () => ({ pen: penToggle, erase: () => model.clear(), colour, undo: () => model.undo() }),
    [penToggle, colour],
  );

  // A peace sign changes the colour. (Pinch and open palm arrive through the live hands, not as events.)
  useBus('gesture:peace', (e) => e.kind === 'start' && colour());

  // Keyboard pen: arrow keys move it, Space (the "Pen down / up" action) puts it down or lifts it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.tagName === 'INPUT' || t?.tagName === 'SELECT')
        return;
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const step = d[e.key];
      if (!step) return;
      e.preventDefault();
      const k = kb.current;
      k.used = true;
      k.x = Math.min(1, Math.max(0, k.x + step[0] * KEY_STEP));
      k.y = Math.min(1, Math.max(0, k.y + step[1] * KEY_STEP));
      model.cursor.x = k.x;
      model.cursor.y = k.y;
      model.cursor.visible = true;
      if (k.down) model.move('keyboard', k.x, k.y);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const draw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { width: w, height: h } = c;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of model.strokes) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      if (s.points.length === 1) {
        ctx.beginPath();
        ctx.arc(s.points[0]![0] * w, s.points[0]![1] * h, 3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.stroke();
    }
    if (model.eraser.visible) {
      ctx.strokeStyle = '#a3a3a3';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(model.eraser.x * w, model.eraser.y * h, ERASER_RADIUS * h, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (model.cursor.visible) {
      ctx.fillStyle = model.color;
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(model.cursor.x * w, model.cursor.y * h, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, []);

  const lastVersion = useRef(-1);
  useFrameLoop(() => {
    const s = frameStore.getState();
    model.frame(s.hands, s.aspect);
    draw();
    if (model.version !== lastVersion.current) {
      lastVersion.current = model.version;
      setCount(model.strokes.length);
    }
  });

  // Mouse, pen and touch drawing.
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    model.begin('mouse', x, y);
    model.cursor.x = x;
    model.cursor.y = y;
    model.cursor.visible = true;
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!model.isDrawing('mouse')) return;
    const [x, y] = at(e);
    model.move('mouse', x, y);
    model.cursor.x = x;
    model.cursor.y = y;
  };
  const onUp = () => model.end('mouse');

  return (
    <div className="space-y-3">
      <div className="relative">
        <canvas
          ref={canvas}
          width={800}
          height={600}
          data-testid="air-draw-canvas"
          aria-label="Drawing area. Pinch, or use the mouse, or the arrow keys with Space, to draw."
          className="aspect-[4/3] w-full touch-none cursor-crosshair rounded-xl border border-neutral-800 bg-neutral-900/60"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-neutral-950/80 px-3 py-1 text-xs text-neutral-300">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: color }}
            data-testid="air-draw-colour"
            data-colour={color}
          />
          {count} {count === 1 ? 'stroke' : 'strokes'}
        </div>
        {!running && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-neutral-400">
            Camera off: draw with the mouse, or arrow keys and Space.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        Colours:
        {PALETTE.map((c) => (
          <span
            key={c}
            className={`h-4 w-4 rounded-full ring-2 transition ${c === color ? 'ring-white' : 'ring-transparent'}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <ActionBar actions={AIR_DRAW_ACTIONS} handlers={handlers} />
      <ControlsTable actions={AIR_DRAW_ACTIONS} />
      <p className="text-xs text-neutral-500">
        Arrow keys move the pen; Space puts it down and lifts it.
      </p>
    </div>
  );
}
