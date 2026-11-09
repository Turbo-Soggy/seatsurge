// SeatSurge "ticket drop" load test.
// Thousands of fans hit the site the moment tickets go on sale: they poll the seat
// map, race each other for the best seats, and some of them pay.
//
//   k6 run loadtest/ticket-drop.js                              # prod (seatsurge.localhost)
//   k6 run -e HOST=staging.seatsurge.localhost -e PEAK=80 loadtest/ticket-drop.js
//   k6 run -e BASE_URL=http://localhost:8080 -e HOST= loadtest/ticket-drop.js   # docker compose
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1';
const HOST = __ENV.HOST === undefined ? 'seatsurge.localhost' : __ENV.HOST;
const PEAK = Number(__ENV.PEAK || 150);
const EVENT = 'neon-atlas-blr';

const params = { headers: { 'Content-Type': 'application/json', ...(HOST ? { Host: HOST } : {}) } };

// 409 (seat taken), 410 (hold expired) and 402 (card declined) are normal business outcomes.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 402, 409, 410));

const seatsHeld = new Counter('seatsurge_seats_held');
const holdConflicts = new Counter('seatsurge_hold_conflicts');
const ordersConfirmed = new Counter('seatsurge_orders_confirmed');
const checkoutTime = new Trend('seatsurge_checkout_ms', true);

export const options = {
  scenarios: {
    ticket_drop: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: Math.round(PEAK / 3) }, // doors open
        { duration: '40s', target: PEAK }, // the drop goes viral
        { duration: '2m', target: PEAK }, // sustained frenzy
        { duration: '30s', target: 0 }, // sold out, fans leave
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{name:availability}': ['p(95)<800'],
    'http_req_duration{name:hold}': ['p(95)<500'],
  },
};

export function setup() {
  const venue = http.get(`${BASE_URL}/api/inventory/events/${EVENT}`, params).json();
  if (__ENV.RESET === 'true') {
    // Reset both stores: orders first, then seat holds and the sold set. Resetting only
    // inventory leaves old orders in Postgres, so every new checkout would hit 409.
    const orders = http.post(`${BASE_URL}/api/checkout/events/${EVENT}/reset`, null, params);
    const seats = http.post(`${BASE_URL}/api/inventory/events/${EVENT}/reset`, null, params);
    if (orders.status !== 204 || seats.status !== 204) {
      throw new Error(`reset failed: checkout ${orders.status}, inventory ${seats.status}`);
    }
  }
  // Fans want the floor first, then the lower bowl.
  const weight = { FL: 12, LB: 3, UB: 1 };
  const pool = [];
  for (const s of venue.seats) for (let i = 0; i < weight[s.tier]; i++) pool.push(s.id);
  return { pool };
}

function pickSeats(pool, unavailable, count) {
  const picked = new Set();
  for (let tries = 0; picked.size < count && tries < 40; tries++) {
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (!unavailable.has(id)) picked.add(id);
  }
  return [...picked];
}

let staleView = null; // per-VU: the seat map as of the previous refresh

export default function (data) {
  const avail = http.get(`${BASE_URL}/api/inventory/events/${EVENT}/availability`, {
    ...params,
    tags: { name: 'availability' },
  });
  check(avail, { 'seat map loads': (r) => r.status === 200 });
  if (avail.status !== 200) return sleep(1);

  // Real fans click on the map they were looking at a moment ago, not a perfectly
  // fresh one, so pick from the previous refresh: that is what causes collisions.
  const body = avail.json();
  const unavailable = staleView || new Set([...body.held, ...body.sold]);
  staleView = new Set([...body.held, ...body.sold]);
  const want = 1 + Math.floor(Math.random() * 4);
  const seats = pickSeats(data.pool, unavailable, want);
  if (seats.length === 0) return sleep(2); // sold out: keep refreshing like real fans do

  const hold = http.post(
    `${BASE_URL}/api/inventory/holds`,
    JSON.stringify({ event_id: EVENT, seat_ids: seats, session_id: `vu-${__VU}` }),
    { ...params, tags: { name: 'hold' } },
  );
  check(hold, { 'hold answered (201 or 409)': (r) => r.status === 201 || r.status === 409 });

  if (hold.status === 409) {
    holdConflicts.add(1);
    return sleep(0.3 + Math.random());
  }
  if (hold.status !== 201) return sleep(1);
  seatsHeld.add(seats.length);
  const holdId = hold.json('hold_id');

  sleep(1 + Math.random() * 3); // fan types their details

  if (Math.random() < 0.75) {
    const start = Date.now();
    const order = http.post(
      `${BASE_URL}/api/checkout/orders`,
      JSON.stringify({ hold_id: holdId, name: `Fan ${__VU}`, email: `fan${__VU}@example.com` }),
      { ...params, tags: { name: 'checkout' } },
    );
    checkoutTime.add(Date.now() - start);
    check(order, { 'checkout answered': (r) => [201, 402, 409, 410].includes(r.status) });
    if (order.status === 201) ordersConfirmed.add(1);
  } else {
    http.del(`${BASE_URL}/api/inventory/holds/${holdId}`, null, { ...params, tags: { name: 'release' } });
  }
  sleep(0.5 + Math.random());
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'loadtest/results/summary.json': JSON.stringify(data, null, 2),
  };
}
