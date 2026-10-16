import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Ecommerce Challenge API",
        version: "0.1.0",
      },
      servers: [{ url: "http://localhost:3000" }],
    },
    hideUntagged: false,
  });
  app.get("/openapi.json", async () => {
    return app.swagger();
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });
}
