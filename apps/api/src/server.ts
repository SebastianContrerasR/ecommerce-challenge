import { buildApp, getAppConfig } from "./app.js";
import { disconnectPrismaClient, getPrismaClient } from "./db/client.js";

async function start(): Promise<void> {
  const config = getAppConfig();
  const app = await buildApp({ prisma: getPrismaClient(), logger: true });

  async function shutdown(signal: string): Promise<void> {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
    } finally {
      await disconnectPrismaClient();
    }
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await app.listen({ port: config.port, host: config.host });
}

void start();
