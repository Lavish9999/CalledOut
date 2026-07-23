import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

Deno.serve(async(req)=>{
  if(req.headers.get('authorization')!==`Bearer ${Deno.env.get('REVENUECAT_WEBHOOK_AUTH')}`)return new Response('Unauthorized',{status:401});
  const body=await req.json();const event=body.event;const userId=event?.app_user_id;const eventId=event?.id;
  if(!userId||!eventId)return new Response('Bad request',{status:400});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const expiresAt=event.expiration_at_ms?new Date(event.expiration_at_ms):null;
  const hasPaidTime=!expiresAt||expiresAt.getTime()>Date.now();
  const expired=event.type==='EXPIRATION'||!hasPaidTime;
  const entitlementActive=!expired;
  const status=event.type==='BILLING_ISSUE'?'billing_issue':event.type==='CANCELLATION'?'cancelled':expired?'expired':event.period_type==='TRIAL'?'trialing':'active';
  const {data:sub,error}=await admin.from('subscriptions').upsert({
    user_id:userId,revenuecat_customer_id:event.app_user_id,store:event.store,product_id:event.product_id,status,
    current_period_starts_at:event.purchased_at_ms?new Date(event.purchased_at_ms).toISOString():null,
    current_period_ends_at:expiresAt?.toISOString()??null,will_renew:event.will_renew,raw_event_id:eventId,
  },{onConflict:'raw_event_id'}).select('id').single();
  if(error){console.error(error);return new Response('Database error',{status:500});}
  const {error:entitlementError}=await admin.from('entitlements').upsert({
    user_id:userId,identifier:'pro',status:entitlementActive?'active':'inactive',expires_at:expiresAt?.toISOString()??null,source_subscription_id:sub.id,
  },{onConflict:'user_id,identifier'});
  if(entitlementError){console.error(entitlementError);return new Response('Entitlement error',{status:500});}
  return new Response('ok');
});
