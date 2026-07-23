import { supabase } from '../../lib/supabase';

export type NotificationPreferences={
  morning_reminder:boolean;two_hour_warning:boolean;thirty_minute_warning:boolean;
  proof_window_opened:boolean;proof_results:boolean;commitment_missed:boolean;
  redemption_warning:boolean;social_activity:boolean;review_required:boolean;
  quiet_hours_start:string|null;quiet_hours_end:string|null;timezone:string;
};
export async function getNotificationPreferences(){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
  const{data,error}=await supabase.from('notification_preferences').select('*').eq('user_id',user.id).single();if(error)throw error;return data as NotificationPreferences;
}
export type NotificationToggleKey=Exclude<keyof NotificationPreferences,'quiet_hours_start'|'quiet_hours_end'|'timezone'>;
export async function updateNotificationPreference(key:NotificationToggleKey,value:boolean){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
  const{error}=await supabase.from('notification_preferences').update({[key]:value}).eq('user_id',user.id);if(error)throw error;
}

export async function updateQuietHours(start:string|null,end:string|null){const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');const{error}=await supabase.from('notification_preferences').update({quiet_hours_start:start,quiet_hours_end:end}).eq('user_id',user.id);if(error)throw error;}
