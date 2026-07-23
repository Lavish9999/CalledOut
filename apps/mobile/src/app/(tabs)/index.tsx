import { useCallback } from 'react';
import { router,useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Button,EmptyState,Header,Loading,Metric,Screen,SectionTitle,Text } from '../../components/ui';
import { CommitmentCard } from '../../components/commitment-card';
import { getAvailableGracePasses,getTodayCommitments } from '../../features/commitments/api';
import { qk } from '../../lib/query';
import { dateHeading } from '../../lib/date';
import { useSession } from '../../providers/session';
import { spacing } from '../../theme/tokens';

export default function Today(){
  const {profile,refreshProfile}=useSession();
  const commitments=useQuery({queryKey:qk.today,queryFn:getTodayCommitments});
  const grace=useQuery({queryKey:qk.gracePasses,queryFn:getAvailableGracePasses});
  useFocusEffect(useCallback(()=>{commitments.refetch();grace.refetch();refreshProfile().catch(()=>{});},[]));
  const items=commitments.data??[];
  const priority=[...items].sort((a,b)=>{
    const activeA=['proof_window_open','proof_submitted','under_review','redemption_available'].includes(a.status)?0:1;
    const activeB=['proof_window_open','proof_submitted','under_review','redemption_available'].includes(b.status)?0:1;
    return activeA-activeB||new Date(a.deadline_at).getTime()-new Date(b.deadline_at).getTime();
  });
  const primary=priority[0];
  const remaining=priority.slice(1);
  return <Screen>
    <Header eyebrow={dateHeading().toUpperCase()} title={`Show up, ${profile?.display_name?.split(' ')[0]??'today'}.`} action={<Button title="+" compact variant="secondary" onPress={()=>router.push('/commitment/new')}/>}/>
    {commitments.isLoading?<Loading/>:primary?<>
      <Text variant="label">ON THE CLOCK</Text>
      <CommitmentCard item={primary} primary gracePasses={grace.data??0}/>
      {remaining.length?<><SectionTitle title="Also today"/>{remaining.map(item=><CommitmentCard key={item.id} item={item} gracePasses={grace.data??0}/>)}</>:null}
    </>:<EmptyState title="No promise on the clock" body="Create a commitment before motivation gets a vote." action={<Button title="Create commitment" onPress={()=>router.push('/commitment/new')}/>} />}
    <SectionTitle title="Your record"/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}}>
      <Metric label="CURRENT STREAK" value={profile?.current_streak??0} detail="verified commitments"/>
      <Metric label="COMPLETION" value={`${Math.round(profile?.completion_rate??0)}%`} detail="all-time record"/>
      <Metric label="GRACE PASSES" value={grace.data??0} detail="available now"/>
    </View>
  </Screen>;
}
