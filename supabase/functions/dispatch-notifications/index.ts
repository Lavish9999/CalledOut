import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
Deno.serve(async(req)=>{
 const secret=Deno.env.get('DEADLINE_JOB_SECRET');if(!secret||req.headers.get('x-job-secret')!==secret)return new Response('Unauthorized',{status:401});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const{data:jobs,error}=await admin.from('notification_outbox').select('*').eq('status','pending').lte('deliver_after',new Date().toISOString()).lt('attempts',5).limit(100);if(error)return new Response(error.message,{status:500});
 let sent=0,failed=0;
 for(const job of jobs??[]){
  const{data:tokens}=await admin.from('push_tokens').select('token').eq('user_id',job.user_id).is('invalidated_at',null);
  if(!tokens?.length){await admin.from('notification_outbox').update({status:'cancelled',last_error:'No active push token'}).eq('id',job.id);continue;}
  const messages=tokens.map(({token})=>({to:token,sound:'default',title:job.title,body:job.body,data:job.data,channelId:'commitments'}));
  try{const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(messages)});if(!response.ok)throw new Error(await response.text());await admin.from('notification_outbox').update({status:'sent',sent_at:new Date().toISOString(),attempts:job.attempts+1}).eq('id',job.id);sent++;}
  catch(e){await admin.from('notification_outbox').update({status:job.attempts>=4?'failed':'pending',attempts:job.attempts+1,last_error:e instanceof Error?e.message:'Push error'}).eq('id',job.id);failed++;}
 }
 return new Response(JSON.stringify({sent,failed}),{headers:{'content-type':'application/json'}});
});
