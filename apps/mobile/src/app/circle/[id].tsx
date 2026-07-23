import { Alert,Share,View } from 'react-native';
import { router,useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Avatar,Button,Card,EmptyState,Header,Loading,Screen,SectionTitle,Text } from '../../components/ui';
import { getCircleDetail,leaveCircle } from '../../features/circles/api';
import { castProofVote,getCircleReviewQueue } from '../../features/proofs/api';
import { queryClient,qk } from '../../lib/query';
import { colors,radius,spacing } from '../../theme/tokens';
import { useSession } from '../../providers/session';
import { analytics } from '../../lib/analytics';

function activityCopy(type:string,payload:Record<string,unknown>){
  if(type==='proof_verified')return `verified ${String(payload.title??'a workout')}`;
  if(type==='commitment_missed')return `missed ${String(payload.title??'a commitment')}`;
  if(type==='redemption_completed')return 'completed a redemption';
  if(type==='member_joined')return 'joined the circle';
  return type.replaceAll('_',' ');
}

export default function CircleDetail(){
  const {id}=useLocalSearchParams<{id:string}>();
  const {session}=useSession();
  const query=useQuery({queryKey:qk.circle(id),queryFn:()=>getCircleDetail(id),enabled:Boolean(id)});
  const reviews=useQuery({queryKey:qk.reviews(id),queryFn:()=>getCircleReviewQueue(id),enabled:Boolean(id)});
  const vote=useMutation({mutationFn:({submissionId,decision}:{submissionId:string;decision:'accept'|'reject'})=>castProofVote(submissionId,decision),onSuccess:async()=>{await Promise.all([queryClient.invalidateQueries({queryKey:qk.reviews(id)}),queryClient.invalidateQueries({queryKey:qk.circle(id)}),queryClient.invalidateQueries({queryKey:['wall']})]);}});
  const leave=useMutation({mutationFn:()=>leaveCircle(id),onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:qk.circles});router.replace('/(tabs)/circles');}});
  if(query.isLoading)return <Screen><Loading/></Screen>;
  if(query.error||!query.data)return <Screen><Header title="Circle unavailable"/><EmptyState title="Could not open circle" body={query.error instanceof Error?query.error.message:'Try again from Circles.'}/><Button title="Back" onPress={()=>router.back()}/></Screen>;
  const circle=query.data;
  const myMembership=circle.members.find(member=>member.user_id===session?.user.id);
  async function invite(){
    const result=await Share.share({message:`Join my CalledOut circle “${circle.name}”. Use code ${circle.invite_code}. Open calledout://circle/join?code=${circle.invite_code} or enter the code in CalledOut. Miss a day. Get called out.`});
    if(result.action===Share.sharedAction)analytics.capture('invite_shared',{circle_id:circle.id});
  }
  function confirmLeave(){
    Alert.alert('Leave this circle?',myMembership?.role==='owner'?(circle.member_count===1?'This solo circle will be deleted and its commitments will become private.':'Ownership will transfer to the longest-standing eligible member.'):'You will lose access to its Wall and proof activity.',[
      {text:'Cancel',style:'cancel'},
      {text:'Leave circle',style:'destructive',onPress:()=>leave.mutate()},
    ]);
  }
  return <Screen>
    <Header eyebrow={`${circle.member_count}/${circle.member_limit} MEMBERS`} title={`${circle.icon} ${circle.name}`} subtitle={circle.description??'Private accountability. Public receipts inside the circle.'}/>
    <Card style={{backgroundColor:colors.dark,borderColor:colors.dark}}>
      <Text variant="label" style={{color:colors.warning}}>INVITE CODE</Text>
      <Text variant="display" style={{color:colors.surface,letterSpacing:3}}>{circle.invite_code}</Text>
      <Text style={{color:colors.surface}}>Bring in people who will notice when you vanish.</Text>
      <Button title="Share invitation" variant="secondary" onPress={invite}/>
    </Card>
    {(reviews.data??[]).filter(item=>item.user_id!==session?.user.id).length?<>
      <SectionTitle title="Proofs needing review"/>
      {(reviews.data??[]).filter(item=>item.user_id!==session?.user.id).map(item=><Card key={item.id}>
        <View style={{flexDirection:'row',gap:spacing.md,alignItems:'center'}}>{item.signed_url?<Image source={{uri:item.signed_url}} style={{width:76,height:96,borderRadius:radius.md,backgroundColor:colors.border}} contentFit="cover"/>:null}<View style={{flex:1,gap:spacing.xs}}><Text variant="bodyStrong">{item.user.display_name} · {item.commitment.title}</Text><Text variant="caption" style={{color:colors.textSecondary}}>Score {item.verification_score??'—'} · Prompt: {item.liveness_prompt??'not recorded'}</Text></View></View>
        <View style={{flexDirection:'row',gap:spacing.sm}}><View style={{flex:1}}><Button title="Reject" variant="secondary" compact disabled={vote.isPending} onPress={()=>vote.mutate({submissionId:item.id,decision:'reject'})}/></View><View style={{flex:1}}><Button title="Accept" compact disabled={vote.isPending} onPress={()=>vote.mutate({submissionId:item.id,decision:'accept'})}/></View></View>
      </Card>)}
    </>:null}
    <SectionTitle title="Leaderboard" action={<Button title="Open Wall" compact variant="ghost" onPress={()=>router.push('/(tabs)/wall')}/>}/>
    {[...circle.members].sort((a,b)=>b.profile.current_streak-a.profile.current_streak).map((member,index)=><Card key={member.user_id} onPress={()=>router.push({pathname:'/member/[id]',params:{id:member.user_id,circleId:id}} as never)}>
      <View style={{flexDirection:'row',alignItems:'center',gap:spacing.md}}>
        <Text variant="section" style={{width:28}}>#{index+1}</Text><Avatar name={member.profile.display_name}/>
        <View style={{flex:1}}><Text variant="bodyStrong">{member.profile.display_name}{member.user_id===session?.user.id?' · YOU':''}</Text><Text variant="caption" style={{color:colors.textSecondary}}>@{member.profile.username} · {member.role}</Text></View>
        <View style={{alignItems:'flex-end'}}><Text variant="section">{member.profile.current_streak}</Text><Text variant="caption">streak</Text></View>
      </View>
    </Card>)}
    <SectionTitle title="Recent receipts"/>
    {circle.activity.length?circle.activity.map(event=><Card key={event.id}>
      <View style={{flexDirection:'row',gap:spacing.sm,alignItems:'center'}}><Avatar name={event.actor?.display_name??'CalledOut'} size={36}/><View style={{flex:1}}><Text><Text variant="bodyStrong">{event.actor?.display_name??'CalledOut'}</Text> {activityCopy(event.event_type,event.payload)}</Text><Text variant="caption" style={{color:colors.textSecondary}}>{new Date(event.created_at).toLocaleString()}</Text></View></View>
    </Card>):<EmptyState title="No receipts yet" body="The first verified workout or miss will appear here."/>}
    <Button title="Create circle commitment" onPress={()=>router.push('/commitment/new')}/>
    <Button title="Leave circle" variant="ghost" loading={leave.isPending} onPress={confirmLeave}/>
  </Screen>;
}
