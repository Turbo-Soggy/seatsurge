import { describe, expect, it } from 'vitest';
import { formatCountdown, formatINR, seatStatus, ticketPattern, toggleSeat } from './seats';

const empty = new Set<string>();

describe('seatStatus', () => {
  const state = {
    held: new Set(['A', 'M']),
    sold: new Set(['B']),
    mine: new Set(['M']),
    selected: new Set(['C']),
  };
  it('classifies seats with "mine" taking priority over held', () => {
    expect(seatStatus('M', state)).toBe('mine');
    expect(seatStatus('A', state)).toBe('held');
    expect(seatStatus('B', state)).toBe('sold');
    expect(seatStatus('C', state)).toBe('selected');
    expect(seatStatus('Z', { held: empty, sold: empty, mine: empty, selected: empty })).toBe('available');
  });
});

describe('toggleSeat', () => {
  it('adds and removes seats', () => {
    expect(toggleSeat([], 'A', 6)).toEqual(['A']);
    expect(toggleSeat(['A', 'B'], 'A', 6)).toEqual(['B']);
  });
  it('never exceeds the limit', () => {
    expect(toggleSeat(['A', 'B'], 'C', 2)).toEqual(['A', 'B']);
  });
});

describe('formatting', () => {
  it('formats rupees in the Indian grouping style', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
  });
  it('formats countdowns and clamps negatives', () => {
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(9.9)).toBe('0:09');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('ticketPattern', () => {
  it('is deterministic per code and differs between codes', () => {
    expect(ticketPattern('SS-AAAA-BBBB')).toEqual(ticketPattern('SS-AAAA-BBBB'));
    expect(ticketPattern('SS-AAAA-BBBB')).not.toEqual(ticketPattern('SS-CCCC-DDDD'));
  });
  it('draws finder squares in three corners', () => {
    const g = ticketPattern('X', 21);
    expect(g[0][0] && g[0][20] && g[20][0]).toBe(true);
    expect(g[1][1]).toBe(false);
    expect(g[3][3]).toBe(true);
  });
});
