import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button,Card,EmptyState,Header,Loading,Notice,Screen,StatusPill,Text } from '../../components/ui';
import { getTodayCommitments } from '../../features/commitments/api';
import { qk } from '../../lib/query';
import { deadlineLabel,timeLabel } from '../../lib/date';
import { colors } from '../../theme/tokens';

export default function Post(){
  const query=useQuery({queryKey:qk.today,queryFn:getTodayCommitments});
  const active=(query.data??[]).filter(item=>['upcoming','proof_window_open','proof_submitted','under_review'].includes(item.status)).sort((a,b)=>new Date(a.deadline_at).getTime()-new Date(b.deadline_at).getTime());
  const open=active.filter(item=>item.status==='proof_window_open');
  const primary=open[0]??active[0];
  const remaining=active.filter(item=>item.id!==primary?.id);
  return <Screen>
    <Header title="Post proof" subtitle="Fresh capture. Random prompt. No camera-roll alibis."/>
    {query.isLoading?<Loading/>:primary?<>
      <Card style={{backgroundColor:colors.dark,borderColor:colors.dark}}>
        <StatusPill status={primary.status}/><Text variant="section" style={{color:colors.surface}}>{primary.title}</Text><Text variant="display" style={{color:colors.surface}}>{deadlineLabel(primary.deadline_at)}</Text><Text style={{color:colors.surface}}>Due {timeLabel(primary.deadline_at)} · {primary.minimum_duration_minutes} minutes · {primary.circle?.name??'Private'}</Text>
      </Card>
      <Notice title="What gets checked" body={`Fresh in-app capture, randomized prompt, proof window${primary.requires_location?', and approved location':''}. Automated checks are not infallible; circle review remains available.`}/>
      <Button title={primary.status==='proof_window_open'?'Open camera':'Proof window not open'} disabled={primary.status!=='proof_window_open'} onPress={()=>router.push({pathname:'/proof/capture',params:{commitmentId:primary.id}} as never)}/>
      {remaining.map(item=><Card key={item.id}><Text variant="bodyStrong">{item.title}</Text><Text>Due {timeLabel(item.deadline_at)}</Text><Button title="Use this commitment" variant="secondary" disabled={item.status!=='proof_window_open'} onPress={()=>router.push({pathname:'/proof/capture',params:{commitmentId:item.id}} as never)}/></Card>)}
    </>:<EmptyState title="Nothing to prove" body="You do not have an open proof window. Make a promise from Today." action={<Button title="Create commitment" onPress={()=>router.push('/commitment/new')}/>} />}
  </Screen>;
}
