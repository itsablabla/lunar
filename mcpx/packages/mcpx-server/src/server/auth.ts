import type { NextFunction, Request, Response } from "express";
import { ConfigService } from "../config.js";
import { Logger } from "winston";

const DEFAULT_API_KEY_HEADER = "x-lunar-api-key";

export type AuthGuard = (rq: Request, rs: Response, f: NextFunction) => void;
export const noOpAuthGuard: AuthGuard = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next();
};

/**
 * Builds an Express middleware that enforces the "API key" header for the
 * routes you mount it on, given on loaded configuration.
 * - 401  when the header is missing
 * - 403  when the key is present but wrong
 * - calls `next()` when auth is disabled **or** the key is valid
 *
 * Auth enabled/disabled state is evaluated dynamically on every request
 * so that config changes via PATCH /app-config take effect immediately
 * without requiring a server restart.
 */
export function buildApiKeyGuard(
  config: ConfigService,
  logger: Logger,
  apiKey?: string,
): AuthGuard {
  if (!apiKey) {
    logger.warn(
      "AUTH_KEY is not configured — API key guard will be disabled even if auth.enabled=true in config. " +
      "Set the AUTH_KEY environment variable to enable authentication.",
    );
  } else {
    logger.info("API key guard built — auth state will be evaluated dynamically per request");
  }

  return function (req: Request, res: Response, next: NextFunction): void {
    const authConfig = config.getConfig().auth;

    // Evaluate auth.enabled dynamically so config changes take effect immediately
    if (!authConfig?.enabled) {
      next();
      return;
    }

    if (!apiKey) {
      // Auth is enabled in config but no key is set — fail open with a warning
      logger.warn("Auth is enabled in config but AUTH_KEY env var is not set — allowing request");
      next();
      return;
    }

    const headerName = (
      authConfig.header ?? DEFAULT_API_KEY_HEADER
    ).toLowerCase();

    const supplied = req.headers[headerName] as string | undefined;

    if (!supplied) {
      logger.warn("API key not provided in headers, will not allow connection");
      res.status(401).send("Unauthorized: API key required");
      return;
    }

    if (supplied !== apiKey) {
      logger.warn("Invalid API key provided, will not allow connection");
      res.status(403).send("Forbidden: Invalid API key");
      return;
    }

    next();
  };
}
