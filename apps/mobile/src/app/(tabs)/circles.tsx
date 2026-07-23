import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Avatar,Button,Card,EmptyState,Header,Loading,Screen,Text } from '../../components/ui';
import { getCircles } from '../../features/circles/api';
import { qk } from '../../lib/query';
import { colors,spacing } from '../../theme/tokens';

export default function Circles(){
  const query=useQuery({queryKey:qk.circles,queryFn:getCircles});
  return <Screen>
    <Header title="Circles" subtitle="Private groups where people notice when you disappear."/>
    <View style={{flexDirection:'row',gap:spacing.sm}}><View style={{flex:1}}><Button title="Create" onPress={()=>router.push('/circle/new')}/></View><View style={{flex:1}}><Button title="Join code" variant="secondary" onPress={()=>router.push('/circle/join')}/></View></View>
    {query.isLoading?<Loading/>:query.data?.length?query.data.map(circle=><Card key={circle.id} onPress={()=>router.push(`/circle/${circle.id}` as never)}>
      <View style={{flexDirection:'row',gap:spacing.md,alignItems:'center'}}>
        <Avatar name={circle.name}/>
        <View style={{flex:1,gap:spacing.xs}}><Text variant="section">{circle.icon} {circle.name}</Text><Text style={{color:colors.textSecondary}}>{circle.description??'No description. Just receipts.'}</Text><Text variant="label">{circle.role?.toUpperCase()} · {circle.member_count??1}/{circle.member_limit} MEMBERS</Text></View>
        <Text variant="section">›</Text>
      </View>
    </Card>):<EmptyState title="No circle yet" body="Continue solo, or invite people who will notice when you disappear." action={<Button title="Create your first circle" onPress={()=>router.push('/circle/new')}/>} />}
  </Screen>;
}
