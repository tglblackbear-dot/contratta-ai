import type { OfflineInterviewOperation, OfflineInterviewSnapshot } from "../types/database";

const DATABASE_NAME = "contratta-ai-offline";
const DATABASE_VERSION = 1;
const KEY_STORE = "keys";
const RECORD_STORE = "records";

interface KeyRecord {
  user_id: string;
  key: CryptoKey;
}

interface EncryptedRecord {
  id: string;
  user_id: string;
  iv: number[];
  ciphertext: ArrayBuffer;
}

const recordLocks = new Map<string, Promise<void>>();

function openDatabase() {
  if (!("indexedDB" in globalThis) || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error("Este navegador não oferece armazenamento offline criptografado."));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE, { keyPath: "user_id" });
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const records = database.createObjectStore(RECORD_STORE, { keyPath: "id" });
        records.createIndex("user_id", "user_id", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("A transação offline falhou."));
    transaction.onabort = () => reject(transaction.error ?? new Error("A transação offline foi cancelada."));
  });
}

async function getOrCreateKey(database: IDBDatabase, userId: string) {
  const readTransaction = database.transaction(KEY_STORE, "readonly");
  const existing = await new Promise<KeyRecord | undefined>((resolve, reject) => {
    const request = readTransaction.objectStore(KEY_STORE).get(userId);
    request.onsuccess = () => resolve(request.result as KeyRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível ler a chave offline."));
  });
  if (existing) return existing.key;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const writeTransaction = database.transaction(KEY_STORE, "readwrite");
  const committed = transactionComplete(writeTransaction);
  writeTransaction.objectStore(KEY_STORE).add({ user_id: userId, key } satisfies KeyRecord);
  try {
    await committed;
    return key;
  } catch {
    const retryTransaction = database.transaction(KEY_STORE, "readonly");
    const winner = await new Promise<KeyRecord | undefined>((resolve, reject) => {
      const request = retryTransaction.objectStore(KEY_STORE).get(userId);
      request.onsuccess = () => resolve(request.result as KeyRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível recuperar a chave offline."));
    });
    if (winner) return winner.key;
    throw new Error("Não foi possível criar uma chave de armazenamento offline.");
  }
}

function recordId(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`;
}

async function readRecord(database: IDBDatabase, userId: string, sessionId: string) {
  const transaction = database.transaction(RECORD_STORE, "readonly");
  return new Promise<EncryptedRecord | undefined>((resolve, reject) => {
    const request = transaction.objectStore(RECORD_STORE).get(recordId(userId, sessionId));
    request.onsuccess = () => {
      const record = request.result as EncryptedRecord | undefined;
      resolve(record?.user_id === userId ? record : undefined);
    };
    request.onerror = () => reject(request.error ?? new Error("Não foi possível ler o cache offline."));
  });
}

async function decryptRecord<T>(database: IDBDatabase, record: EncryptedRecord) {
  const key = await getOrCreateKey(database, record.user_id);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(record.iv) },
    key,
    record.ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function writeRecord(database: IDBDatabase, userId: string, sessionId: string, value: OfflineInterviewSnapshot) {
  const key = await getOrCreateKey(database, userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const transaction = database.transaction(RECORD_STORE, "readwrite");
  const committed = transactionComplete(transaction);
  transaction.objectStore(RECORD_STORE).put({
    id: recordId(userId, sessionId),
    user_id: userId,
    iv: Array.from(iv),
    ciphertext,
  } satisfies EncryptedRecord);
  await committed;
}

async function withUserLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const id = `user:${userId}`;
  const previous = recordLocks.get(id) ?? Promise.resolve();
  const run = () => {
    const lockManager = typeof navigator === "undefined" ? undefined : navigator.locks;
    return lockManager
      ? lockManager.request(`contratta-offline:${userId}`, { mode: "exclusive" }, action)
      : action();
  };
  const current = previous.then(run, run);
  const lock = current.then(() => undefined, () => undefined);
  recordLocks.set(id, lock);
  try {
    return await current;
  } finally {
    if (recordLocks.get(id) === lock) recordLocks.delete(id);
  }
}

export async function readOfflineInterview(userId: string, sessionId: string) {
  const database = await openDatabase();
  try {
    const record = await readRecord(database, userId, sessionId);
    return record ? await decryptRecord<OfflineInterviewSnapshot>(database, record) : null;
  } finally {
    database.close();
  }
}

export async function saveOfflineInterview(userId: string, snapshot: OfflineInterviewSnapshot) {
  return withUserLock(userId, async () => {
    const database = await openDatabase();
    try {
      const existing = await readRecord(database, userId, snapshot.session.id);
      const previous = existing ? await decryptRecord<OfflineInterviewSnapshot>(database, existing) : null;
      await writeRecord(database, userId, snapshot.session.id, {
        ...snapshot,
        outbox: previous?.outbox ?? [],
        cached_at: new Date().toISOString(),
      });
    } finally {
      database.close();
    }
  });
}

export async function enqueueOfflineInterviewMessage(
  userId: string,
  sessionId: string,
  message: string,
  baseVersion: number,
  operationId = crypto.randomUUID(),
) {
  return withUserLock(userId, async () => {
    const database = await openDatabase();
    try {
      const record = await readRecord(database, userId, sessionId);
      if (!record) throw new Error("Abra esta entrevista enquanto estiver online antes de usá-la offline.");
      const snapshot = await decryptRecord<OfflineInterviewSnapshot>(database, record);
      if (snapshot.outbox.some((operation) => operation.status === "conflict")) {
        throw new Error("Resolva a resposta pendente antes de adicionar outra resposta offline.");
      }
      const previous = snapshot.outbox[snapshot.outbox.length - 1];
      const operation: OfflineInterviewOperation = {
        id: operationId,
        session_id: sessionId,
        message,
        expected_version: previous ? previous.expected_version + 1 : baseVersion,
        created_at: new Date().toISOString(),
        status: "queued",
      };
      await writeRecord(database, userId, sessionId, {
        ...snapshot,
        outbox: [...snapshot.outbox, operation],
        cached_at: new Date().toISOString(),
      });
      return operation;
    } finally {
      database.close();
    }
  });
}

async function updateOutbox(
  userId: string,
  sessionId: string,
  update: (snapshot: OfflineInterviewSnapshot) => OfflineInterviewSnapshot,
) {
  return withUserLock(userId, async () => {
    const database = await openDatabase();
    try {
      const record = await readRecord(database, userId, sessionId);
      if (!record) return;
      const snapshot = await decryptRecord<OfflineInterviewSnapshot>(database, record);
      await writeRecord(database, userId, sessionId, update(snapshot));
    } finally {
      database.close();
    }
  });
}

export function removeOfflineInterviewOperation(userId: string, sessionId: string, operationId: string) {
  return updateOutbox(userId, sessionId, (snapshot) => ({
    ...snapshot,
    outbox: snapshot.outbox.filter((operation) => operation.id !== operationId),
    cached_at: new Date().toISOString(),
  }));
}

export function markOfflineInterviewOperationConflict(userId: string, sessionId: string, operationId: string) {
  return updateOutbox(userId, sessionId, (snapshot) => ({
    ...snapshot,
    outbox: snapshot.outbox.map((operation) =>
      operation.id === operationId ? { ...operation, status: "conflict" } : operation
    ),
    cached_at: new Date().toISOString(),
  }));
}

export async function clearOfflineUserData(userId: string) {
  return withUserLock(userId, async () => {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([KEY_STORE, RECORD_STORE], "readwrite");
      const committed = transactionComplete(transaction);
      transaction.objectStore(KEY_STORE).delete(userId);
      const records = transaction.objectStore(RECORD_STORE);
      const request = records.index("user_id").getAllKeys(userId);
      request.onsuccess = () => {
        for (const key of request.result) records.delete(key);
      };
      request.onerror = () => transaction.abort();
      await committed;
    } finally {
      database.close();
    }
  });
}
