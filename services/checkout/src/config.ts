export interface Config {
  port: number;
  databaseUrl: string;
  inventoryUrl: string;
  paymentFailureRate: number;
  appVersion: string;
  /** Test/demo environments only: lets the load test wipe an event's orders. */
  allowReset: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://seatsurge:seatsurge@localhost:5432/seatsurge',
    inventoryUrl: env.INVENTORY_URL ?? 'http://localhost:8000',
    paymentFailureRate: Number(env.PAYMENT_FAILURE_RATE ?? 0.02),
    appVersion: env.APP_VERSION ?? 'dev',
    allowReset: (env.ALLOW_RESET ?? 'false').toLowerCase() === 'true',
  };
}
