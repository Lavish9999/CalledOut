import { supabase } from '../../lib/supabase';
import type { ActivityEvent, Circle, CircleDetail, CircleMember, CircleRole } from '../../types/domain';

export async function getCircles(){
  const {data,error}=await supabase.from('circle_members').select('role,circle:circles(id,name,description,icon,privacy,member_limit)').eq('status','active');
  if(error)throw error;
  const circles=(data??[]).map((row:any)=>({...row.circle,role:row.role})) as Circle[];
  if(!circles.length)return circles;
  const ids=circles.map(circle=>circle.id);
  const {data:members}=await supabase.from('circle_members').select('circle_id').in('circle_id',ids).eq('status','active');
  return circles.map(circle=>({...circle,member_count:(members??[]).filter((row:any)=>row.circle_id===circle.id).length}));
}

export async function getCircleDetail(id:string):Promise<CircleDetail>{
  const user=(await supabase.auth.getUser()).data.user;
  const [circleResult,membersResult,activityResult,inviteResult]=await Promise.all([
    supabase.from('circles').select('*').eq('id',id).single(),
    supabase.from('circle_members').select('id,circle_id,user_id,role,joined_at,profile:profiles!circle_members_user_id_fkey(display_name,username,avatar_path,current_streak,completion_rate)').eq('circle_id',id).eq('status','active').order('joined_at'),
    supabase.from('activity_events').select('id,event_type,created_at,payload,actor:profiles!activity_events_actor_id_fkey(id,display_name,username,avatar_path)').eq('circle_id',id).is('deleted_at',null).order('created_at',{ascending:false}).limit(20),
    supabase.rpc('get_circle_invite',{p_circle_id:id}),
  ]);
  if(circleResult.error)throw circleResult.error;
  if(membersResult.error)throw membersResult.error;
  if(activityResult.error)throw activityResult.error;
  if(inviteResult.error)throw inviteResult.error;

  const circle=circleResult.data as unknown as Circle;
  const members=(membersResult.data??[]).map((member:any)=>({
    ...member,
    circle_completion_rate:Number(member.profile?.completion_rate??100),
    completed_count:0,
    missed_count:0,
  })) as CircleMember[];
  const inviteCode=String(inviteResult.data??'');
  const myRole=(members.find(member=>member.user_id===user?.id)?.role??circle.role??'member') as CircleRole;

  return {
    ...circle,
    circle,
    role:myRole,
    invite_code:inviteCode,
    inviteCode,
    myRole,
    member_count:members.length,
    members,
    activity:(activityResult.data??[]) as unknown as ActivityEvent[],
  };
}

export async function createCircle(input:{name:string;description?:string}){
  const{data,error}=await supabase.rpc('create_circle',{p_name:input.name,p_description:input.description??null});
  if(error)throw error;
  return data as string;
}

export async function joinCircle(code:string){
  const{data,error}=await supabase.rpc('join_circle_by_code',{p_code:code.trim().toUpperCase()});
  if(error)throw error;
  return data as string;
}

export async function leaveCircle(circleId:string){
  const{error}=await supabase.rpc('leave_circle',{p_circle_id:circleId});
  if(error)throw error;
}

function objectArg(args:any[]){return args.length===1&&typeof args[0]==='object'&&args[0]!==null?args[0]:null;}

export async function updateCircle(...args:any[]){
  const object=objectArg(args);
  const circleId=String(object?.circleId??object?.circle_id??object?.id??args[0]);
  const input=object??args[1]??{};
  const{error}=await supabase.rpc('update_circle',{
    p_circle_id:circleId,
    p_name:input.name??null,
    p_description:input.description??null,
    p_privacy:input.privacy??null,
    p_rules:input.rules??null,
    p_comments_enabled:input.comments_enabled??input.commentsEnabled??null,
  });
  if(error)throw error;
}

export async function deleteCircle(...args:any[]){
  const object=objectArg(args);
  const circleId=String(object?.circleId??object?.circle_id??object?.id??args[0]);
  const{error}=await supabase.rpc('delete_circle',{p_circle_id:circleId});
  if(error)throw error;
}

export async function removeCircleMember(...args:any[]){
  const object=objectArg(args);
  const circleId=String(object?.circleId??object?.circle_id??args[0]);
  const userId=String(object?.userId??object?.user_id??object?.memberId??args[1]);
  const{error}=await supabase.rpc('remove_circle_member',{p_circle_id:circleId,p_user_id:userId});
  if(error)throw error;
}

export async function setCircleMemberRole(...args:any[]){
  const object=objectArg(args);
  const circleId=String(object?.circleId??object?.circle_id??args[0]);
  const userId=String(object?.userId??object?.user_id??object?.memberId??args[1]);
  const role=(object?.role??args[2]) as CircleRole;
  const{error}=await supabase.rpc('set_circle_member_role',{p_circle_id:circleId,p_user_id:userId,p_role:role});
  if(error)throw error;
}

export async function rotateCircleInvite(...args:any[]){
  const object=objectArg(args);
  const circleId=String(object?.circleId??object?.circle_id??object?.id??args[0]);
  const{data,error}=await supabase.rpc('rotate_circle_invite',{p_circle_id:circleId});
  if(error)throw error;
  return String(data??'');
}
