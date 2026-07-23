import { Alert,View } from 'react-native';
import { router,useLocalSearchParams } from 'expo-router';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Avatar,Button,Card,Header,Loading,Metric,Notice,Screen,Text } from '../../components/ui';
import { blockMember,getMemberProfile,reportMember } from '../../features/profile/api';
import { queryClient,qk } from '../../lib/query';
import { spacing } from '../../theme/tokens';
import { useSession } from '../../providers/session';
import { analytics } from '../../lib/analytics';

export default function MemberProfile(){
  const {id}=useLocalSearchParams<{id:string}>();
  const {session}=useSession();
  const query=useQuery({queryKey:qk.member(id),queryFn:()=>getMemberProfile(id),enabled:Boolean(id)});
  const block=useMutation({mutationFn:()=>blockMember(id),onSuccess:async()=>{await Promise.all([queryClient.invalidateQueries({queryKey:['wall']}),queryClient.invalidateQueries({queryKey:qk.circles})]);router.back();}});
  const report=useMutation({mutationFn:(reason:string)=>reportMember(id,reason),onSuccess:()=>{analytics.capture('report_submitted',{target:'member'});Alert.alert('Report received','The moderation queue has the report. You can also block this member now.');}});
  if(query.isLoading)return <Screen><Loading/></Screen>;
  if(!query.data)return <Screen><Header title="Member unavailable"/><Button title="Back" onPress={()=>router.back()}/></Screen>;
  const profile=query.data;const mine=id===session?.user.id;
  function reportMenu(){Alert.alert('Report member','Choose the closest reason.',[
    {text:'Cancel',style:'cancel'},
    {text:'Harassment or threats',onPress:()=>report.mutate('harassment_or_threats')},
    {text:'Body shaming',onPress:()=>report.mutate('body_shaming')},
    {text:'Unsafe content',onPress:()=>report.mutate('unsafe_content')},
    {text:'Impersonation or spam',onPress:()=>report.mutate('impersonation_or_spam')},
  ]);}
  function blockMenu(){Alert.alert('Block this member?','You will stop seeing each other’s profiles, Wall entries, and circle activity.',[{text:'Cancel',style:'cancel'},{text:'Block member',style:'destructive',onPress:()=>block.mutate()}]);}
  return <Screen>
    <View style={{alignItems:'center',gap:spacing.sm}}><Avatar name={profile.display_name} size={84}/><Header title={profile.display_name} subtitle={`@${profile.username}`}/><Text>{profile.bio||'No bio. Just receipts.'}</Text></View>
    <View style={{flexDirection:'row',gap:spacing.sm}}><Metric label="CURRENT STREAK" value={profile.current_streak}/><Metric label="COMPLETION" value={`${Math.round(profile.completion_rate)}%`}/></View>
    <Card><Text variant="section">Accountability record</Text><Text>Longest verified run: {profile.longest_streak}</Text><Text>The Wall preserves misses and completed redemptions rather than deleting the record.</Text></Card>
    {!mine?<><Notice title="Community safety" body="Report threats, harassment, body shaming, unsafe pressure, doxxing, or impersonation."/><Button title="Report member" variant="secondary" loading={report.isPending} onPress={reportMenu}/><Button title="Block member" variant="danger" loading={block.isPending} onPress={blockMenu}/></>:null}
    <Button title="Back" variant="ghost" onPress={()=>router.back()}/>
  </Screen>;
}
