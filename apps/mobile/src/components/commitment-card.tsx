import { Alert,View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button,Card,Notice,StatusPill,Text } from './ui';
import { colors,spacing } from '../theme/tokens';
import type { Commitment } from '../types/domain';
import { deadlineLabel,timeLabel } from '../lib/date';
import { useGracePass as applyGracePass } from '../features/commitments/api';
import { queryClient,qk } from '../lib/query';

export function CommitmentCard({item,primary=false,gracePasses=0}:{item:Commitment;primary?:boolean;gracePasses?:number}){
  const actionable=['proof_window_open','upcoming'].includes(item.status);
  const consequence=item.redemption_rules?.consequence??'Complete a verified redemption workout';
  const grace=useMutation({
    mutationFn:(action:'extend'|'excuse')=>applyGracePass(item.id,action),
    onSuccess:async()=>Promise.all([
      queryClient.invalidateQueries({queryKey:qk.today}),
      queryClient.invalidateQueries({queryKey:qk.gracePasses}),
    ]),
  });
  function graceActions(){
    Alert.alert('Use a grace pass','Choose carefully. This action is recorded.',[
      {text:'Cancel',style:'cancel'},
      {text:'Extend 60 minutes',onPress:()=>grace.mutate('extend')},
      {text:'Excuse commitment',style:'destructive',onPress:()=>grace.mutate('excuse')},
    ]);
  }
  return <Card style={primary?{borderColor:colors.text,borderWidth:1.5}:undefined}>
    <View style={{flexDirection:'row',justifyContent:'space-between',gap:spacing.md}}>
      <View style={{flex:1,gap:spacing.xs}}>
        <Text variant={primary?'section':'card'}>{item.title}</Text>
        <Text style={{color:colors.textSecondary}}>Due {timeLabel(item.deadline_at)} Â· {item.minimum_duration_minutes} min</Text>
      </View>
      <StatusPill status={item.status}/>
    </View>
    {item.status==='verified'?<><Notice title="Verified" body={`Receipt accepted${item.verified_at?` at ${timeLabel(item.verified_at)}`:''}. Your record has been updated.`} tone="success"/><Button title="View receipt" variant="secondary" onPress={()=>router.push(`/proof/result/${item.id}` as never)}/></>:
    item.status==='redeemed'?<Notice title="Redeemed" body="The miss remains in history. Your response is now part of the record." tone="success"/>:
    item.status==='under_review'?<><Notice title="Under review" body="Your circle or moderation queue is reviewing the receipt."/><Button title="View proof status" variant="secondary" onPress={()=>router.push(`/proof/result/${item.id}` as never)}/></>:
    item.status==='rejected'?<><Notice title="Proof rejected" body="Review the checks and submit an appeal if the decision is wrong." tone="warning"/><Button title="Review and appeal" variant="danger" onPress={()=>router.push(`/proof/result/${item.id}` as never)}/></>:
    item.status==='missed'||item.status==='redemption_available'?<>
      <Notice title="You missed the promise" body={`Consequence: ${consequence}`} tone="warning"/>
      <Button title="Start redemption" variant="danger" onPress={()=>router.push(`/redemption/${item.id}` as never)}/>
    </>:<>
      <Text variant={primary?'display':'title'}>{deadlineLabel(item.deadline_at)}</Text>
      <Text style={{color:colors.textSecondary}}>remaining Â· {item.circle?.name??'Private commitment'}</Text>
      <Notice title="If you miss" body={consequence}/>
      <Button title={actionable?'Submit proof':'Proof processing'} disabled={!actionable||item.status==='upcoming'&&new Date(item.proof_window_starts_at)>new Date()} onPress={()=>router.push({pathname:'/proof/capture',params:{commitmentId:item.id}} as never)}/>
      {actionable&&gracePasses>0?<Button title={`Use grace pass Â· ${gracePasses} left`} variant="ghost" loading={grace.isPending} onPress={graceActions}/>:null}
    </>}
  </Card>;
}

