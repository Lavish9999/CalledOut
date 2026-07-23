import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AppState,Platform } from 'react-native';
import { env } from './env';

const CHUNK_SIZE=1800;
const metaKey=(key:string)=>`${key}__meta`;
const chunkKey=(key:string,index:number)=>`${key}__${index}`;

async function secureSetItem(key:string,value:string){
  if(!(await SecureStore.isAvailableAsync()))return AsyncStorage.setItem(key,value);
  const previous=Number(await SecureStore.getItemAsync(metaKey(key))??0);
  const chunkCount=Math.max(1,Math.ceil(value.length/CHUNK_SIZE));
  const chunks=Array.from({length:chunkCount},(_,index)=>value.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE));
  await Promise.all(chunks.map((chunk,index)=>SecureStore.setItemAsync(chunkKey(key,index),chunk)));
  await SecureStore.setItemAsync(metaKey(key),String(chunks.length));
  if(previous>chunks.length)await Promise.all(Array.from({length:previous-chunks.length},(_,offset)=>SecureStore.deleteItemAsync(chunkKey(key,chunks.length+offset))));
  await AsyncStorage.removeItem(key);
}
const secureChunkStorage={
  async getItem(key:string){
    if(!(await SecureStore.isAvailableAsync()))return AsyncStorage.getItem(key);
    const rawCount=await SecureStore.getItemAsync(metaKey(key));
    if(rawCount){
      const count=Number(rawCount);if(!Number.isInteger(count)||count<1)return null;
      const chunks=await Promise.all(Array.from({length:count},(_,index)=>SecureStore.getItemAsync(chunkKey(key,index))));
      if(chunks.some(chunk=>chunk==null))return null;
      return chunks.join('');
    }
    const legacy=await AsyncStorage.getItem(key);
    if(legacy){await secureSetItem(key,legacy);await AsyncStorage.removeItem(key);}
    return legacy;
  },
  setItem:secureSetItem,
  async removeItem(key:string){
    if(!(await SecureStore.isAvailableAsync()))return AsyncStorage.removeItem(key);
    const count=Number(await SecureStore.getItemAsync(metaKey(key))??0);
    if(count>0)await Promise.all(Array.from({length:count},(_,index)=>SecureStore.deleteItemAsync(chunkKey(key,index))));
    await SecureStore.deleteItemAsync(metaKey(key));
    await AsyncStorage.removeItem(key);
  },
};

export const supabase=createClient(env.supabaseUrl,env.supabaseKey,{
  auth:{storage:Platform.OS==='web'?AsyncStorage:secureChunkStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,flowType:'pkce'},
});
if(Platform.OS!=='web')AppState.addEventListener('change',state=>state==='active'?supabase.auth.startAutoRefresh():supabase.auth.stopAutoRefresh());
