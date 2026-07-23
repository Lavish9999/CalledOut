import { supabase } from '../../lib/supabase';
import type { MemberWallDetail, Profile, WallEntry, WallMiss, WallMissDetail, WallPeriod } from '../../types/domain';

function cutoff(period:WallPeriod){
  const date=new Date();
  if(period==='week'){
    const day=date.getDay();
    date.setDate(date.getDate()-day);
    date.setHours(0,0,0,0);
    return date.toISOString();
  }
  if(period==='month'){
    date.setDate(1);
    date.setHours(0,0,0,0);
    return date.toISOString();
  }
  return null;
}

export async function getWall(circleId?:string,period:WallPeriod='week'):Promise<WallEntry[]>{
  let query=supabase.from('wall_miss_details').select('*').order('missed_at',{ascending:false});
  if(circleId)query=query.eq('circle_id',circleId);
  const after=cutoff(period);
  if(after)query=query.gte('missed_at',after);
  const {data,error}=await query;
  if(error)throw error;
  const misses=(data??[]) as unknown as WallMiss[];
  const grouped=new Map<string,WallEntry>();
  for(const miss of misses){
    const current=grouped.get(miss.user_id);
    if(!current){
      grouped.set(miss.user_id,{
        id:miss.missed_id,
        user_id:miss.user_id,
        circle_id:miss.circle_id,
        missed_count:1,
        most_recent_missed_at:miss.missed_at,
        completion_rate:Number(miss.completion_rate),
        redemption_in_progress:miss.redemption_status==='in_progress',
        redeemed_count:miss.redeemed_at?1:0,
        reaction_count:miss.reaction_count,
        latest_miss:miss,
        latest_redemption_status:miss.redemption_status,
        profile:{display_name:miss.display_name,username:miss.username,avatar_path:miss.avatar_path},
      });
    }else{
      current.missed_count+=1;
      current.redeemed_count+=miss.redeemed_at?1:0;
      current.reaction_count+=miss.reaction_count;
      current.redemption_in_progress ||= miss.redemption_status==='in_progress';
    }
  }
  return [...grouped.values()].sort((a,b)=>b.missed_count-a.missed_count||new Date(b.most_recent_missed_at).getTime()-new Date(a.most_recent_missed_at).getTime());
}

export async function getMemberWall(userIdOrInput:string|{userId?:string;user_id?:string;circleId?:string;circle_id?:string},circleIdArg?:string):Promise<MemberWallDetail>{
  const userId=typeof userIdOrInput==='string'?userIdOrInput:String(userIdOrInput.userId??userIdOrInput.user_id??'');
  const circleId=typeof userIdOrInput==='string'?circleIdArg:(userIdOrInput.circleId??userIdOrInput.circle_id);
  if(!userId)throw new Error('User id is required.');
  let missesQuery=supabase
    .from('wall_miss_details')
    .select('*')
    .eq('user_id',userId)
    .order('missed_at',{ascending:false});
  if(circleId)missesQuery=missesQuery.eq('circle_id',circleId);

  const [profileResult,missesResult]=await Promise.all([
    supabase.from('profiles').select('*').eq('id',userId).single(),
    missesQuery,
  ]);
  if(profileResult.error)throw profileResult.error;
  if(missesResult.error)throw missesResult.error;

  const profile=profileResult.data as unknown as Profile;
  const misses=(missesResult.data??[]) as unknown as WallMissDetail[];
  const redeemed=misses.filter(miss=>Boolean(miss.redeemed_at)||miss.redemption_status==='completed').length;
  return {
    profile,
    misses,
    missed_count:misses.length,
    redeemed_count:redeemed,
    completion_rate:Number(profile.completion_rate??100),
  };
}

export async function reactToMiss(missedId:string,reaction:'we_saw_that'|'tomorrow'|'no_excuses'|'redemption_time'){
  const {error}=await supabase.rpc('toggle_miss_reaction',{p_missed_id:missedId,p_reaction:reaction});
  if(error)throw error;
}
