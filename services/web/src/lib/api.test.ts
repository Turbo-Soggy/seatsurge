import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, sessionId } from './api';

const reply = (status: number, body?: unknown) =>
  vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('posts holds as JSON and returns the body', async () => {
    const f = reply(201, { hold_id: 'h1' });
    vi.stubGlobal('fetch', f);
    expect(await api.hold(['FL1-A1'], 's1')).toEqual({ hold_id: 'h1' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/inventory/holds');
    expect(JSON.parse(init.body)).toMatchObject({ seat_ids: ['FL1-A1'], session_id: 's1' });
  });

  it('turns a 409 into an ApiError carrying the conflicting seats', async () => {
    vi.stubGlobal('fetch', reply(409, { detail: { message: 'Someone beat you to it', seat_ids: ['FL1-A1'] } }));
    const err = await api.hold(['FL1-A1'], 's1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Someone beat you to it');
    expect(err.detail.seat_ids).toEqual(['FL1-A1']);
  });

  it('uses the checkout error field and handles 204', async () => {
    vi.stubGlobal('fetch', reply(410, { error: 'Your hold expired.' }));
    await expect(api.checkout('h1', 'A', 'a@b.c')).rejects.toThrow('Your hold expired.');
    vi.stubGlobal('fetch', reply(204));
    await expect(api.release('h1')).resolves.toBeUndefined();
  });

  it('keeps a stable session id per tab', () => {
    expect(sessionId()).toBe(sessionId());
  });
});
