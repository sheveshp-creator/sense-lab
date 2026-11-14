import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { frameStore } from '../../core/frameStore';
import { ActionBar, ControlsTable } from '../ActionBar';
import { useBus } from '../hooks';
import { BATTLE_ACTIONS } from './actions';
import type { BattleAction } from './actions';
import { BlinkBattleModel } from './model';
import type { BattleFace, Phase } from './model';

interface View {
  phase: Phase;
  countdown: number;
  elapsed: number;
  faces: number;
  loser: 0 | 1 | null;
  reason: string | null;
  survived: number;
  wins: [number, number];
}

/** Blink Battle: two faces, first to blink loses. Blinks arrive on the event bus; the buttons and keys stand in for them. */
export default function BlinkBattle() {
  const model = useMemo(() => new BlinkBattleModel(), []);
  const faces = useRef<BattleFace[]>([]);
  const [view, setView] = useState<View>({
    phase: 'waiting',
    countdown: 0,
    elapsed: 0,
    faces: 0,
    loser: null,
    reason: null,
    survived: 0,
    wins: [0, 0],
  });

  const tick = useCallback(() => {
    const now = performance.now();
    faces.current = frameStore.getState().faces.map((f) => ({ id: f.id, cx: f.cx }));
    model.update(now, faces.current);
    setView({
      phase: model.phase,
      countdown: model.countdownLeft(now),
      elapsed: model.elapsed(now),
      faces: faces.current.length,
      loser: model.loser,
      reason: model.reason,
      survived: model.survivedMs,
      wins: [model.players[0].wins, model.players[1].wins],
    });
  }, [model]);
  useEffect(() => {
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [tick]);

  // A face blinked: the event says when the eyes re-opened and how long they were shut.
  useBus('face:blink', (e) => {
    model.blink(e.trackId, e.t - e.durationMs, performance.now());
    tick();
  });

  const handlers: Record<BattleAction, () => void> = useMemo(
    () => ({
      start: () => {
        model.start(performance.now(), faces.current);
        tick();
      },
      blink1: () => {
        model.manualBlink(0, performance.now());
        tick();
      },
      blink2: () => {
        model.manualBlink(1, performance.now());
        tick();
      },
      again: () => {
        model.newRound();
        tick();
      },
    }),
    [model, tick],
  );

  const p = view.phase;
  const secs = (ms: number) => (ms / 1000).toFixed(1);
  const banner =
    p === 'waiting'
      ? view.faces >= 2
        ? 'Two faces found. Press Start.'
        : `Waiting for two faces (${view.faces} in view). Or play with the buttons and keys.`
      : p === 'countdown'
        ? `Get ready... ${Math.ceil(view.countdown / 1000)}`
        : p === 'live'
          ? `Don't blink! ${secs(view.elapsed)} s`
          : view.reason === 'draw'
            ? 'Draw: you blinked together.'
            : `Player ${(view.loser ?? 0) + 1} ${view.reason === 'face lost' ? 'left the frame' : 'blinked first'} after ${secs(view.survived)} s.`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3" data-testid="battle-players">
        {[0, 1].map((i) => (
          <div
            key={i}
            data-testid={`player-${i + 1}`}
            data-lost={view.loser === i}
            className={`rounded-xl border p-4 text-center transition ${view.loser === i ? 'border-red-500/60 bg-red-950/40' : p === 'over' && view.loser !== null ? 'border-emerald-500/50 bg-emerald-950/30' : 'border-neutral-800 bg-neutral-900'}`}
          >
            <p className="text-sm text-neutral-400">Player {i + 1}</p>
            <p className="text-4xl font-semibold tabular-nums" data-testid={`wins-${i + 1}`}>
              {view.wins[i]}
            </p>
            <p className="text-xs text-neutral-500">
              {i === 0 ? 'left of the screen' : 'right of the screen'}
            </p>
          </div>
        ))}
      </div>
      <p
        role="status"
        data-testid="battle-banner"
        data-phase={p}
        className={`rounded-xl px-4 py-5 text-center text-xl font-medium transition ${p === 'live' ? 'bg-amber-500/15 text-amber-300' : 'bg-neutral-900 text-neutral-100'}`}
      >
        {banner}
      </p>
      <ActionBar actions={BATTLE_ACTIONS} handlers={handlers} />
      <button
        className="text-xs text-neutral-500 underline hover:text-neutral-300"
        onClick={() => {
          model.resetScores();
          tick();
        }}
      >
        Reset scores
      </button>
      <ControlsTable actions={BATTLE_ACTIONS} />
      <p className="text-xs text-neutral-500">
        A blink counts when the eyes open again, and is dated by when it started, so two blinks a
        frame apart are judged fairly. Leave the frame for 1.5 seconds and you forfeit.
      </p>
    </div>
  );
}
