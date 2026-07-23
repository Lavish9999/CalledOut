import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
Deno.serve(async(req)=>{
 const secret=Deno.env.get('ACCOUNT_DELETION_JOB_SECRET');if(!secret||req.headers.get('x-job-secret')!==secret)return new Response('Unauthorized',{status:401});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const{data:requests,error}=await admin.from('account_deletion_requests').select('id,user_id').is('cancelled_at',null).is('completed_at',null).lte('scheduled_for',new Date().toISOString()).limit(50);if(error)return new Response(error.message,{status:500});
 let completed=0;
 for(const item of requests??[]){const result=await admin.auth.admin.deleteUser(item.user_id,false);if(result.error){console.error(result.error);continue;}await admin.from('account_deletion_requests').update({completed_at:new Date().toISOString()}).eq('id',item.id);completed++;}
 return new Response(JSON.stringify({completed}),{headers:{'content-type':'application/json'}});
});
