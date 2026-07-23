import { Alert,View } from 'react-native';
import { router } from 'expo-router';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Button,Card,EmptyState,Header,Loading,Screen,StatusPill,Text } from '../../components/ui';
import { deleteCommitmentSchedule,getCommitmentSchedules,setCommitmentScheduleActive } from '../../features/commitments/api';
import { queryClient } from '../../lib/query';
import { colors,spacing } from '../../theme/tokens';

const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function timeLabel(value:string){const [hourValue,minute='00']=value.split(':');const hour=Number(hourValue);return `${hour%12||12}:${minute.slice(0,2)} ${hour>=12?'PM':'AM'}`;}

export default function ManageCommitments(){
  const query=useQuery({queryKey:['commitment-schedules'],queryFn:getCommitmentSchedules});
  const toggle=useMutation({mutationFn:({id,active}:{id:string;active:boolean})=>setCommitmentScheduleActive(id,active),onSuccess:async()=>{await Promise.all([queryClient.invalidateQueries({queryKey:['commitment-schedules']}),queryClient.invalidateQueries({queryKey:['today']})]);}});
  const remove=useMutation({mutationFn:deleteCommitmentSchedule,onSuccess:async()=>{await Promise.all([queryClient.invalidateQueries({queryKey:['commitment-schedules']}),queryClient.invalidateQueries({queryKey:['today']})]);}});
  function confirmDelete(id:string,title:string){Alert.alert('Delete recurring commitment?',`Future unopened occurrences of “${title}” will be removed. Past receipts and misses stay in your record.`,[{text:'Cancel',style:'cancel'},{text:'Delete schedule',style:'destructive',onPress:()=>remove.mutate(id)}]);}
  return <Screen>
    <Header eyebrow="PROMISE CONTROL" title="Recurring commitments" subtitle="Pause future promises without rewriting history."/>
    <Button title="Create commitment" onPress={()=>router.push('/commitment/new')}/>
    {query.isLoading?<Loading/>:query.error?<EmptyState title="Could not load schedules" body={query.error instanceof Error?query.error.message:'Try again.'}/>:query.data?.length?query.data.map(schedule=><Card key={schedule.id}>
      <View style={{flexDirection:'row',alignItems:'flex-start',gap:spacing.md}}><View style={{flex:1,gap:spacing.xs}}><Text variant="section">{schedule.title}</Text><Text style={{color:colors.textSecondary}}>{schedule.days_of_week.map(day=>dayNames[day]).join(' · ')} at {timeLabel(schedule.deadline_local)}</Text><Text variant="caption" style={{color:colors.textSecondary}}>{schedule.minimum_duration_minutes} min · {schedule.circle?.name??'Solo record'} · {schedule.proof_method.replaceAll('_',' ')}</Text></View><StatusPill status={schedule.is_active?'ACTIVE':'PAUSED'}/></View>
      <Text variant="caption" style={{color:colors.textSecondary}}>Consequence: {schedule.consequence_text}</Text>
      <View style={{flexDirection:'row',gap:spacing.sm}}><View style={{flex:1}}><Button compact variant="secondary" loading={toggle.isPending} title={schedule.is_active?'Pause':'Resume'} onPress={()=>toggle.mutate({id:schedule.id,active:!schedule.is_active})}/></View><View style={{flex:1}}><Button compact variant="ghost" loading={remove.isPending} title="Delete" onPress={()=>confirmDelete(schedule.id,schedule.title)}/></View></View>
    </Card>):<EmptyState title="No recurring promises" body="Create a weekly commitment and it will remain generated on a rolling 60-day horizon."/>}
  </Screen>;
}
