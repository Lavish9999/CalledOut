import { useEffect,useState } from 'react';
import { router } from 'expo-router';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Pressable,View } from 'react-native';
import { Avatar,Button,Card,Chip,EmptyState,Header,Loading,Screen,Segmented,StatusPill,Text } from '../../components/ui';
import { getWall,reactToMiss } from '../../features/wall/api';
import { getCircles } from '../../features/circles/api';
import { queryClient,qk } from '../../lib/query';
import { analytics } from '../../lib/analytics';
import { colors,spacing } from '../../theme/tokens';
import type { WallPeriod } from '../../types/domain';
import { useSession } from '../../providers/session';

const reactions=[
  {value:'we_saw_that' as const,label:'We saw that.'},
  {value:'tomorrow' as const,label:'Tomorrow?'},
  {value:'no_excuses' as const,label:'No excuses.'},
  {value:'redemption_time' as const,label:'Redeem it.'},
];

export default function Wall(){
  const [period,setPeriod]=useState<WallPeriod>('week');
  const [circleId,setCircleId]=useState<string|undefined>(undefined);
  const {session,isPro}=useSession();
  const circles=useQuery({queryKey:qk.circles,queryFn:getCircles});
  const wall=useQuery({queryKey:qk.wall(circleId,period),queryFn:()=>getWall(circleId,period)});
  const reaction=useMutation({
    mutationFn:({missedId,value}:{missedId:string;value:'we_saw_that'|'tomorrow'|'no_excuses'|'redemption_time'})=>reactToMiss(missedId,value),
    onSuccess:(_data,variables)=>{analytics.capture('reaction_sent',{reaction: variables.value});return queryClient.invalidateQueries({queryKey:['wall']});},
  });
  useEffect(()=>analytics.capture('wall_viewed',{period}),[period]);

  return <Screen>
    <Header eyebrow="PRIVATE CIRCLES" title="The Wall" subtitle="The miss stays visible. Redemption changes what happens next."/>
    <Segmented value={period} onChange={value=>{if(value!=='week'&&!isPro)router.push('/paywall');else setPeriod(value);}} options={[{value:'week',label:'THIS WEEK'},{value:'month',label:'MONTH'},{value:'all',label:'ALL TIME'}]}/>
    {circles.data?.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>
      <Chip label="All circles" selected={!circleId} onPress={()=>setCircleId(undefined)}/>
      {circles.data.map(circle=><Chip key={circle.id} label={circle.name} selected={circleId===circle.id} onPress={()=>setCircleId(circle.id)}/>) }
    </View>:null}
    {wall.isLoading?<Loading/>:wall.data?.length?wall.data.map((entry,index)=>{
      const mine=entry.user_id===session?.user.id;
      const miss=entry.latest_miss;
      return <Card key={entry.user_id} style={index===0?{borderColor:colors.missed,borderWidth:1.5}:undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${entry.profile.display_name}'s accountability record`} onPress={()=>router.push({pathname:'/member/[id]',params:{id:entry.user_id,circleId:entry.circle_id}} as never)}>
          <View style={{flexDirection:'row',alignItems:'center',gap:spacing.md}}>
            <Text variant="title" style={{width:34}}>#{index+1}</Text>
            <Avatar name={entry.profile.display_name}/>
            <View style={{flex:1}}>
              <Text variant="card">{entry.profile.display_name}{mine?' · YOU':''}</Text>
              <Text style={{color:colors.textSecondary}}>@{entry.profile.username}</Text>
              <Text variant="caption">{entry.missed_count} missed · {entry.redeemed_count} redeemed · {Math.round(entry.completion_rate)}%</Text>
            </View>
            {entry.redemption_in_progress?<StatusPill status="redemption"/>:null}
          </View>
        </Pressable>
        <View style={{height:1,backgroundColor:colors.border}}/>
        <View style={{gap:spacing.xs}}>
          <Text variant="label">LATEST RECEIPT</Text>
          <Text variant="bodyStrong">Missed “{miss.title}”</Text>
          <Text style={{color:colors.textSecondary}}>{new Date(miss.missed_at).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</Text>
          {miss.redeemed_at?<StatusPill status="redeemed"/>:miss.redemption_status?<StatusPill status={miss.redemption_status}/>:null}
          {miss.redemption_status==='in_progress'&&miss.redemption_deadline_at?<Text variant="caption">Redemption closes {new Date(miss.redemption_deadline_at).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})}</Text>:null}
        </View>
        {!mine?<View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{reactions.map(item=><Chip key={item.value} label={item.label} disabled={reaction.isPending} onPress={()=>reaction.mutate({missedId:miss.missed_id,value:item.value})}/>)}</View>:<Text variant="caption" style={{color:colors.textSecondary}}>Your circle can react to this receipt.</Text>}
        <Text variant="caption" style={{color:colors.textSecondary}}>{entry.reaction_count} reactions</Text>
        {mine&&!miss.redeemed_at&&['available',null].includes(miss.redemption_status)?<Button title="Answer the miss" variant="danger" onPress={()=>router.push(`/redemption/${miss.commitment_id}` as never)}/>:null}
      </Card>;
    }):<EmptyState title="The Wall is clean" body={period==='week'?'Nobody in your circles has missed this week. Keep it that way.':'No visible misses in this period.'}/>}
  </Screen>;
}
