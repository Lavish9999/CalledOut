import { supabase } from '../../lib/supabase';
import type { AccountabilityInsights, Commitment, Profile } from '../../types/domain';

export async function completeProfile(input:{display_name:string;username:string;bio?:string;timezone:string;workout_types:string[]}){const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');const{error}=await supabase.from('profiles').upsert({id:user.id,...input,username:input.username.toLowerCase(),updated_at:new Date().toISOString()});if(error)throw error;const{error:notificationError}=await supabase.from('notification_preferences').update({timezone:input.timezone}).eq('user_id',user.id);if(notificationError)throw notificationError;}
export async function finishOnboarding(){const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');const{error}=await supabase.from('profiles').update({onboarding_completed_at:new Date().toISOString()}).eq('id',user.id);if(error)throw error;}
export async function getMemberProfile(id:string){const{data,error}=await supabase.from('profiles').select('*').eq('id',id).single();if(error)throw error;return data as unknown as Profile;}
export async function blockMember(id:string){const{error}=await supabase.rpc('block_member',{p_user_id:id});if(error)throw error;}
export async function reportMember(id:string,reason:string,details?:string){const{error}=await supabase.rpc('report_member',{p_user_id:id,p_reason:reason,p_details:details??null});if(error)throw error;}

export async function getAccountabilityInsights():Promise<AccountabilityInsights>{
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
  const [commitmentsResult,redemptionsResult]=await Promise.all([
    supabase.from('commitments').select('id,status,deadline_at').eq('user_id',user.id).is('deleted_at',null).in('status',['verified','missed','redeemed','rejected']).order('deadline_at'),
    supabase.from('redemptions').select('redemption_commitment_id').eq('user_id',user.id),
  ]);
  if(commitmentsResult.error)throw commitmentsResult.error;if(redemptionsResult.error)throw redemptionsResult.error;
  const childIds=new Set((redemptionsResult.data??[]).map(row=>row.redemption_commitment_id).filter(Boolean));
  const rows=(commitmentsResult.data??[]).filter(row=>!childIds.has(row.id));
  const verified=rows.filter(row=>row.status==='verified').length;
  const redeemed=rows.filter(row=>row.status==='redeemed').length;
  const missed=rows.length-verified;
  const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayStats=new Map<number,{total:number;verified:number}>();
  for(const row of rows){const day=new Date(row.deadline_at).getDay();const current=dayStats.get(day)??{total:0,verified:0};current.total+=1;if(row.status==='verified')current.verified+=1;dayStats.set(day,current);}
  const ranked=[...dayStats.entries()].filter(([,stats])=>stats.total>0).sort((a,b)=>(b[1].verified/b[1].total)-(a[1].verified/a[1].total));
  const now=new Date();const weeks=Array.from({length:8},(_,reverseIndex)=>{const offset=7-reverseIndex;const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-start.getDay()-(offset*7));const end=new Date(start);end.setDate(end.getDate()+7);const items=rows.filter(row=>{const date=new Date(row.deadline_at);return date>=start&&date<end;});const completed=items.filter(row=>row.status==='verified').length;return{label:start.toLocaleDateString(undefined,{month:'short',day:'numeric'}),verified:completed,missed:items.length-completed,rate:items.length?Math.round((completed/items.length)*100):0};});
  return{total:rows.length,verified,missed,redeemed,onTimeRate:rows.length?Math.round((verified/rows.length)*100):100,strongestDay:ranked[0]?dayNames[ranked[0][0]]:null,weakestDay:ranked.length>1?dayNames[ranked[ranked.length-1][0]]:ranked[0]?dayNames[ranked[0][0]]:null,weeks};
}

export async function getCommitmentHistory(..._args:any[]):Promise<Commitment[]> {
  const user=(await supabase.auth.getUser()).data.user;
  if(!user)throw new Error('Not authenticated');

  const [commitmentsResult,redemptionsResult]=await Promise.all([
    supabase
      .from('commitments')
      .select('*,circle:circles(id,name)')
      .eq('user_id',user.id)
      .is('deleted_at',null)
      .order('deadline_at',{ascending:false}),
    supabase
      .from('redemptions')
      .select('redemption_commitment_id')
      .eq('user_id',user.id),
  ]);

  if(commitmentsResult.error)throw commitmentsResult.error;
  if(redemptionsResult.error)throw redemptionsResult.error;

  const redemptionCommitmentIds=new Set(
    (redemptionsResult.data??[])
      .map(row=>row.redemption_commitment_id)
      .filter((id):id is string=>typeof id==='string'),
  );

  return (commitmentsResult.data??[]).map(row=>({
    ...(row as unknown as Commitment),
    isRedemption:redemptionCommitmentIds.has(row.id),
  }));
}
