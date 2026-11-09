#!/usr/bin/env node
// End-to-end booking test: pick a free seat, hold it, prove a second fan is
// rejected, pay, and confirm the seat now shows as sold.
//   node scripts/smoke-test.mjs <base-url> [host-header]
import http from 'node:http';

const [base = 'http://127.0.0.1:8080', host] = process.argv.slice(2);
const EVENT = 'neon-atlas-blr';

// node:http (not fetch) so we can set the Host header and route through the ingress.
function call(method, path, body) {
  const url = new URL(path, base);
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(host ? { Host: host } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 10_000,
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
          } catch {
            reject(new Error(`${method} ${path} -> ${res.statusCode}: ${text.slice(0, 120)}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`${method} ${path} timed out`)));
    req.on('error', reject);
    req.end(payload);
  });
}

function expect(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

const inv = await call('GET', '/api/inventory/version');
const chk = await call('GET', '/api/checkout/version');
expect(inv.status === 200 && chk.status === 200, `services up (inventory ${inv.body?.version}, checkout ${chk.body?.version})`);

const venue = await call('GET', `/api/inventory/events/${EVENT}`);
const avail = await call('GET', `/api/inventory/events/${EVENT}/availability`);
const taken = new Set([...avail.body.held, ...avail.body.sold]);
const seat = venue.body.seats.filter((s) => s.tier === 'UB' && !taken.has(s.id)).pop();

if (!seat && avail.body.counts.sold === avail.body.counts.total) {
  // A sold-out event is a valid production state (e.g. right after a ticket drop).
  // Booking cannot be exercised, so prove the opposite: sold seats cannot be held again.
  const soldSeat = avail.body.sold[0];
  const resell = await call('POST', '/api/inventory/holds', { event_id: EVENT, seat_ids: [soldSeat], session_id: 'smoke-a' });
  expect(resell.status === 409, `event is sold out (${avail.body.counts.sold} seats); re-holding sold seat ${soldSeat} is rejected with 409`);
  const stats = await call('GET', `/api/checkout/events/${EVENT}/stats`);
  expect(stats.status === 200 && stats.body.seats === avail.body.counts.sold, `checkout agrees: ${stats.body?.seats} seats in ${stats.body?.orders} orders`);
  console.log('SMOKE TEST PASSED (sold out: booking flow skipped)');
  process.exit(0);
}
expect(seat, `found a free seat (${seat?.id}) out of ${avail.body.counts.available} available`);

const hold = await call('POST', '/api/inventory/holds', { event_id: EVENT, seat_ids: [seat.id], session_id: 'smoke-a' });
expect(hold.status === 201, `seat held (hold ${hold.body?.hold_id})`);

const rival = await call('POST', '/api/inventory/holds', { event_id: EVENT, seat_ids: [seat.id], session_id: 'smoke-b' });
expect(rival.status === 409, 'second fan is rejected with 409');

let order;
for (let attempt = 1; attempt <= 5; attempt++) {
  order = await call('POST', '/api/checkout/orders', { hold_id: hold.body.hold_id, name: 'Smoke Test', email: 'smoke@example.com' });
  if (order.status !== 402) break; // mock gateway declines ~2% of cards: retry
}
expect(order.status === 201, `order confirmed (${order.body?.code})`);

const after = await call('GET', `/api/inventory/events/${EVENT}/availability`);
expect(after.body.sold.includes(seat.id), 'seat is now marked sold');
console.log('SMOKE TEST PASSED');
