import { randomUUID } from 'node:crypto';
import type { Hold, InventoryClient, PaymentGateway } from './types.js';

export class HttpInventoryClient implements InventoryClient {
  constructor(private readonly baseUrl: string) {}

  async getHold(holdId: string): Promise<Hold | null> {
    const res = await fetch(`${this.baseUrl}/api/inventory/holds/${encodeURIComponent(holdId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`inventory getHold failed: ${res.status}`);
    return (await res.json()) as Hold;
  }

  async commitHold(holdId: string): Promise<Hold | null> {
    const res = await fetch(`${this.baseUrl}/api/inventory/holds/${encodeURIComponent(holdId)}/commit`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 410) return null;
    if (!res.ok) throw new Error(`inventory commitHold failed: ${res.status}`);
    return (await res.json()) as Hold;
  }
}

/** Stand-in for a real payment provider: adds realistic latency and a small decline rate. */
export class MockPaymentGateway implements PaymentGateway {
  constructor(
    private readonly failureRate: number,
    private readonly random: () => number = Math.random,
  ) {}

  async charge(_amount: number, _email: string): Promise<{ approved: boolean; reference: string }> {
    const latency = 40 + this.random() * 80;
    await new Promise((resolve) => setTimeout(resolve, latency));
    return { approved: this.random() >= this.failureRate, reference: `pay_${randomUUID().slice(0, 12)}` };
  }
}
