import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button,Card,EmptyState,Header,Loading,Metric,Notice,Screen,SectionTitle,Text } from '../../components/ui';
import { getAccountabilityInsights } from '../../features/profile/api';
import { useSession } from '../../providers/session';
import { colors,spacing } from '../../theme/tokens';

export default function Insights(){
  const{isPro}=useSession();
  const query=useQuery({queryKey:['accountability-insights'],queryFn:getAccountabilityInsights,enabled:isPro});
  if(!isPro)return <Screen><Header title="Accountability insights"/><Notice title="CalledOut Pro" body="Full trends and accountability records are included with Pro."/><Button title="View CalledOut Pro" onPress={()=>router.replace('/paywall')}/><Button title="Back" variant="ghost" onPress={()=>router.back()}/></Screen>;
  if(query.isLoading)return <Screen><Loading/></Screen>;
  if(query.error)return <Screen><Header title="Insights unavailable"/><EmptyState title="Could not calculate insights" body={query.error instanceof Error?query.error.message:'Try again.'}/><Button title="Back" onPress={()=>router.back()}/></Screen>;
  const data=query.data!;
  return <Screen>
    <Header eyebrow="CALLEDOUT PRO" title="Accountability insights" subtitle="On-time verification counts. Redemption proves your response, but it does not erase the miss."/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}}><Metric label="ON-TIME RATE" value={`${data.onTimeRate}%`}/><Metric label="VERIFIED" value={data.verified}/><Metric label="MISSES" value={data.missed}/><Metric label="REDEEMED" value={data.redeemed}/></View>
    <Card><Text variant="section">Your pattern</Text><Text>Strongest day: {data.strongestDay??'Not enough data'}</Text><Text>Weakest day: {data.weakestDay??'Not enough data'}</Text><Text variant="caption" style={{color:colors.textSecondary}}>Redeemed commitments remain misses in the on-time rate.</Text></Card>
    <SectionTitle title="Last eight weeks"/>
    {data.weeks.map(week=><Card key={week.label}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text variant="bodyStrong">Week of {week.label}</Text><Text variant="bodyStrong">{week.rate}%</Text></View><View style={{height:10,borderRadius:5,backgroundColor:colors.border,overflow:'hidden'}}><View style={{height:'100%',width:`${week.rate}%`,backgroundColor:week.rate>=80?colors.verified:week.rate>=50?colors.warning:colors.missed}}/></View><Text variant="caption" style={{color:colors.textSecondary}}>{week.verified} verified · {week.missed} missed</Text></Card>)}
    <Button title="Back" variant="ghost" onPress={()=>router.back()}/>
  </Screen>;
}
