import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

import { submitProof, type ProofInput } from "../features/proofs/api";
import { supabase } from "./supabase";

const KEY_PREFIX = "calledout.pending-proof-uploads.v3";
const LEGACY_KEYS = [
  "calledout.pending-proof-uploads.v2",
  "calledout.pending-proof-uploads.v1",
];
const LEGACY_CLEANED_KEY = "calledout.pending-proof-uploads.legacy-cleaned";
const ROOT = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}pending-proofs/`;
const MAX_ATTEMPTS = 6;
const MAX_RETENTION_MS = 24 * 60 * 60 * 1000;

export type PendingProof = ProofInput & {
  ownerUserId: string;
  submissionId: string;
  queuedAt: string;
  expiresAt: string;
  attempts: number;
};

function queueKey(userId: string) {
  return `${KEY_PREFIX}.${userId}`;
}

function userRoot(userId: string) {
  return `${ROOT}${userId}/`;
}

async function currentUserId() {
  const user = (await supabase.auth.getUser()).data.user;
  return user?.id ?? null;
}

async function cleanLegacyQueue() {
  if ((await AsyncStorage.getItem(LEGACY_CLEANED_KEY)) === "true") return;

  await AsyncStorage.multiRemove(LEGACY_KEYS);

  const rootInfo = await FileSystem.getInfoAsync(ROOT);
  if (rootInfo.exists) {
    const entries = await FileSystem.readDirectoryAsync(ROOT).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.toLowerCase().endsWith(".jpg"))
        .map((entry) =>
          FileSystem.deleteAsync(`${ROOT}${entry}`, { idempotent: true }),
        ),
    );
  }

  await AsyncStorage.setItem(LEGACY_CLEANED_KEY, "true");
}

async function readQueue(userId: string): Promise<PendingProof[]> {
  await cleanLegacyQueue();
  const raw = await AsyncStorage.getItem(queueKey(userId));
  if (!raw) return [];

  try {
    const items = JSON.parse(raw) as PendingProof[];
    return items.filter(
      (item) =>
        item.ownerUserId === userId &&
        typeof item.submissionId === "string" &&
        typeof item.uri === "string",
    );
  } catch {
    await AsyncStorage.removeItem(queueKey(userId));
    return [];
  }
}

async function writeQueue(userId: string, items: PendingProof[]) {
  if (!items.length) {
    await AsyncStorage.removeItem(queueKey(userId));
    return;
  }

  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(items));
}

async function persistPhoto(
  uri: string,
  userId: string,
  submissionId: string,
) {
  const directory = userRoot(userId);
  if (uri.startsWith(directory)) return uri;

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${submissionId}.jpg`;
  const existing = await FileSystem.getInfoAsync(destination);

  if (!existing.exists) {
    await FileSystem.copyAsync({ from: uri, to: destination });
  }

  return destination;
}

async function removePersistedPhoto(uri: string, userId: string) {
  if (!uri.startsWith(userRoot(userId))) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

function terminalProofError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "outside the allowed proof window",
    "proof window has closed",
    "commitment not found",
    "proof not found",
    "already verified",
    "account is restricted",
  ].some((value) => message.includes(value));
}

export async function enqueueProof(input: ProofInput) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not authenticated");

  const queue = await readQueue(userId);
  const submissionId = input.submissionId ?? Crypto.randomUUID();
  const existing = queue.find((item) => item.submissionId === submissionId);

  if (existing) return submissionId;

  const durableUri = await persistPhoto(input.uri, userId, submissionId);
  const queuedAt = new Date();

  queue.push({
    ...input,
    ownerUserId: userId,
    uri: durableUri,
    submissionId,
    queuedAt: queuedAt.toISOString(),
    expiresAt: new Date(queuedAt.getTime() + MAX_RETENTION_MS).toISOString(),
    attempts: 0,
  });
  await writeQueue(userId, queue);
  return submissionId;
}

export async function retryPendingProofs() {
  const userId = await currentUserId();
  if (!userId) return { completed: 0, discarded: 0, remaining: 0 };

  const queue = await readQueue(userId);
  if (!queue.length) return { completed: 0, discarded: 0, remaining: 0 };

  const remaining: PendingProof[] = [];
  let completed = 0;
  let discarded = 0;
  const now = Date.now();

  for (const item of queue) {
    const expired = new Date(item.expiresAt).getTime() <= now;
    if (expired || item.attempts >= MAX_ATTEMPTS) {
      await removePersistedPhoto(item.uri, userId);
      discarded += 1;
      continue;
    }

    try {
      await submitProof(item);
      await removePersistedPhoto(item.uri, userId);
      completed += 1;
    } catch (error) {
      if (terminalProofError(error)) {
        await removePersistedPhoto(item.uri, userId);
        discarded += 1;
      } else {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
  }

  await writeQueue(userId, remaining);
  return { completed, discarded, remaining: remaining.length };
}

export async function clearPendingProofs(userId: string) {
  const queue = await readQueue(userId);
  await Promise.all(
    queue.map((item) => removePersistedPhoto(item.uri, userId)),
  );
  await AsyncStorage.removeItem(queueKey(userId));
  await FileSystem.deleteAsync(userRoot(userId), { idempotent: true });
}
