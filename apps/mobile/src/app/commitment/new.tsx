import { useMemo,useState } from 'react';
import { Pressable,View } from 'react-native';
import { router } from 'expo-router';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Button,Card,Chip,Field,Header,Notice,Screen,Segmented,Text } from '../../components/ui';
import { createCommitmentPlan } from '../../features/commitments/api';
import { getCircles } from '../../features/circles/api';
import { queryClient,qk } from '../../lib/query';
import { analytics } from '../../lib/analytics';
import { colors,radius,spacing } from '../../theme/tokens';
import type { ProofMethod,WorkoutType } from '../../types/domain';
import { useSession } from '../../providers/session';

const workouts:{value:WorkoutType;label:string}[]=[
  {value:'gym',label:'Gym'},{value:'running',label:'Run'},{value:'walking',label:'Walk'},
  {value:'cycling',label:'Cycle'},{value:'sports',label:'Sports'},{value:'home',label:'Home'},
  {value:'swimming',label:'Swim'},{value:'mobility',label:'Mobility'},{value:'other',label:'Other'},
];
const dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const consequences=[
  'Complete a verified 30-minute redemption workout',
  'Complete an extra workout within 24 hours',
  'Complete a verified 30-minute walk',
  'Post an accountability message to the circle',
];

function isoDate(offset=0){const d=new Date();d.setDate(d.getDate()+offset);const year=d.getFullYear();const month=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${year}-${month}-${day}`;}

export default function NewCommitment(){
  const [step,setStep]=useState(0);
  const [title,setTitle]=useState('Workout');
  const [workoutType,setWorkoutType]=useState<WorkoutType>('gym');
  const [recurrence,setRecurrence]=useState<'one_time'|'weekly'>('weekly');
  const [days,setDays]=useState([1,3,5]);
  const [dateOffset,setDateOffset]=useState(0);
  const [hour,setHour]=useState('8');
  const [minute,setMinute]=useState('00');
  const [period,setPeriod]=useState<'AM'|'PM'>('PM');
  const [duration,setDuration]=useState('30');
  const [proof,setProof]=useState<'photo'|'photo_location'>('photo');
  const [circleId,setCircleId]=useState<string|null>(null);
  const [proofWindow,setProofWindow]=useState('240');
  const [consequence,setConsequence]=useState(consequences[0]);
  const [redemptionHours,setRedemptionHours]=useState('24');
  const [error,setError]=useState('');
  const {isPro}=useSession();
  const circles=useQuery({queryKey:qk.circles,queryFn:getCircles});

  const deadlineHour=useMemo(()=>{
    const h=Math.min(12,Math.max(1,Number(hour)||1));
    return period==='AM'?(h===12?0:h):(h===12?12:h+12);
  },[hour,period]);
  const minuteNumber=Math.min(59,Math.max(0,Number(minute)||0));
  const date=isoDate(dateOffset);
  const chosenCircle=circles.data?.find(circle=>circle.id===circleId);
  const proofMethod:ProofMethod=proof==='photo_location'?'combined':'live_photo';
  const timeLabel=`${Math.min(12,Math.max(1,Number(hour)||1))}:${String(minuteNumber).padStart(2,'0')} ${period}`;
  const scheduleLabel=recurrence==='weekly'?[...days].sort().map(day=>dayLabels[day]).join(', '):new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});

  const mutation=useMutation({
    mutationFn:()=>createCommitmentPlan({
      title:title.trim(),workout_type:workoutType,recurrence,days_of_week:recurrence==='weekly'?days:[],
      commitment_date:date,deadline_hour:deadlineHour,deadline_minute:minuteNumber,
      minimum_duration_minutes:Number(duration),proof_method:proofMethod,requires_location:proof==='photo_location',
      circle_id:circleId,proof_window_minutes:Number(proofWindow),consequence,
      redemption_window_hours:Number(redemptionHours),
    }),
    onSuccess:async()=>{
      analytics.capture('commitment_created',{recurring:recurrence==='weekly',proof_method:proofMethod,circle:Boolean(circleId)});
      await Promise.all([
        queryClient.invalidateQueries({queryKey:qk.today}),
        queryClient.invalidateQueries({queryKey:qk.circles}),
      ]);
      router.back();
    },
    onError:(e)=>setError(e instanceof Error?e.message:'Commitment could not be created.'),
  });

  function next(){
    setError('');
    if(step===0&&title.trim().length<2)return setError('Give the promise a clear name.');
    if(step===1&&recurrence==='weekly'&&!days.length)return setError('Choose at least one workout day.');
    if(step===2&&(Number(hour)<1||Number(hour)>12||minuteNumber>59))return setError('Enter a valid time.');
    if(step===3&&(Number(duration)<1||Number(proofWindow)<5))return setError('Check the duration and proof window.');
    if(step<4)setStep(step+1);else mutation.mutate();
  }

  return <Screen>
    <View style={{height:4,backgroundColor:colors.border,borderRadius:2}}><View style={{height:4,width:`${((step+1)/5)*100}%`,backgroundColor:colors.text,borderRadius:2}}/></View>
    {step===0?<>
      <Header eyebrow="1 OF 5" title="Name the promise" subtitle="Make it specific enough that nobody can reinterpret it later."/>
      <Field label="Commitment" value={title} onChangeText={setTitle} maxLength={80}/>
      <Text variant="caption">WORKOUT TYPE</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{workouts.map(item=><Chip key={item.value} label={item.label} selected={workoutType===item.value} onPress={()=>setWorkoutType(item.value)}/>)}</View>
    </>:step===1?<>
      <Header eyebrow="2 OF 5" title="Put it on the clock" subtitle="Choose one deadline or a weekly promise."/>
      <Segmented value={recurrence} onChange={value=>setRecurrence(value)} options={[{value:'one_time',label:'ONE TIME'},{value:'weekly',label:'WEEKLY'}]}/>
      {recurrence==='weekly'?<>
        <Text variant="caption">WORKOUT DAYS</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{dayLabels.map((label,index)=>{
          const active=days.includes(index);
          return <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label} workout day`} accessibilityState={{selected:active}} onPress={()=>setDays(active?days.filter(day=>day!==index):[...days,index])} style={{width:54,height:54,alignItems:'center',justifyContent:'center',borderRadius:radius.md,borderWidth:1,borderColor:active?colors.text:colors.border,backgroundColor:active?colors.dark:colors.surface}}><Text variant="caption" style={{color:active?colors.surface:colors.text}}>{label}</Text></Pressable>;
        })}</View>
      </>:<>
        <Text variant="caption">COMMITMENT DATE</Text>
        <View style={{gap:spacing.xs}}>{[
          {offset:0,label:'Today'},{offset:1,label:'Tomorrow'},{offset:2,label:new Date(`${isoDate(2)}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})},
        ].map(option=><Card key={option.offset} onPress={()=>setDateOffset(option.offset)} style={{borderColor:dateOffset===option.offset?colors.text:colors.border,backgroundColor:dateOffset===option.offset?colors.dark:colors.surface}}><Text variant="bodyStrong" style={{color:dateOffset===option.offset?colors.surface:colors.text}}>{option.label}</Text></Card>)}</View>
      </>}
    </>:step===2?<>
      <Header eyebrow="3 OF 5" title="Set the deadline" subtitle="The proof window opens before this time. Once it opens, the promise locks."/>
      <View style={{flexDirection:'row',gap:spacing.sm,alignItems:'flex-end'}}>
        <View style={{flex:1}}><Field label="Hour" value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2}/></View>
        <Text variant="title" style={{paddingBottom:8}}>:</Text>
        <View style={{flex:1}}><Field label="Minute" value={minute} onChangeText={setMinute} keyboardType="number-pad" maxLength={2}/></View>
      </View>
      <Segmented value={period} onChange={value=>setPeriod(value)} options={[{value:'AM',label:'AM'},{value:'PM',label:'PM'}]}/>
      <Notice title={`Due ${timeLabel}`} body={`${scheduleLabel}. CalledOut will judge the promise against this exact deadline.`}/>
    </>:step===3?<>
      <Header eyebrow="4 OF 5" title="Define the receipt" subtitle="Fresh in-app proof is required. Camera-roll uploads do not count."/>
      <Field label="Minimum workout minutes" value={duration} onChangeText={setDuration} keyboardType="number-pad"/>
      <Text variant="caption">PROOF METHOD</Text>
      <Card onPress={()=>setProof('photo')} style={{borderColor:proof==='photo'?colors.text:colors.border}}><Text variant="card">Live photo</Text><Text style={{color:colors.textSecondary}}>Fresh camera capture with a randomized prompt.</Text></Card>
      <Card onPress={()=>isPro?setProof('photo_location'):router.push('/paywall')} style={{borderColor:proof==='photo_location'?colors.text:colors.border}}><Text variant="card">Live photo + location {isPro?'':'· PRO'}</Text><Text style={{color:colors.textSecondary}}>Confirms location at capture and checks an approved area when a geofence is configured.</Text></Card>
      <Field label="Proof window (minutes before deadline)" value={proofWindow} onChangeText={setProofWindow} keyboardType="number-pad"/>
      <Text variant="caption">WHO WILL SEE THE RESULT?</Text>
      <Card onPress={()=>setCircleId(null)} style={{borderColor:circleId===null?colors.text:colors.border}}><Text variant="bodyStrong">Only me</Text><Text variant="caption" style={{color:colors.textSecondary}}>Private commitment. No Wall entry for friends.</Text></Card>
      {circles.data?.map(circle=><Card key={circle.id} onPress={()=>setCircleId(circle.id)} style={{borderColor:circleId===circle.id?colors.text:colors.border}}><Text variant="bodyStrong">{circle.icon} {circle.name}</Text><Text variant="caption" style={{color:colors.textSecondary}}>{circle.member_count??1} members will witness the outcome.</Text></Card>)}
    </>:<>
      <Header eyebrow="5 OF 5" title="Choose the consequence" subtitle="The miss remains in history. Redemption proves how you answered it."/>
      <View style={{gap:spacing.xs}}>{consequences.map((option,index)=><Card key={option} onPress={()=>index===0||isPro?setConsequence(option):router.push('/paywall')} style={{borderColor:consequence===option?colors.text:colors.border}}><Text variant="bodyStrong">{option}{index>0&&!isPro?' · PRO':''}</Text></Card>)}</View>
      <Field label={`Redemption window (hours)${isPro?'':' · PRO uses 24'}`} value={isPro?redemptionHours:'24'} editable={isPro} onChangeText={setRedemptionHours} keyboardType="number-pad"/>
      <Card style={{backgroundColor:colors.dark,borderColor:colors.dark}}>
        <Text variant="label" style={{color:colors.warning}}>YOUR PROMISE</Text>
        <Text variant="section" style={{color:colors.surface}}>{title}</Text>
        <Text style={{color:colors.surface}}>{recurrence==='weekly'?'Every ':''}{scheduleLabel} by {timeLabel} · {duration} minutes</Text>
        <Text style={{color:colors.surface}}>{chosenCircle?`Visible to ${chosenCircle.name}`:'Private'} · {proof==='photo_location'?'Photo + location':'Live photo'}</Text>
        <Text variant="caption" style={{color:colors.warning}}>MISS IT: {consequence}</Text>
      </Card>
    </>}
    {error?<Notice title="Check the promise" body={error} tone="warning"/>:null}
    <View style={{gap:spacing.sm}}>
      <Button title={step===4?'I’m committing':'Continue'} loading={mutation.isPending} onPress={next}/>
      <Button title={step===0?'Cancel':'Back'} variant="ghost" onPress={()=>step===0?router.back():setStep(step-1)}/>
    </View>
  </Screen>;
}
