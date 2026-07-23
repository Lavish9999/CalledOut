import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const categoryPreference:Record<string,string>={
  morning_reminder:'morning_reminder',two_hour_warning:'two_hour_warning',thirty_minute_warning:'thirty_minute_warning',
  proof_window_opened:'proof_window_opened',proof_results:'proof_results',commitment_missed:'commitment_missed',
  redemption_warning:'redemption_warning',social_activity:'social_activity',review_required:'review_required',
};
function minutes(value?:string|null){if(!value)return null;const [h,m]=value.split(':').map(Number);return h*60+m;}
const urgentCategories=new Set(['commitment_missed','proof_results','review_required','redemption_completed']);
function inQuietHours(timezone:string,start?:string|null,end?:string|null){
  const s=minutes(start),e=minutes(end);if(s==null||e==null)return false;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
  const now=Number(parts.find(p=>p.type==='hour')?.value??0)*60+Number(parts.find(p=>p.type==='minute')?.value??0);
  return s<=e?now>=s&&now<e:now>=s||now<e;
}

Deno.serve(async(req)=>{
  const secret=Deno.env.get('NOTIFICATION_JOB_SECRET');
  if(!secret||req.headers.get('x-job-secret')!==secret)return new Response('Unauthorized',{status:401});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const{data:jobs,error}=await admin.from('notification_outbox').select('*').eq('status','pending').lte('deliver_after',new Date().toISOString()).lt('attempts',5).limit(100);
  if(error)return new Response(error.message,{status:500});
  let sent=0,failed=0,cancelled=0,deferred=0;
  for(const job of jobs??[]){
    const{data:pref}=await admin.from('notification_preferences').select('*').eq('user_id',job.user_id).maybeSingle();
    const prefKey=categoryPreference[job.category];
    if(prefKey&&pref?.[prefKey]===false){await admin.from('notification_outbox').update({status:'cancelled',last_error:'Disabled by notification preferences'}).eq('id',job.id);cancelled++;continue;}
    if(pref&&!urgentCategories.has(job.category)&&inQuietHours(pref.timezone,pref.quiet_hours_start,pref.quiet_hours_end)){await admin.from('notification_outbox').update({deliver_after:new Date(Date.now()+60*60_000).toISOString(),last_error:'Deferred for quiet hours'}).eq('id',job.id);deferred++;continue;}
    const{data:tokens}=await admin.from('push_tokens').select('token').eq('user_id',job.user_id).is('invalidated_at',null);
    if(!tokens?.length){await admin.from('notification_outbox').update({status:'cancelled',last_error:'No active push token'}).eq('id',job.id);cancelled++;continue;}
    const messages=tokens.map(({token})=>({to:token,sound:'default',title:job.title,body:job.body,data:job.data,channelId:'commitments'}));
    try{
      const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(messages)});
      if(!response.ok)throw new Error(await response.text());
      await admin.from('notification_outbox').update({status:'sent',sent_at:new Date().toISOString(),attempts:job.attempts+1,last_error:null}).eq('id',job.id);sent++;
    }catch(e){
      await admin.from('notification_outbox').update({status:job.attempts>=4?'failed':'pending',attempts:job.attempts+1,last_error:e instanceof Error?e.message:'Push error'}).eq('id',job.id);failed++;
    }
  }
  return new Response(JSON.stringify({sent,failed,cancelled,deferred}),{headers:{'content-type':'application/json'}});
});
