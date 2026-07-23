import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/domain';
import { clearPurchasesUser,configurePurchases,getProStatus } from '../lib/purchases';
import { analytics } from '../lib/analytics';

type Value={session:Session|null;profile:Profile|null;isPro:boolean;loading:boolean;refreshProfile:()=>Promise<void>;refreshEntitlement:()=>Promise<void>;signOut:()=>Promise<void>};
const C=createContext<Value|undefined>(undefined);

export function SessionProvider({children}:{children:React.ReactNode}){
  const[session,setSession]=useState<Session|null>(null);
  const[profile,setProfile]=useState<Profile|null>(null);
  const[isPro,setIsPro]=useState(false);
  const[loading,setLoading]=useState(true);

  const refreshProfile=useCallback(async()=>{
    const user=(await supabase.auth.getUser()).data.user;
    if(!user){setProfile(null);return;}
    const{data,error}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(error)throw error;
    setProfile(data as Profile|null);
  },[]);

  const refreshEntitlement=useCallback(async()=>{
    try{setIsPro((await getProStatus()).isPro);}catch{setIsPro(false);}
  },[]);

  useEffect(()=>{
    let mounted=true;
    async function apply(next:Session|null){
      if(!mounted)return;
      setSession(next);
      if(next){
        analytics.identify(next.user.id);
        await Promise.all([
          refreshProfile(),
          configurePurchases(next.user.id).then(refreshEntitlement).catch(()=>setIsPro(false)),
        ]);
      }else{
        setProfile(null);setIsPro(false);
      }
    }
    supabase.auth.getSession().then(({data})=>apply(data.session)).catch(()=>{}).finally(()=>mounted&&setLoading(false));
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(_event,next)=>{
      setLoading(true);
      try{await apply(next);}finally{if(mounted)setLoading(false);}
    });
    return()=>{mounted=false;subscription.unsubscribe();};
  },[refreshProfile,refreshEntitlement]);

  const value=useMemo(()=>({
    session,profile,isPro,loading,refreshProfile,refreshEntitlement,
    signOut:async()=>{await clearPurchasesUser();await supabase.auth.signOut();analytics.reset();},
  }),[session,profile,isPro,loading,refreshProfile,refreshEntitlement]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useSession(){const v=useContext(C);if(!v)throw new Error('SessionProvider missing');return v;}
