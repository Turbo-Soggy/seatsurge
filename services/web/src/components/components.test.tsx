import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Order, Venue } from '../lib/types';
import { SeatMap } from './SeatMap';
import { TicketStub } from './TicketStub';

const venue: Venue = {
  id: 'neon-atlas-blr',
  artist: 'The Midnight Cartographers',
  tour: 'Neon Atlas Tour',
  venue: 'Skyline Arena, Bengaluru',
  date: '2026-12-19T19:30:00+05:30',
  currency: 'INR',
  viewbox: { width: 1200, height: 680 },
  stage: { x: 600, y: 70, width: 260, height: 56 },
  tiers: [{ code: 'FL', name: 'Floor', price: 7999, color: '#ff4d8d' }],
  seats: [
    { id: 'FL1-A1', section: 'FL1', tier: 'FL', row: 'A', number: 1, x: 500, y: 200, price: 7999 },
    { id: 'FL1-A2', section: 'FL1', tier: 'FL', row: 'A', number: 2, x: 520, y: 200, price: 7999 },
    { id: 'FL1-A3', section: 'FL1', tier: 'FL', row: 'A', number: 3, x: 540, y: 200, price: 7999 },
  ],
  hold_policy: { ttl_seconds: 120, max_seats: 6 },
};

const none = new Set<string>();

describe('SeatMap', () => {
  it('renders every seat with its status', () => {
    const { container } = render(
      <SeatMap
        venue={venue}
        state={{ held: new Set(['FL1-A2']), sold: new Set(['FL1-A3']), mine: none, selected: none }}
        onToggle={() => {}}
        locked={false}
      />,
    );
    const statuses = [...container.querySelectorAll('circle')].map((c) => c.getAttribute('data-status'));
    expect(statuses).toEqual(['available', 'held', 'sold']);
    expect(screen.getByText('Being held')).toBeInTheDocument();
  });

  it('only lets you click available seats, and nothing when locked', () => {
    const onToggle = vi.fn();
    const { container, rerender } = render(
      <SeatMap
        venue={venue}
        state={{ held: new Set(['FL1-A2']), sold: none, mine: none, selected: none }}
        onToggle={onToggle}
        locked={false}
      />,
    );
    const [a1, a2] = container.querySelectorAll('circle');
    fireEvent.click(a1);
    fireEvent.click(a2);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('FL1-A1');

    rerender(
      <SeatMap venue={venue} state={{ held: none, sold: none, mine: none, selected: none }} onToggle={onToggle} locked />,
    );
    fireEvent.click(container.querySelectorAll('circle')[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('TicketStub', () => {
  it('shows the confirmation code and seats', () => {
    const order: Order = {
      code: 'SS-7KQ2-M9XD',
      customerName: 'Asha',
      email: 'asha@example.com',
      total: 15998,
      createdAt: new Date().toISOString(),
      seats: [
        { id: 'FL1-A1', section: 'FL1', row: 'A', number: 1, price: 7999 },
        { id: 'FL1-A2', section: 'FL1', row: 'A', number: 2, price: 7999 },
      ],
    };
    render(<TicketStub order={order} venue={venue} />);
    expect(screen.getByText('SS-7KQ2-M9XD')).toBeInTheDocument();
    expect(screen.getByText('₹15,998')).toBeInTheDocument();
    expect(screen.getAllByText(/Row A/)).toHaveLength(2);
  });
});
