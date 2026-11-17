import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { OfflineInterviewSnapshot } from "../types/database";
import {
  clearOfflineUserData,
  enqueueOfflineInterviewMessage,
  markOfflineInterviewOperationConflict,
  readOfflineInterview,
  removeOfflineInterviewOperation,
  saveOfflineInterview,
} from "./offlineInterviews";

const userId = "private-user";
const sessionId = "session-1";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

function snapshot(): OfflineInterviewSnapshot {
  return {
    session: {
      id: sessionId,
      contract_id: sessionId,
      state: "COLLECTING_CONDITIONS",
      fields: { private_field: "secret value" },
      missing_fields: [],
      progress: 50,
      version: 5,
    },
    contract: { id: sessionId, title: "Confidential agreement", template_id: "template-1" },
    template: {
      id: "template-1",
      slug: "service",
      name: "Service agreement",
      description: "",
      category: "services",
      version: 1,
      fields: [],
      clauses: [],
      updated_at: "2026-01-01T00:00:00Z",
    },
    messages: [{
      id: "message-1",
      session_id: sessionId,
      role: "assistant",
      content: "private conversation",
      created_at: "2026-01-01T00:00:00Z",
    }],
    outbox: [],
    cached_at: "2026-01-01T00:00:00Z",
  };
}

afterEach(async () => {
  await clearOfflineUserData(userId);
});

describe("encrypted offline interview storage", () => {
  it("round-trips an interview without storing its private text in plaintext", async () => {
    const data = snapshot();
    await saveOfflineInterview(userId, data);
    expect(await readOfflineInterview(userId, sessionId)).toMatchObject({
      ...data,
      cached_at: expect.any(String),
    });

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("contratta-ai-offline", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction("records").objectStore("records").get(`${userId}:${sessionId}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    expect(JSON.stringify(stored)).not.toContain("Confidential agreement");
    expect(JSON.stringify(stored)).not.toContain("private conversation");
  });

  it("orders queued answers by session version and preserves conflicts until resolved", async () => {
    await saveOfflineInterview(userId, snapshot());
    const [first, second] = await Promise.all([
      enqueueOfflineInterviewMessage(userId, sessionId, "first answer", 5),
      enqueueOfflineInterviewMessage(userId, sessionId, "second answer", 5),
    ]);
    expect([first.expected_version, second.expected_version]).toEqual([5, 6]);
    await saveOfflineInterview(userId, snapshot());
    expect((await readOfflineInterview(userId, sessionId))?.outbox).toHaveLength(2);

    await markOfflineInterviewOperationConflict(userId, sessionId, first.id);
    expect((await readOfflineInterview(userId, sessionId))?.outbox[0].status).toBe("conflict");
    await expect(enqueueOfflineInterviewMessage(userId, sessionId, "third answer", 5))
      .rejects.toThrow("Resolva a resposta pendente");
    await removeOfflineInterviewOperation(userId, sessionId, first.id);
    expect((await readOfflineInterview(userId, sessionId))?.outbox).toEqual([second]);
  });

  it("does not lose an offline answer when a fresh server snapshot is saved concurrently", async () => {
    await saveOfflineInterview(userId, snapshot());
    await Promise.all([
      saveOfflineInterview(userId, snapshot()),
      enqueueOfflineInterviewMessage(userId, sessionId, "offline answer", 5),
    ]);

    expect((await readOfflineInterview(userId, sessionId))?.outbox.map(({ message }) => message))
      .toEqual(["offline answer"]);
  });

  it("clears the encrypted cache and key when the user signs out", async () => {
    await saveOfflineInterview(userId, snapshot());
    await clearOfflineUserData(userId);
    expect(await readOfflineInterview(userId, sessionId)).toBeNull();
  });
});
