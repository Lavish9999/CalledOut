import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { submitProof,type ProofInput } from '../features/proofs/api';
import { queryClient } from './query';

const KEY='calledout.pending-proof-uploads.v2';
const DIRECTORY=FileSystem.documentDirectory?`${FileSystem.documentDirectory}calledout-proof-queue/`:'';
export type PendingProof=ProofInput&{submissionId:string;queuedAt:string;attempts:number};

async function ensureDirectory(){if(!DIRECTORY)throw new Error('Durable proof storage is unavailable on this device.');const info=await FileSystem.getInfoAsync(DIRECTORY);if(!info.exists)await FileSystem.makeDirectoryAsync(DIRECTORY,{intermediates:true});}
async function readQueue():Promise<PendingProof[]>{const raw=await AsyncStorage.getItem(KEY);if(!raw)return[];try{return JSON.parse(raw) as PendingProof[];}catch{return[];}}
async function writeQueue(items:PendingProof[]){await AsyncStorage.setItem(KEY,JSON.stringify(items));}
async function deleteLocal(uri:string){if(!uri.startsWith(DIRECTORY))return;try{await FileSystem.deleteAsync(uri,{idempotent:true});}catch{}}

export async function enqueueProof(input:ProofInput){
  const queue=await readQueue();
  const submissionId=input.submissionId??Crypto.randomUUID();
  if(queue.some(item=>item.submissionId===submissionId))return submissionId;
  await ensureDirectory();
  const durableUri=`${DIRECTORY}${submissionId}.jpg`;
  if(input.uri!==durableUri)await FileSystem.copyAsync({from:input.uri,to:durableUri});
  queue.push({...input,uri:durableUri,submissionId,queuedAt:new Date().toISOString(),attempts:0});
  await writeQueue(queue);
  return submissionId;
}

export async function retryPendingProofs(){
  const queue=await readQueue();
  if(!queue.length)return{completed:0,remaining:0};
  const remaining:PendingProof[]=[];let completed=0;
  for(const item of queue){
    try{await submitProof(item);await deleteLocal(item.uri);completed+=1;}
    catch{remaining.push({...item,attempts:item.attempts+1});}
  }
  await writeQueue(remaining);
  if(completed){await Promise.all([queryClient.invalidateQueries({queryKey:['today']}),queryClient.invalidateQueries({queryKey:['wall']})]);}
  return{completed,remaining:remaining.length};
}
