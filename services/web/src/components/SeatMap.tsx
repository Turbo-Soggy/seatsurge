import { memo, useMemo, useState } from 'react';
import { formatINR, seatStatus, type SeatState } from '../lib/seats';
import type { Seat, Venue } from '../lib/types';

interface Props {
  venue: Venue;
  state: SeatState;
  onToggle: (seatId: string) => void;
  locked: boolean;
}

interface Tip {
  seat: Seat;
  x: number;
  y: number;
}

const SeatDot = memo(function SeatDot({
  seat,
  status,
  color,
  onToggle,
  onHover,
  locked,
}: {
  seat: Seat;
  status: string;
  color: string;
  onToggle: (id: string) => void;
  onHover: (seat: Seat | null, e?: React.MouseEvent) => void;
  locked: boolean;
}) {
  const clickable = !locked && (status === 'available' || status === 'selected');
  return (
    <circle
      className={`seat seat--${status}${clickable ? ' seat--clickable' : ''}`}
      cx={seat.x}
      cy={seat.y}
      r={5.4}
      style={{ '--tier': color } as React.CSSProperties}
      onClick={clickable ? () => onToggle(seat.id) : undefined}
      onMouseEnter={(e) => onHover(seat, e)}
      onMouseLeave={() => onHover(null)}
      data-seat={seat.id}
      data-status={status}
      role={clickable ? 'button' : undefined}
      aria-label={`${seat.section} row ${seat.row} seat ${seat.number}, ${status}`}
    />
  );
});

export function SeatMap({ venue, state, onToggle, locked }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const colors = useMemo(() => Object.fromEntries(venue.tiers.map((t) => [t.code, t.color])), [venue]);
  const tierName = useMemo(() => Object.fromEntries(venue.tiers.map((t) => [t.code, t.name])), [venue]);
  const { width, height } = venue.viewbox;
  const stage = venue.stage;

  const onHover = (seat: Seat | null, e?: React.MouseEvent) => {
    if (!seat || !e) return setTip(null);
    const host = (e.currentTarget as SVGElement).ownerSVGElement?.parentElement?.getBoundingClientRect();
    if (!host) return;
    setTip({ seat, x: e.clientX - host.left, y: e.clientY - host.top });
  };

  return (
    <div className="seatmap">
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Arena seat map">
        <defs>
          <radialGradient id="stageGlow" cx="50%" cy="0%" r="70%">
            <stop offset="0%" stopColor="#ff4d8d" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="stageFill" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff4d8d" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <ellipse cx={stage.x} cy={stage.y} rx={560} ry={420} fill="url(#stageGlow)" />
        <rect
          x={stage.x - stage.width / 2}
          y={stage.y - stage.height / 2}
          width={stage.width}
          height={stage.height}
          rx={14}
          fill="url(#stageFill)"
        />
        <text x={stage.x} y={stage.y + 6} className="stage-label">
          STAGE
        </text>
        {venue.seats.map((seat) => (
          <SeatDot
            key={seat.id}
            seat={seat}
            status={seatStatus(seat.id, state)}
            color={colors[seat.tier]}
            onToggle={onToggle}
            onHover={onHover}
            locked={locked}
          />
        ))}
      </svg>
      {tip && (
        <div className="seat-tip" style={{ left: tip.x, top: tip.y }}>
          <strong>
            {tip.seat.section} · Row {tip.seat.row} · Seat {tip.seat.number}
          </strong>
          <span>
            {tierName[tip.seat.tier]} — {formatINR(tip.seat.price)}
          </span>
        </div>
      )}
      <ul className="legend">
        {venue.tiers.map((t) => (
          <li key={t.code}>
            <i style={{ background: t.color }} />
            {t.name} <em>{formatINR(t.price)}</em>
          </li>
        ))}
        <li>
          <i className="legend-held" />
          Being held
        </li>
        <li>
          <i className="legend-sold" />
          Sold
        </li>
      </ul>
    </div>
  );
}
