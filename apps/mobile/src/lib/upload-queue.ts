import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { submitProof, type ProofInput } from "../features/proofs/api";

const KEY = "calledout.pending-proof-uploads.v1";
export type PendingProof = ProofInput & {
  submissionId: string;
  queuedAt: string;
  attempts: number;
};

async function readQueue(): Promise<PendingProof[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingProof[];
  } catch {
    return [];
  }
}
async function writeQueue(items: PendingProof[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function enqueueProof(input: ProofInput) {
  const queue = await readQueue();
  const submissionId = input.submissionId ?? Crypto.randomUUID();
  if (!queue.some((item) => item.submissionId === submissionId)) {
    queue.push({
      ...input,
      submissionId,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
    await writeQueue(queue);
  }
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
      completed += 1;
    } catch {
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }
  await writeQueue(remaining);
  return { completed, remaining: remaining.length };
}
