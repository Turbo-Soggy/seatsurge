import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SeatMap } from './components/SeatMap';
import { TicketStub } from './components/TicketStub';
import { ApiError, api, sessionId } from './lib/api';
import { formatCountdown, formatDuration, formatINR, toggleSeat } from './lib/seats';
import type { Availability, Hold, Order, SalesStats, Venue } from './lib/types';

const DEFAULT_MAX_SEATS = 6;
const DEFAULT_HOLD_SECONDS = 120;
const POLL_MS = 1500;
const WEB_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

interface Toast {
  id: number;
  kind: 'error' | 'info' | 'success';
  text: string;
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return { toasts, push };
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function App() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [holdSeconds, setHoldSeconds] = useState(120);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { toasts, push } = useToasts();
  const now = useNow(hold !== null);
  const [session] = useState(() => sessionId());
  const selectedRef = useRef<string[]>([]);
  const holdRef = useRef<Hold | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
    holdRef.current = hold;
  }, [selected, hold]);

  useEffect(() => {
    api.venue().then(setVenue).catch(() => setOnline(false));
  }, []);

  // Live availability + sales polling.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [a, s] = await Promise.all([api.availability(), api.stats().catch(() => null)]);
        if (cancelled) return;
        setAvail(a);
        // If someone grabbed a seat we had picked (but not yet held), drop it and say so.
        const taken = new Set([...a.held, ...a.sold]);
        const mineNow = new Set(holdRef.current?.seat_ids ?? []);
        const lost = selectedRef.current.filter((id) => taken.has(id) && !mineNow.has(id));
        if (lost.length) {
          setSelected((cur) => cur.filter((id) => !lost.includes(id)));
          push('info', `${lost.join(', ')} just got grabbed by another fan`);
        }
        if (s) setStats(s);
        setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [push]);

  // Version chips: refreshed so a rolling update is visible live in the header.
  useEffect(() => {
    const load = () =>
      Promise.all(
        (['inventory', 'checkout'] as const).map((s) =>
          api
            .version(s)
            .then((v) => [s, v.version] as const)
            .catch(() => [s, '—'] as const),
        ),
      ).then((pairs) => setVersions(Object.fromEntries(pairs)));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const held = useMemo(() => new Set(avail?.held ?? []), [avail]);
  const sold = useMemo(() => new Set(avail?.sold ?? []), [avail]);
  const mine = useMemo(() => new Set(hold?.seat_ids ?? []), [hold]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const secondsLeft = hold ? hold.expires_at - now / 1000 : 0;
  useEffect(() => {
    if (!hold) return;
    const t = setTimeout(
      () => {
        setHold(null);
        push('error', 'Your hold expired — the seats went back on sale.');
      },
      Math.max(0, hold.expires_at * 1000 - Date.now()),
    );
    return () => clearTimeout(t);
  }, [hold, push]);

  const maxSeats = venue?.hold_policy?.max_seats ?? DEFAULT_MAX_SEATS;
  const holdTtl = venue?.hold_policy?.ttl_seconds ?? DEFAULT_HOLD_SECONDS;
  const seatIndex = useMemo(() => new Map(venue?.seats.map((s) => [s.id, s]) ?? []), [venue]);
  const selectedSeats = selected.map((id) => seatIndex.get(id)).filter((s) => s !== undefined);
  const selectedTotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  const onToggle = useCallback(
    (id: string) =>
      setSelected((s) => {
        const next = toggleSeat(s, id, maxSeats);
        if (next.length === s.length && !s.includes(id)) push('info', `You can pick up to ${maxSeats} seats`);
        return next;
      }),
    [push, maxSeats],
  );

  async function onHold() {
    setBusy(true);
    try {
      const h = await api.hold(selected, session);
      setHoldSeconds(Math.max(1, h.expires_at - Date.now() / 1000));
      setHold(h);
      setSelected([]);
      push('success', `Seats held for ${formatCountdown(h.expires_at - Date.now() / 1000)} — complete checkout!`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const taken = (err.detail as { seat_ids?: string[] })?.seat_ids ?? [];
        setSelected((s) => s.filter((id) => !taken.includes(id)));
        push('error', `Someone beat you to ${taken.join(', ') || 'those seats'}`);
      } else {
        push('error', (err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRelease() {
    if (!hold) return;
    await api.release(hold.hold_id).catch(() => undefined);
    setHold(null);
    push('info', 'Seats released');
  }

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    if (!hold) return;
    setBusy(true);
    try {
      const o = await api.checkout(hold.hold_id, name, email);
      setOrder(o);
      setHold(null);
      push('success', `Booked! Confirmation ${o.code}`);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 410) setHold(null);
      push('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const counts = avail?.counts;
  const soldPct = counts ? ((counts.sold + counts.held) / counts.total) * 100 : 0;
  const date = venue ? new Date(venue.date) : null;
  const ttlPct = hold ? Math.max(0, Math.min(100, (secondsLeft / holdSeconds) * 100)) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden className="brand-mark">
            <path d="M3 22c4-8 8-8 12 0s8 8 14-6" />
            <path d="M3 14c4-8 8-8 12 0s8 8 14-6" opacity=".45" />
          </svg>
          <span>SeatSurge</span>
        </div>
        <div className="status">
          <span className={`live ${online ? '' : 'live--down'}`}>{online ? 'LIVE' : 'RECONNECTING'}</span>
          <span className="chip">web {WEB_VERSION}</span>
          <span className="chip">inventory {versions.inventory ?? '…'}</span>
          <span className="chip">checkout {versions.checkout ?? '…'}</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Ticket drop · on sale now</span>
          <h1>{venue?.artist ?? 'Loading…'}</h1>
          <p>
            {venue?.tour} — {venue?.venue}
            {date && (
              <>
                {' · '}
                {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </>
            )}
          </p>
        </div>
        <div className="stats">
          <div className="stat stat--wide">
            <span className="stat-label">Seats left</span>
            <strong className="stat-value">
              {counts?.available.toLocaleString('en-IN') ?? '—'}
              <small> / {counts?.total.toLocaleString('en-IN') ?? '—'}</small>
            </strong>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${soldPct}%` }} />
            </div>
          </div>
          <div className="stat">
            <span className="stat-label">Held right now</span>
            <strong className="stat-value stat-value--amber">{counts?.held ?? '—'}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Sold</span>
            <strong className="stat-value">{counts?.sold ?? '—'}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Box office</span>
            <strong className="stat-value">{stats ? formatINR(stats.revenue) : '—'}</strong>
          </div>
        </div>
      </section>

      <main className="layout">
        <section className="panel map-panel">
          {venue ? (
            <SeatMap
              venue={venue}
              state={{ held, sold, mine, selected: selectedSet }}
              onToggle={onToggle}
              locked={hold !== null || order !== null}
            />
          ) : (
            <div className="empty">{online ? 'Loading the arena…' : 'Cannot reach the inventory service.'}</div>
          )}
        </section>

        <aside className="panel side">
          {order && venue ? (
            <>
              <TicketStub order={order} venue={venue} />
              <button className="btn btn--ghost" onClick={() => setOrder(null)}>
                Book more seats
              </button>
            </>
          ) : hold ? (
            <form onSubmit={onPay} className="checkout">
              <div className="timer" style={{ '--pct': `${ttlPct}%` } as React.CSSProperties}>
                <div>
                  <span className="stat-label">Seats held for</span>
                  <strong className={secondsLeft < 30 ? 'urgent' : ''}>{formatCountdown(secondsLeft)}</strong>
                </div>
              </div>
              <ul className="picked">
                {hold.seats.map((s) => (
                  <li key={s.id}>
                    <span>
                      {s.section} · Row {s.row} · Seat {s.number}
                    </span>
                    <span>{formatINR(s.price)}</span>
                  </li>
                ))}
              </ul>
              <label>
                Name
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Rao" />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="asha@example.com"
                />
              </label>
              <button className="btn" disabled={busy}>
                {busy ? 'Processing…' : `Pay ${formatINR(hold.total)}`}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onRelease} disabled={busy}>
                Release seats
              </button>
            </form>
          ) : (
            <div className="selection">
              <h2>Your seats</h2>
              <p className="muted">
                Tap up to {maxSeats} seats on the map. Seats are locked to you for {formatDuration(holdTtl)} once held.
              </p>
              {selectedSeats.length === 0 ? (
                <div className="empty empty--small">No seats picked yet</div>
              ) : (
                <ul className="picked">
                  {selectedSeats.map((s) => (
                    <li key={s.id}>
                      <span>
                        {s.section} · Row {s.row} · Seat {s.number}
                      </span>
                      <span>{formatINR(s.price)}</span>
                      <button type="button" aria-label={`Remove ${s.id}`} onClick={() => onToggle(s.id)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="total">
                <span>Total</span>
                <strong>{formatINR(selectedTotal)}</strong>
              </div>
              <button className="btn" disabled={selected.length === 0 || busy} onClick={onHold}>
                {busy ? 'Grabbing seats…' : 'Hold these seats'}
              </button>
            </div>
          )}
        </aside>
      </main>

      <footer className="foot">
        SeatSurge · a DevOps case study — GitHub Actions · Docker · Kubernetes · Terraform · Prometheus · Grafana
      </footer>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
