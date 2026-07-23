import { useEffect,useState } from 'react';
import { Pressable,View } from 'react-native';
import { Button,Card,Chip,Field,Header,Notice,Screen,Text } from '../../components/ui';
import { colors,radius,spacing } from '../../theme/tokens';
import { useOnboarding } from '../../state/onboarding';
import type { WorkoutType } from '../../types/domain';
import { completeProfile,finishOnboarding } from '../../features/profile/api';
import { createRecurringCommitment,getCommitmentSchedules } from '../../features/commitments/api';
import { useSession } from '../../providers/session';
import { analytics } from '../../lib/analytics';
import { registerPushToken } from '../../lib/notifications';

const workouts:[WorkoutType,string][]=[['gym','Gym'],['running','Running'],['walking','Walking'],['cycling','Cycling'],['sports','Sports'],['home','Home workout'],['swimming','Swimming'],['mobility','Yoga or mobility'],['other','Other']];
const dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const timeOptions=[{hour:6,label:'6:00 AM'},{hour:12,label:'12:00 PM'},{hour:18,label:'6:00 PM'},{hour:20,label:'8:00 PM'},{hour:22,label:'10:00 PM'}];

export default function Onboarding(){
  const[step,setStep]=useState(0);const[loading,setLoading]=useState(false);const[error,setError]=useState('');
  const st=useOnboarding();const{session,refreshProfile}=useSession();
  useEffect(()=>analytics.capture('onboarding_started'),[]);
  async function finish(){
    setLoading(true);setError('');
    try{
      await completeProfile({display_name:st.displayName,username:st.username,bio:st.bio,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,workout_types:st.workouts});
      const schedules=await getCommitmentSchedules();
      if(!schedules.length)await createRecurringCommitment({title:st.workouts[0]==='running'?'Run':'Workout',workout_type:st.workouts[0]??'gym',days_of_week:st.days,deadline_hour:st.deadlineHour,minimum_duration_minutes:st.minimumDuration,proof_method:'live_photo',requires_location:false});
      await finishOnboarding();
      if(session)registerPushToken(session.user.id).catch(()=>{});
      analytics.capture('onboarding_completed');
      await refreshProfile();
    }catch(e){setError(e instanceof Error?e.message:'CalledOut could not finish setup. Your answers are still here.');}
    finally{setLoading(false);}
  }
  const progress=(step+1)/5;
  return <Screen>
    <View style={{height:4,backgroundColor:colors.border,borderRadius:2}}><View style={{height:4,width:`${progress*100}%`,backgroundColor:colors.text,borderRadius:2}}/></View>
    {step===0?<><Header eyebrow="1 OF 5" title="How it works"/><Card><Text variant="section">1. Schedule your workout</Text><Text style={{color:colors.textSecondary}}>Make the commitment before pressure starts.</Text></Card><Card><Text variant="section">2. Submit fresh proof</Text><Text style={{color:colors.textSecondary}}>No old camera-roll receipts.</Text></Card><Card><Text variant="section">3. Miss it and face The Wall</Text><Text style={{color:colors.textSecondary}}>Only the promise you made is judged.</Text></Card></>:
    step===1?<><Header eyebrow="2 OF 5" title="Your profile"/><Field label="Display name" value={st.displayName} onChangeText={v=>st.set('displayName',v)}/><Field label="Username" value={st.username} autoCapitalize="none" onChangeText={v=>st.set('username',v.replace(/[^a-zA-Z0-9_]/g,''))}/><Field label="Short bio (optional)" value={st.bio} onChangeText={v=>st.set('bio',v)} multiline/></>:
    step===2?<><Header eyebrow="3 OF 5" title="What counts as a workout?"/><View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{workouts.map(([key,label])=>{const active=st.workouts.includes(key);return <Chip key={key} label={label} selected={active} onPress={()=>st.set('workouts',active?st.workouts.filter(x=>x!==key):[...st.workouts,key])}/>;})}</View></>:
    step===3?<><Header eyebrow="4 OF 5" title="Choose your days" subtitle="This creates your first weekly promise. You can add one-time promises later."/><View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{dayLabels.map((label,i)=>{const active=st.days.includes(i);return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label} workout day`} accessibilityState={{selected:active}} onPress={()=>st.set('days',active?st.days.filter(x=>x!==i):[...st.days,i])} style={{width:52,height:52,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:active?colors.text:colors.border,backgroundColor:active?colors.dark:colors.surface}}><Text variant="caption" style={{color:active?colors.surface:colors.text}}>{label}</Text></Pressable>;})}</View><Text variant="caption">DEADLINE</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{timeOptions.map(option=><Chip key={option.hour} label={option.label} selected={st.deadlineHour===option.hour} onPress={()=>st.set('deadlineHour',option.hour)}/>)}</View><Field label="Minimum workout minutes" value={String(st.minimumDuration)} keyboardType="number-pad" onChangeText={v=>st.set('minimumDuration',Math.max(1,Number(v)||1))}/></>:
    <><Header eyebrow="5 OF 5" title="Private by default" subtitle="Proof is visible only to circle members unless you explicitly change it."/><Card><Text variant="card">Camera</Text><Text>Fresh in-app proof only. Camera-roll photos cannot satisfy standard commitments.</Text></Card><Card><Text variant="card">Location</Text><Text>Optional unless a commitment requires it. Friends see a verification result, never your exact location.</Text></Card><Card><Text variant="card">Community rules</Text><Text>No body shaming, threats, harassment, dangerous-exercise pressure, doxxing, or posting people without permission.</Text></Card></>}
    {error?<Notice title="Setup did not finish" body={error} tone="warning"/>:null}
    <View style={{gap:spacing.sm,marginTop:'auto'}}><Button title={step===4?'Create first commitment':'Continue'} loading={loading} disabled={(step===1&&(!st.displayName||st.username.length<3))||(step===2&&!st.workouts.length)||(step===3&&!st.days.length)} onPress={()=>step<4?setStep(step+1):finish()}/>{step>0?<Button title="Back" variant="ghost" onPress={()=>setStep(step-1)}/>:null}</View>
  </Screen>;
}
