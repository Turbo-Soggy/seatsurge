import type { SeatStatus } from './types';

export interface SeatState {
  held: ReadonlySet<string>;
  sold: ReadonlySet<string>;
  mine: ReadonlySet<string>;
  selected: ReadonlySet<string>;
}

/** Decide how one seat should be drawn. Your own hold wins over the shared "held" list. */
export function seatStatus(id: string, s: SeatState): SeatStatus {
  if (s.mine.has(id)) return 'mine';
  if (s.sold.has(id)) return 'sold';
  if (s.held.has(id)) return 'held';
  if (s.selected.has(id)) return 'selected';
  return 'available';
}

/** Add or remove a seat from the selection, never exceeding `max`. */
export function toggleSeat(selected: readonly string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (selected.length >= max) return [...selected];
  return [...selected, id];
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  return inr.format(amount);
}

/** Seconds → "m:ss". Negative values clamp to 0:00. */
/** Human wording for a hold duration: 120 -> "2 minutes", 90 -> "90 seconds". */
export function formatDuration(seconds: number): string {
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${seconds} seconds`;
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Deterministic pseudo-QR pattern for the ticket stub: a size×size grid of
 * booleans derived from the confirmation code (FNV-1a + xorshift).
 */
export function ticketPattern(code: string, size = 21): boolean[][] {
  let h = 0x811c9dc5;
  for (const ch of code) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h;
  };
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => (next() & 1) === 1));
  // Finder squares in three corners, like a real QR code.
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = edge || core;
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  return grid;
}
