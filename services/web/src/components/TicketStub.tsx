import { useMemo } from 'react';
import { formatINR, ticketPattern } from '../lib/seats';
import type { Order, Venue } from '../lib/types';

export function TicketStub({ order, venue }: { order: Order; venue: Venue }) {
  const grid = useMemo(() => ticketPattern(order.code), [order.code]);
  const date = new Date(venue.date);
  return (
    <div className="ticket" data-testid="ticket">
      <div className="ticket-main">
        <span className="eyebrow">You're in 🎉</span>
        <h3>{venue.artist}</h3>
        <p className="muted">
          {venue.tour} · {venue.venue}
        </p>
        <p className="muted">
          {date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {' · '}
          {date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
        </p>
        <ul className="ticket-seats">
          {order.seats.map((s) => (
            <li key={s.id}>
              <span>{s.section}</span>
              <span>Row {s.row}</span>
              <span>Seat {s.number}</span>
            </li>
          ))}
        </ul>
        <div className="ticket-total">
          <span>Paid</span>
          <strong>{formatINR(order.total)}</strong>
        </div>
      </div>
      <div className="ticket-stub">
        <svg viewBox="0 0 21 21" className="qr" aria-hidden>
          {grid.flatMap((row, r) =>
            row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} /> : null)),
          )}
        </svg>
        <code>{order.code}</code>
      </div>
    </div>
  );
}
