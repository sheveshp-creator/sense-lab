import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { frameStore } from '../../core/frameStore';
import {
  SWIPE_CONFIGS,
  SWIPE_LEVELS,
  setSwipeSensitivity,
  swipeTuning,
} from '../../features/hand/dynamic/swipeSensitivity';
import type { SwipeSensitivity } from '../../features/hand/dynamic/swipeSensitivity';
import { ActionBar, ControlsTable } from '../ActionBar';
import { useBus, useCameraRunning, useFrameLoop } from '../hooks';
import { SwipeMeter } from './meter';
import { SLIDE_ACTIONS } from './actions';
import type { SlideAction } from './actions';
import { SlideModel } from './model';

/** Hand status and a swipe meter: says whether the hand is seen and how close each swipe came. */
function SwipeHelper() {
  const running = useCameraRunning();
  const meter = useMemo(() => new SwipeMeter(), []);
  const distBar = useRef<HTMLDivElement>(null);
  const speedBar = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<SwipeSensitivity>(swipeTuning.level);
  const [status, setStatus] = useState({ hand: '', dist: 0, speed: 0 });

  // The bars move every frame, so they are written straight to the DOM: no React render per frame.
  useFrameLoop((now) => {
    const h = frameStore.getState().hands[0];
    if (h && h.palmLen > 0) meter.push(now, h.palmX, h.palmLen);
    else meter.clear();
    const r = meter.read(now, SWIPE_CONFIGS[swipeTuning.level]);
    if (distBar.current) distBar.current.style.width = `${Math.min(100, r.distance * 100)}%`;
    if (speedBar.current) speedBar.current.style.width = `${Math.min(100, r.speed * 100)}%`;
  });

  // The words and the best-attempt numbers change a few times a second at most.
  useEffect(() => {
    const id = setInterval(() => {
      const h = frameStore.getState().hands[0];
      setStatus({
        hand: h ? `${h.hand} hand seen` : '',
        dist: Math.round(meter.peak.distance * 100),
        speed: Math.round(meter.peak.speed * 100),
      });
    }, 250);
    return () => clearInterval(id);
  }, [meter]);

  const bar = (label: string, ref: React.RefObject<HTMLDivElement | null>, id: string) => (
    <div className="flex items-center gap-2 text-xs text-neutral-400">
      <span className="w-20">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
        <div ref={ref} data-testid={id} className="h-full w-0 rounded-full bg-accent" />
      </div>
    </div>
  );

  return (
    <div
      className="space-y-2 rounded-sm border border-neutral-800 bg-neutral-900/50 p-3"
      data-testid="swipe-helper"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span data-testid="swipe-hand" className={status.hand ? 'text-ok' : 'text-accent'}>
          {!running
            ? 'Camera is off: use the buttons or keys'
            : status.hand || 'No hand seen: show an open hand, about an arm’s length away'}
        </span>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          Swipe sensitivity
          <select
            data-testid="swipe-sensitivity"
            className="rounded bg-neutral-800 px-2 py-1 text-neutral-100"
            value={level}
            onChange={(e) => {
              const v = e.target.value as SwipeSensitivity;
              setSwipeSensitivity(v);
              setLevel(v);
            }}
          >
            {SWIPE_LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bar('Sideways', distBar, 'swipe-bar-distance')}
      {bar('Speed', speedBar, 'swipe-bar-speed')}
      <p className="text-xs text-neutral-500" data-testid="swipe-peak">
        Both bars must fill to swipe. Best recent attempt: sideways {status.dist}%, speed{' '}
        {status.speed}%.
      </p>
    </div>
  );
}

/** Slide Remote: swipe left for the next slide, swipe right for the previous one, thumbs up to like. */
export default function SlideRemote() {
  const model = useMemo(() => new SlideModel(), []);
  const [, setTick] = useState(0);
  const [toast, setToast] = useState('');
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const next = useCallback(
    (how: string) => {
      if (model.next()) setToast(`${how}: next slide`);
      else setToast('Last slide');
      refresh();
    },
    [model, refresh],
  );
  const prev = useCallback(
    (how: string) => {
      if (model.prev()) setToast(`${how}: previous slide`);
      else setToast('First slide');
      refresh();
    },
    [model, refresh],
  );
  const like = useCallback(
    (how: string) => {
      model.like();
      setToast(`${how}: liked`);
      refresh();
    },
    [model, refresh],
  );

  // Gestures arrive on the event bus. "Swipe left" = the hand moved to the left of the screen.
  useBus('gesture:swipeLeft', () => next('Swipe left'));
  useBus('gesture:swipeRight', () => prev('Swipe right'));
  useBus('gesture:thumbsUp', (e) => e.kind === 'start' && like('Thumbs up'));

  const handlers: Record<SlideAction, () => void> = useMemo(
    () => ({ next: () => next('Button'), prev: () => prev('Button'), like: () => like('Button') }),
    [next, prev, like],
  );
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const slide = model.current;

  return (
    <div className="space-y-3">
      <div className="relative h-72 overflow-hidden rounded-sm border border-neutral-800 bg-surface">
        <AnimatePresence mode="wait" custom={model.direction} initial={false}>
          <motion.div
            key={model.index}
            custom={model.direction}
            initial={reduce ? false : { opacity: 0, x: model.direction * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: model.direction * -60 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col justify-center gap-3 p-8"
            data-testid="slide"
            aria-live="polite"
          >
            <h3 className="font-serif text-4xl tracking-tight" data-testid="slide-title">
              {slide.title}
            </h3>
            <p className="max-w-md text-neutral-300">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {model.likeTick > 0 && (
            <motion.div
              key={model.likeTick}
              initial={{ opacity: 1, y: 0, scale: 0.6 }}
              animate={{ opacity: 0, y: -60, scale: 1.4 }}
              transition={{ duration: 0.9 }}
              className="pointer-events-none absolute bottom-6 right-8 font-mono text-3xl text-accent"
              aria-hidden
            >
              +1
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute bottom-3 left-8 flex items-center gap-1.5" aria-hidden>
          {model.slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === model.index ? 'w-6 bg-accent' : 'w-1.5 bg-neutral-600'}`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span data-testid="slide-position">
          Slide {model.index + 1} of {model.slides.length}
        </span>
        <span data-testid="slide-likes">
          Likes: {model.likes[model.index]} on this slide · {model.totalLikes} in total
        </span>
      </div>
      <p className="h-4 text-xs text-neutral-500" role="status" data-testid="slide-toast">
        {toast}
      </p>
      <SwipeHelper />
      <ActionBar actions={SLIDE_ACTIONS} handlers={handlers} />
      <ControlsTable actions={SLIDE_ACTIONS} />
    </div>
  );
}
