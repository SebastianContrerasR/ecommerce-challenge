export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  logLevel: string;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 3000;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return parsed;
}

function parseRequiredString(raw: string | undefined, name: string): string {
  if (raw === undefined || raw === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const logLevel = env["LOG_LEVEL"] ?? "info";
  return {
    port: parsePort(env["PORT"]),
    host: env["HOST"] ?? "0.0.0.0",
    databaseUrl: parseRequiredString(env["DATABASE_URL"], "DATABASE_URL"),
    logLevel,
  };
}
