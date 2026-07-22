import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";

import { submitProof, type ProofInput } from "../features/proofs/api";

const KEY = "calledout.pending-proof-uploads.v2";
const LEGACY_KEY = "calledout.pending-proof-uploads.v1";
const ROOT = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}pending-proofs/`;

export type PendingProof = ProofInput & {
  submissionId: string;
  queuedAt: string;
  attempts: number;
};

async function readQueue(): Promise<PendingProof[]> {
  const raw = (await AsyncStorage.getItem(KEY)) ?? (await AsyncStorage.getItem(LEGACY_KEY));
  if (!raw) return [];

  try {
    const items = JSON.parse(raw) as PendingProof[];
    if (!(await AsyncStorage.getItem(KEY))) {
      await AsyncStorage.setItem(KEY, JSON.stringify(items));
      await AsyncStorage.removeItem(LEGACY_KEY);
    }
    return items;
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingProof[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

async function persistPhoto(uri: string, submissionId: string) {
  if (uri.startsWith(ROOT)) return uri;

  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
  const destination = `${ROOT}${submissionId}.jpg`;
  const existing = await FileSystem.getInfoAsync(destination);

  if (!existing.exists) {
    await FileSystem.copyAsync({ from: uri, to: destination });
  }

  return destination;
}

async function removePersistedPhoto(uri: string) {
  if (!uri.startsWith(ROOT)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function enqueueProof(input: ProofInput) {
  const queue = await readQueue();
  const submissionId = input.submissionId ?? Crypto.randomUUID();
  const existing = queue.find((item) => item.submissionId === submissionId);

  if (existing) return submissionId;

  const durableUri = await persistPhoto(input.uri, submissionId);
  queue.push({
    ...input,
    uri: durableUri,
    submissionId,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  await writeQueue(queue);
  return submissionId;
}

export async function retryPendingProofs() {
  const queue = await readQueue();
  if (!queue.length) return { completed: 0, remaining: 0 };

  const remaining: PendingProof[] = [];
  let completed = 0;

  for (const item of queue) {
    try {
      await submitProof(item);
      await removePersistedPhoto(item.uri);
      completed += 1;
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  await writeQueue(remaining);
  return { completed, remaining: remaining.length };
}
