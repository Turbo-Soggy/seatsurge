import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpInventoryClient } from '../src/clients.js';
import { loadConfig } from '../src/config.js';

const respond = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('HttpInventoryClient', () => {
  const client = new HttpInventoryClient('http://inventory:8000');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the hold on 200', async () => {
    const fetchMock = respond(200, { hold_id: 'h1' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await client.getHold('h1')).toEqual({ hold_id: 'h1' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://inventory:8000/api/inventory/holds/h1');
  });

  it('maps 404 to null and other errors to exceptions', async () => {
    vi.stubGlobal('fetch', respond(404));
    expect(await client.getHold('h1')).toBeNull();
    vi.stubGlobal('fetch', respond(500));
    await expect(client.getHold('h1')).rejects.toThrow('500');
  });

  it('commits with POST and maps 410 to null', async () => {
    const ok = respond(200, { hold_id: 'h1' });
    vi.stubGlobal('fetch', ok);
    expect(await client.commitHold('h1')).toEqual({ hold_id: 'h1' });
    expect(ok.mock.calls[0][1].method).toBe('POST');
    vi.stubGlobal('fetch', respond(410));
    expect(await client.commitHold('h1')).toBeNull();
    vi.stubGlobal('fetch', respond(503));
    await expect(client.commitHold('h1')).rejects.toThrow('503');
  });
});

describe('loadConfig', () => {
  it('uses defaults', () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(3000);
    expect(cfg.paymentFailureRate).toBe(0.02);
  });

  it('reads overrides from the environment', () => {
    const cfg = loadConfig({ PORT: '8080', PAYMENT_FAILURE_RATE: '0.5', APP_VERSION: '1.2.3' });
    expect(cfg).toMatchObject({ port: 8080, paymentFailureRate: 0.5, appVersion: '1.2.3' });
  });
});
