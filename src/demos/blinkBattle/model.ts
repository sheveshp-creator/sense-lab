export type Phase = 'waiting' | 'countdown' | 'live' | 'over';
export type Reason = 'blink' | 'face lost' | 'draw';

export interface Player {
  name: string;
  /** Face track this player is. Set when a round starts, fixed for the round. */
  trackId: number | null;
  wins: number;
}

/** A face on screen, as the model needs it. */
export interface BattleFace {
  id: number;
  /** 0 = left edge of the screen, 1 = right edge. */
  cx: number;
}

export const COUNTDOWN_MS = 3000;
/** Two blinks this close together are compared by when each started, not by which arrived first. */
const GRACE_MS = 150;
/** Blinks whose starts differ by less than this are a draw. */
const DRAW_MS = 20;
/** A player whose face is gone this long during a round forfeits. */
const FORFEIT_MS = 1500;

/**
 * Blink Battle: two faces, first to blink loses. Player 1 is the face on the left of the screen. Blinks come in
 * from the event bus ("face:blink"); the buttons and keys call manualBlink() so the game can be played, and
 * tested, without the camera. A blink is reported when the eyes re-open, so it is dated by when it STARTED
 * (end minus duration), which matters when both players blink within a frame or two of each other.
 */
export class BlinkBattleModel {
  phase: Phase = 'waiting';
  readonly players: [Player, Player] = [
    { name: 'Player 1', trackId: null, wins: 0 },
    { name: 'Player 2', trackId: null, wins: 0 },
  ];
  /** 0 or 1: who lost the last round. */
  loser: 0 | 1 | null = null;
  reason: Reason | null = null;
  /** How long the loser kept their eyes open in the last round (ms). */
  survivedMs = 0;
  private countdownEnd = 0;
  private liveStart = 0;
  private pending: { player: 0 | 1; startMs: number; at: number }[] = [];
  private lastSeen: [number, number] = [0, 0];

  /** Milliseconds left of the countdown (0 when not counting down). */
  countdownLeft(now: number): number {
    return this.phase === 'countdown' ? Math.max(0, this.countdownEnd - now) : 0;
  }

  /** How long the current round has been going (ms). */
  elapsed(now: number): number {
    return this.phase === 'live' ? now - this.liveStart : this.survivedMs;
  }

  canStart(faces: readonly BattleFace[]): boolean {
    return faces.length >= 2;
  }

  /** Starts a round with the two faces furthest left on the screen (player 1 = left). */
  start(now: number, faces: readonly BattleFace[]): boolean {
    if (!this.canStart(faces) || this.phase === 'countdown' || this.phase === 'live') return false;
    const two = [...faces].sort((a, b) => a.cx - b.cx).slice(0, 2);
    this.players[0].trackId = two[0]!.id;
    this.players[1].trackId = two[1]!.id;
    this.phase = 'countdown';
    this.countdownEnd = now + COUNTDOWN_MS;
    this.loser = null;
    this.reason = null;
    this.survivedMs = 0;
    this.pending = [];
    this.lastSeen = [now, now];
    return true;
  }

  /** Every frame (or timer tick): moves countdown to live, finalises close blinks, checks for forfeits. */
  update(now: number, faces: readonly BattleFace[]): void {
    if (this.phase === 'countdown' && now >= this.countdownEnd) {
      this.phase = 'live';
      this.liveStart = now;
      this.lastSeen = [now, now];
    }
    if (this.phase !== 'live') return;

    // Settle a blink once nobody else could still beat it.
    if (this.pending.length > 0 && now - this.pending[0]!.at >= GRACE_MS) {
      this.settle();
      return;
    }
    this.players.forEach((p, i) => {
      if (faces.some((f) => f.id === p.trackId)) this.lastSeen[i] = now;
    });
    for (const i of [0, 1] as const) {
      if (this.phase === 'live' && now - this.lastSeen[i] > FORFEIT_MS) {
        this.finish(i, 'face lost', now - this.liveStart);
        return;
      }
    }
  }

  /** A blink from the event bus. Blinks outside a live round are ignored (no false starts in the countdown). */
  blink(trackId: number, startMs: number, now: number): void {
    const player = this.players.findIndex((p) => p.trackId === trackId);
    if (this.phase !== 'live' || player < 0 || startMs < this.liveStart - GRACE_MS) return;
    if (this.pending.some((p) => p.player === player)) return;
    this.pending.push({ player: player as 0 | 1, startMs, at: now });
    if (this.pending.length === 2) this.settle(); // both have blinked: no reason to wait
  }

  /** Button / keyboard stand-in for a blink. */
  manualBlink(player: 0 | 1, now: number): void {
    if (this.phase !== 'live') return;
    if (this.pending.some((p) => p.player === player)) return;
    this.pending.push({ player, startMs: now, at: now });
    if (this.pending.length === 2) this.settle();
  }

  /** Back to the lobby, keeping the scores. */
  newRound(): void {
    this.phase = 'waiting';
    this.pending = [];
    this.loser = null;
    this.reason = null;
  }

  resetScores(): void {
    this.players[0].wins = 0;
    this.players[1].wins = 0;
    this.newRound();
  }

  private settle(): void {
    const sorted = [...this.pending].sort((a, b) => a.startMs - b.startMs);
    const first = sorted[0]!;
    if (sorted[1] && sorted[1].startMs - first.startMs < DRAW_MS) {
      this.phase = 'over';
      this.loser = null;
      this.reason = 'draw';
      this.survivedMs = first.startMs - this.liveStart;
      this.pending = [];
      return;
    }
    this.finish(first.player, 'blink', first.startMs - this.liveStart);
  }

  private finish(loser: 0 | 1, reason: Reason, survivedMs: number): void {
    this.phase = 'over';
    this.loser = loser;
    this.reason = reason;
    this.survivedMs = Math.max(0, survivedMs);
    this.players[loser === 0 ? 1 : 0].wins++;
    this.pending = [];
  }
}
