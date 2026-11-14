import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import { ActionBar, ControlsTable } from '../ActionBar';
import { useBus } from '../hooks';
import { SLIDE_ACTIONS } from './actions';
import type { SlideAction } from './actions';
import { SlideModel } from './model';

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
      <div className="relative h-72 overflow-hidden rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950">
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
            <h3 className="text-3xl font-semibold tracking-tight" data-testid="slide-title">
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
              className="pointer-events-none absolute bottom-6 right-8 text-4xl"
              aria-hidden
            >
              👍
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute bottom-3 left-8 flex items-center gap-1.5" aria-hidden>
          {model.slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === model.index ? 'w-6 bg-emerald-400' : 'w-1.5 bg-neutral-600'}`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span data-testid="slide-position">
          Slide {model.index + 1} of {model.slides.length}
        </span>
        <span data-testid="slide-likes">
          👍 {model.likes[model.index]} on this slide · {model.totalLikes} in total
        </span>
      </div>
      <p className="h-4 text-xs text-neutral-500" role="status" data-testid="slide-toast">
        {toast}
      </p>
      <ActionBar actions={SLIDE_ACTIONS} handlers={handlers} />
      <ControlsTable actions={SLIDE_ACTIONS} />
    </div>
  );
}
