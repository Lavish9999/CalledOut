import { router,useLocalSearchParams } from 'expo-router';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Button,Card,Header,Loading,Notice,Screen,Text } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { getCommitment } from '../../features/commitments/api';
import { queryClient,qk } from '../../lib/query';
import { analytics } from '../../lib/analytics';
import { colors } from '../../theme/tokens';

export default function Redemption(){
  const{id}=useLocalSearchParams<{id:string}>();
  const commitment=useQuery({queryKey:qk.commitment(id),queryFn:()=>getCommitment(id),enabled:Boolean(id)});
  const mutation=useMutation({
    mutationFn:async()=>{const{data,error}=await supabase.rpc('start_redemption',{p_commitment_id:id});if(error)throw error;return data;},
    onSuccess:async()=>{analytics.capture('redemption_started');await Promise.all([queryClient.invalidateQueries({queryKey:qk.today}),queryClient.invalidateQueries({queryKey:['wall']})]);router.replace('/(tabs)');},
  });
  if(commitment.isLoading)return <Screen><Loading/></Screen>;
  const item=commitment.data;
  const consequence=item?.redemption_rules?.consequence??'Complete a verified 30-minute redemption workout';
  const windowHours=item?.redemption_rules?.window_hours??24;
  const minutes=item?.redemption_rules?.minutes??30;
  return <Screen>
    <Header title="Answer the miss" subtitle="The miss stays in history. Your response becomes part of the record."/>
    <Card style={{backgroundColor:colors.dark,borderColor:colors.dark}}><Text variant="label" style={{color:colors.warning}}>MISSED PROMISE</Text><Text variant="section" style={{color:colors.surface}}>{item?.title??'Commitment'}</Text><Text style={{color:colors.surface}}>Missed {item?.deadline_at?new Date(item.deadline_at).toLocaleString():'before the deadline'}.</Text></Card>
    <Card><Text variant="label">REDEMPTION</Text><Text variant="section">{consequence}</Text><Text>{minutes} verified minutes Â· the window began when the miss was recorded Â· fresh proof required</Text></Card>
    <Notice title="This does not erase the miss" body="The Wall changes the record to REDEEMED after the redemption proof verifies. That distinction is permanent and visible to the circle." tone="warning"/>
    {mutation.error?<Notice title="Could not start redemption" body={mutation.error instanceof Error?mutation.error.message:'Try again.'} tone="warning"/>:null}
    <Button title="Start redemption" loading={mutation.isPending} onPress={()=>mutation.mutate()}/>
    <Button title="Not now" variant="ghost" onPress={()=>router.back()}/>
  </Screen>;
}

