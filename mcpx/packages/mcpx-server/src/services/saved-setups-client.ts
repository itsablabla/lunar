import {
  deleteSavedSetupAckSchema,
  listSavedSetupsAckSchema,
  saveSetupAckSchema,
  updateSavedSetupAckSchema,
  WebappBoundPayloadOf,
  wrapInEnvelope,
} from "@mcpx/webapp-protocol/messages";
import { Logger } from "winston";
import { z } from "zod/v4";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";

export interface SavedSetupsSocket {
  emitWithAck(event: string, envelope: unknown): Promise<unknown>;
}

// Local file-based fallback for saved setups when Hub is not connected
const LOCAL_SETUPS_PATH = "/tmp/mcpx-saved-setups.json";

interface LocalSetup {
  id: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

function readLocalSetups(): LocalSetup[] {
  try {
    if (existsSync(LOCAL_SETUPS_PATH)) {
      return JSON.parse(readFileSync(LOCAL_SETUPS_PATH, "utf-8"));
    }
  } catch {
    // ignore read errors
  }
  return [];
}

function writeLocalSetups(setups: LocalSetup[]): void {
  writeFileSync(LOCAL_SETUPS_PATH, JSON.stringify(setups, null, 2), "utf-8");
}

export class SavedSetupsClient {
  private logger: Logger;

  constructor(
    private getSocket: () => SavedSetupsSocket | null,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: "SavedSetupsClient" });
  }

  async saveSetup(
    payload: WebappBoundPayloadOf<"save-setup">,
  ): Promise<z.infer<typeof saveSetupAckSchema>> {
    const socket = this.getSocket();
    if (!socket) {
      // Local fallback: save to file
      this.logger.info("Hub not connected — saving setup locally", { description: payload.description });
      const setups = readLocalSetups();
      const newSetup: LocalSetup = {
        ...payload,
        id: randomUUID(),
        description: payload.description ?? "Untitled setup",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setups.push(newSetup);
      writeLocalSetups(setups);
      return { success: true, savedSetupId: newSetup.id, description: newSetup.description, savedAt: newSetup.createdAt };
    }
    const envelope = wrapInEnvelope({ payload });
    this.logger.debug("Sending save-setup to Hub", {
      messageId: envelope.metadata.id,
    });
    const ack = await socket.emitWithAck("save-setup", envelope);
    const parsed = saveSetupAckSchema.safeParse(ack);
    if (!parsed.success) {
      this.logger.error("Invalid save-setup ack from Hub", {
        error: parsed.error,
        ack,
      });
      return { success: false, error: "Invalid response from Hub" };
    }
    return parsed.data;
  }

  async listSavedSetups(): Promise<z.infer<typeof listSavedSetupsAckSchema>> {
    const socket = this.getSocket();
    if (!socket) {
      // Local fallback: read from file
      const setups = readLocalSetups();
      this.logger.info("Hub not connected — listing local setups", { count: setups.length });
      return { setups: setups as unknown as z.infer<typeof listSavedSetupsAckSchema>["setups"] };
    }
    const envelope = wrapInEnvelope({ payload: {} });
    this.logger.debug("Sending list-saved-setups to Hub");
    const ack = await socket.emitWithAck("list-saved-setups", envelope);
    const parsed = listSavedSetupsAckSchema.safeParse(ack);
    if (!parsed.success) {
      this.logger.error("Invalid list-saved-setups ack from Hub", {
        error: parsed.error,
        ack,
      });
      return { setups: [] };
    }
    return parsed.data;
  }

  async deleteSavedSetup(
    savedSetupId: string,
  ): Promise<z.infer<typeof deleteSavedSetupAckSchema>> {
    const socket = this.getSocket();
    if (!socket) {
      // Local fallback: delete from file
      const setups = readLocalSetups();
      const idx = setups.findIndex((s) => s.id === savedSetupId);
      if (idx === -1) {
        return { success: false, error: "Not found", errorCode: "not_found" };
      }
      setups.splice(idx, 1);
      writeLocalSetups(setups);
      this.logger.info("Hub not connected — deleted local setup", { savedSetupId });
      return { success: true };
    }
    const envelope = wrapInEnvelope({ payload: { savedSetupId } });
    this.logger.debug("Sending delete-saved-setup to Hub", { savedSetupId });
    const ack = await socket.emitWithAck("delete-saved-setup", envelope);
    const parsed = deleteSavedSetupAckSchema.safeParse(ack);
    if (!parsed.success) {
      this.logger.error("Invalid delete-saved-setup ack from Hub", {
        error: parsed.error,
        ack,
      });
      return { success: false, error: "Invalid response from Hub" };
    }
    return parsed.data;
  }

  async updateSavedSetup(
    payload: WebappBoundPayloadOf<"update-saved-setup">,
  ): Promise<z.infer<typeof updateSavedSetupAckSchema>> {
    const socket = this.getSocket();
    if (!socket) {
      // Local fallback: update in file
      const setups = readLocalSetups();
      const idx = setups.findIndex((s) => s.id === payload.savedSetupId);
      if (idx === -1) {
        return { success: false, error: "Not found", errorCode: "not_found" };
      }
      const existing = setups[idx]!;
      const payloadPartial = payload as Record<string, unknown>;
      const updated: LocalSetup = {
        ...existing,
        ...payloadPartial,
        id: existing.id,
        description: (typeof payloadPartial["description"] === "string" ? payloadPartial["description"] : existing.description),
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      setups[idx] = updated;
      writeLocalSetups(setups);
      this.logger.info("Hub not connected — updated local setup", { savedSetupId: payload.savedSetupId });
      return { success: true, savedAt: new Date().toISOString() };
    }
    const envelope = wrapInEnvelope({ payload });
    this.logger.debug("Sending update-saved-setup to Hub", {
      savedSetupId: payload.savedSetupId,
    });
    const ack = await socket.emitWithAck("update-saved-setup", envelope);
    const parsed = updateSavedSetupAckSchema.safeParse(ack);
    if (!parsed.success) {
      this.logger.error("Invalid update-saved-setup ack from Hub", {
        error: parsed.error,
        ack,
      });
      return { success: false, error: "Invalid response from Hub" };
    }
    return parsed.data;
  }
}
