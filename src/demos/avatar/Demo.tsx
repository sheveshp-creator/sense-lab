import { useEffect, useMemo, useRef, useState } from 'react';
import { frameStore } from '../../core/frameStore';
import { useFrameLoop } from '../hooks';
import { AvatarSmoother, NEUTRAL_AVATAR, avatarFromFace } from './model';
import type { AvatarParams } from './model';

const SKIN = '#fcd34d';

type Manual = {
  smile: number;
  mouthOpen: number;
  blinkLeft: number;
  blinkRight: number;
  browRaise: number;
  yaw: number;
};
const SLIDERS: { key: keyof Manual; label: string; min: number; max: number; step: number }[] = [
  { key: 'smile', label: 'Smile', min: 0, max: 1, step: 0.01 },
  { key: 'mouthOpen', label: 'Mouth open', min: 0, max: 1, step: 0.01 },
  { key: 'blinkLeft', label: 'Left eye shut', min: 0, max: 1, step: 0.01 },
  { key: 'blinkRight', label: 'Right eye shut', min: 0, max: 1, step: 0.01 },
  { key: 'browRaise', label: 'Brows (down to up)', min: -1, max: 1, step: 0.01 },
  { key: 'yaw', label: 'Turn head (left to right)', min: -45, max: 45, step: 1 },
];

/**
 * Mirror Avatar: a cartoon face that copies your smile, blinks, brows, jaw and head turn. It is drawn with SVG
 * elements whose attributes are set directly each frame, so React never re-renders per frame. The sliders do the
 * same without a camera.
 */
export default function MirrorAvatar() {
  const smoother = useMemo(() => new AvatarSmoother(), []);
  const target = useRef<AvatarParams>({ ...NEUTRAL_AVATAR });
  const [manual, setManual] = useState(false);
  const [vals, setVals] = useState<Manual>({
    smile: 0,
    mouthOpen: 0,
    blinkLeft: 0,
    blinkRight: 0,
    browRaise: 0,
    yaw: 0,
  });
  const manualRef = useRef({ on: manual, vals });
  useEffect(() => {
    manualRef.current = { on: manual, vals };
  });
  const [hasFace, setHasFace] = useState(false);

  const head = useRef<SVGGElement>(null);
  const features = useRef<SVGGElement>(null);
  const eyeL = useRef<SVGGElement>(null);
  const eyeR = useRef<SVGGElement>(null);
  const browL = useRef<SVGLineElement>(null);
  const browR = useRef<SVGLineElement>(null);
  const mouth = useRef<SVGPathElement>(null);
  const jaw = useRef<SVGEllipseElement>(null);
  const shown = useRef(false);

  useFrameLoop((_now, dt) => {
    const m = manualRef.current;
    const face = frameStore.getState().faces[0];
    if (shown.current !== !!face) {
      shown.current = !!face;
      setHasFace(!!face);
    }
    if (m.on) Object.assign(target.current, NEUTRAL_AVATAR, m.vals);
    else if (face) avatarFromFace(face, target.current);
    else Object.assign(target.current, NEUTRAL_AVATAR);
    const p = smoother.update(target.current, dt);

    // Head: slides and tilts a little; the features slide further and squeeze (a cheap turn).
    head.current?.setAttribute(
      'transform',
      `translate(${(p.yaw * 0.5).toFixed(1)} ${(p.pitch * 0.5).toFixed(1)}) rotate(${p.roll.toFixed(1)})`,
    );
    const turn = Math.cos((Math.min(60, Math.abs(p.yaw)) * 0.9 * Math.PI) / 180);
    features.current?.setAttribute(
      'transform',
      `translate(${(p.yaw * 0.7).toFixed(1)} ${(p.pitch * 0.5).toFixed(1)}) scale(${turn.toFixed(3)} 1)`,
    );
    // Eyes: the lid closes by squashing the eye vertically.
    eyeL.current?.setAttribute(
      'transform',
      `translate(-27 -10) scale(1 ${Math.max(0.07, 1 - p.blinkLeft).toFixed(3)})`,
    );
    eyeR.current?.setAttribute(
      'transform',
      `translate(27 -10) scale(1 ${Math.max(0.07, 1 - p.blinkRight).toFixed(3)})`,
    );
    const by = -p.browRaise * 12;
    browL.current?.setAttribute(
      'transform',
      `translate(0 ${by.toFixed(1)}) rotate(${(p.browRaise * -6).toFixed(1)} -28 -34)`,
    );
    browR.current?.setAttribute(
      'transform',
      `translate(0 ${by.toFixed(1)}) rotate(${(p.browRaise * 6).toFixed(1)} 28 -34)`,
    );
    // Mouth: corners lift and the middle drops with a smile; the jaw ellipse opens.
    const y0 = 34 - p.smile * 9;
    const yc = 34 + p.smile * 15;
    mouth.current?.setAttribute(
      'd',
      `M -24 ${y0.toFixed(1)} Q 0 ${yc.toFixed(1)} 24 ${y0.toFixed(1)}`,
    );
    jaw.current?.setAttribute('ry', (p.mouthOpen * 20).toFixed(1));
    jaw.current?.setAttribute('rx', (13 + p.smile * 8).toFixed(1));
    jaw.current?.setAttribute('cy', (36 + p.mouthOpen * 8).toFixed(1));
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          viewBox="-100 -100 200 200"
          className="aspect-[4/3] w-full rounded-xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950"
          role="img"
          aria-label="Cartoon face copying your expression"
          data-testid="avatar"
        >
          <g ref={head}>
            <circle r={72} fill={SKIN} stroke="#b45309" strokeWidth={2} />
            <g ref={features}>
              <ellipse ref={jaw} cx={0} cy={36} rx={13} ry={0} fill="#7f1d1d" />
              <path
                ref={mouth}
                d="M -24 34 Q 0 34 24 34"
                fill="none"
                stroke="#7c2d12"
                strokeWidth={4}
                strokeLinecap="round"
              />
              <path
                d="M 0 2 q -5 14 0 16"
                fill="none"
                stroke="#b45309"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <g ref={eyeL} transform="translate(-27 -10)">
                <ellipse rx={12} ry={14} fill="#fff" stroke="#7c2d12" strokeWidth={2} />
                <circle r={5.5} fill="#111827" />
              </g>
              <g ref={eyeR} transform="translate(27 -10)">
                <ellipse rx={12} ry={14} fill="#fff" stroke="#7c2d12" strokeWidth={2} />
                <circle r={5.5} fill="#111827" />
              </g>
              <line
                ref={browL}
                x1={-40}
                y1={-34}
                x2={-16}
                y2={-34}
                stroke="#7c2d12"
                strokeWidth={5}
                strokeLinecap="round"
              />
              <line
                ref={browR}
                x1={16}
                y1={-34}
                x2={40}
                y2={-34}
                stroke="#7c2d12"
                strokeWidth={5}
                strokeLinecap="round"
              />
            </g>
          </g>
        </svg>
        {!manual && !hasFace && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-neutral-400">
            No face in view: show your face, or use the sliders.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        Control with sliders instead of the camera
      </label>
      {manual && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2" data-testid="avatar-sliders">
          {SLIDERS.map((s) => (
            <label key={s.key} className="block text-xs text-neutral-400">
              {s.label}
              <input
                type="range"
                className="mt-1 w-full"
                min={s.min}
                max={s.max}
                step={s.step}
                value={vals[s.key]}
                aria-label={s.label}
                onChange={(e) => setVals((v) => ({ ...v, [s.key]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-500">
        The cartoon's left and right are the left and right of your screen, as in a mirror. Smile,
        jaw, blinks and brows come from the 52 face blendshape scores; the turn and tilt come from
        the head pose.
      </p>
    </div>
  );
}
