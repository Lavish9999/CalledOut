import { supabase } from '../../lib/supabase';
import type { Commitment, CommitmentSchedule, ProofMethod, WorkoutType } from '../../types/domain';

export type CommitmentPlanInput={
  title:string;
  workout_type:WorkoutType;
  recurrence:'one_time'|'weekly';
  days_of_week:number[];
  commitment_date:string;
  deadline_hour:number;
  deadline_minute:number;
  minimum_duration_minutes:number;
  proof_method:ProofMethod;
  requires_location:boolean;
  circle_id?:string|null;
  proof_window_minutes:number;
  consequence:string;
  redemption_window_hours:number;
};

function localDateKey(value:Date){const year=value.getFullYear();const month=String(value.getMonth()+1).padStart(2,'0');const day=String(value.getDate()).padStart(2,'0');return `${year}-${month}-${day}`;}

export async function getTodayCommitments(){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
  const now=new Date();
  const from=new Date(now.getTime()-24*60*60*1000);
  const through=new Date(now.getTime()+48*60*60*1000);
  const activeStatuses=['proof_window_open','proof_submitted','under_review','redemption_available'];
  const [windowResult,activeResult]=await Promise.all([
    supabase.from('commitments').select('*,circle:circles(id,name)').eq('user_id',user.id).gte('deadline_at',from.toISOString()).lt('deadline_at',through.toISOString()).order('deadline_at'),
    supabase.from('commitments').select('*,circle:circles(id,name)').eq('user_id',user.id).in('status',activeStatuses).is('deleted_at',null).order('deadline_at'),
  ]);
  if(windowResult.error)throw windowResult.error;
  if(activeResult.error)throw activeResult.error;
  const merged=new Map<string,Commitment>();
  for(const item of [...(windowResult.data??[]),...(activeResult.data??[])] as unknown as Commitment[])merged.set(item.id,item);
  const localDate=localDateKey(now);
  return [...merged.values()].filter(item=>{
    const active=activeStatuses.includes(item.status);
    const itemDate=localDateKey(new Date(item.deadline_at));
    return item.deleted_at==null&&(active||itemDate===localDate);
  }).sort((a,b)=>new Date(a.deadline_at).getTime()-new Date(b.deadline_at).getTime());
}

export async function getCommitment(id:string){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
  const {data,error}=await supabase.from('commitments').select('*,circle:circles(id,name)').eq('id',id).eq('user_id',user.id).single();
  if(error)throw error;
  return data as unknown as Commitment;
}

export async function createCommitmentPlan(input:CommitmentPlanInput){
  const {data,error}=await supabase.rpc('create_commitment_plan',{
    p_title:input.title,
    p_workout_type:input.workout_type,
    p_recurrence:input.recurrence,
    p_days_of_week:input.days_of_week,
    p_commitment_date:input.commitment_date,
    p_deadline_hour:input.deadline_hour,
    p_deadline_minute:input.deadline_minute,
    p_minimum_duration:input.minimum_duration_minutes,
    p_proof_method:input.proof_method,
    p_requires_location:input.requires_location,
    p_circle_id:input.circle_id??null,
    p_proof_window_minutes:input.proof_window_minutes,
    p_consequence:input.consequence,
    p_redemption_window_hours:input.redemption_window_hours,
  });
  if(error)throw error;
  return data as string;
}

export async function createRecurringCommitment(input:{title:string;workout_type:WorkoutType;days_of_week:number[];deadline_hour:number;deadline_minute?:number;minimum_duration_minutes:number;proof_method:ProofMethod;requires_location:boolean;circle_id?:string|null}){
  return createCommitmentPlan({
    ...input,
    recurrence:'weekly',
    commitment_date:localDateKey(new Date()),
    deadline_minute:input.deadline_minute??0,
    proof_window_minutes:240,
    consequence:'Complete a verified 30-minute redemption workout',
    redemption_window_hours:24,
  });
}

export async function getAvailableGracePasses(){
  const {count,error}=await supabase.from('grace_passes').select('id',{count:'exact',head:true}).is('used_at',null).gt('expires_at',new Date().toISOString());
  if(error)throw error;
  return count??0;
}

export async function useGracePass(commitmentId:string,action:'extend'|'excuse'){
  const {error}=await supabase.rpc('use_grace_pass',{p_commitment_id:commitmentId,p_use_type:action,p_extend_minutes:60});
  if(error)throw error;
}


export async function getCommitmentSchedules(){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
  const{data,error}=await supabase.from('commitment_schedules').select('*,circle:circles(id,name)').eq('user_id',user.id).is('deleted_at',null).order('created_at',{ascending:false});
  if(error)throw error;return (data??[]) as unknown as CommitmentSchedule[];
}
export async function setCommitmentScheduleActive(scheduleId:string,isActive:boolean){const{error}=await supabase.rpc('set_schedule_active',{p_schedule_id:scheduleId,p_active:isActive});if(error)throw error;}
export async function deleteCommitmentSchedule(scheduleId:string){const{error}=await supabase.rpc('delete_schedule',{p_schedule_id:scheduleId});if(error)throw error;}

/** Compatibility alias for the detailed commitment route. */
export async function getCommitmentDetail(id:string):Promise<Commitment & Record<string,any>>{
  return getCommitment(id) as Promise<Commitment & Record<string,any>>;
}

/**
 * Ends future occurrences for a schedule. Accepts either a schedule id or an
 * object containing scheduleId/id so older and newer screens can share it.
 */
export async function endCommitmentSchedule(...args:any[]){
  const input=args[0] as string|{scheduleId?:string;id?:string};
  const scheduleId=typeof input==='string'?input:String(input?.scheduleId??input?.id??'');
  if(!scheduleId)throw new Error('Schedule id is required.');
  return deleteCommitmentSchedule(scheduleId);
}
