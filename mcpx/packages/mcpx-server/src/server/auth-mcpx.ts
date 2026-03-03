import { Request, Response, Router } from "express";
import { Logger } from "winston";
import { HubService } from "../services/hub.js";
import { loggableError } from "@mcpx/toolkit-core/logging";
import { env } from "../env.js";

export function buildAuthMcpxRouter(
  hubService: HubService,
  logger: Logger,
): Router {
  const router = Router();

  router.get("/auth/mcpx", (_req: Request, res: Response) => {
    logger.debug("Getting auth status");
    // In personal mode (ENFORCE_HUB_CONNECTION=false), always report as authenticated
    // so the UI can connect without requiring a Lunar.dev hub account
    if (!env.ENFORCE_HUB_CONNECTION) {
      res.status(200).json({ status: "authenticated" });
      return;
    }
    const status = hubService.status;
    res.status(200).json(status);
  });

  router.post("/auth/mcpx", async (_req: Request, res: Response) => {
    // In personal mode (ENFORCE_HUB_CONNECTION=false), skip hub connection
    if (!env.ENFORCE_HUB_CONNECTION) {
      res.json({ status: "authenticated" });
      return;
    }
    try {
      logger.info("Connecting to Hub with provided token");
      const hubAuthStatus = await hubService.connect({
        setupOwnerId: env.INSTANCE_KEY,
        label: env.INSTANCE_NAME,
      });

      res.json(hubAuthStatus);
    } catch (e) {
      const error = loggableError(e);
      logger.error("Authentication failed", { error });
      res.status(401).json({
        error: "Authentication failed",
        message: error,
      });
    }
  });

  router.delete("/auth/mcpx", async (_req: Request, res: Response) => {
    try {
      logger.info("Disconnecting from Hub");
      await hubService.disconnect();
      res.status(204).send();
    } catch (e) {
      const error = loggableError(e);
      logger.error("Disconnection failed", { error });
      res.status(500).json({ error: "Disconnection failed", message: error });
    }
  });

  return router;
}
