import { useState } from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button,Field,Header,Screen,Text } from '../../components/ui';
import { joinCircle } from '../../features/circles/api';
import { queryClient,qk } from '../../lib/query';
import { analytics } from '../../lib/analytics';
import { colors } from '../../theme/tokens';
export default function Join(){const params=useLocalSearchParams<{code?:string}>();const[code,setCode]=useState(String(params.code??'').toUpperCase());const m=useMutation({mutationFn:()=>joinCircle(code),onSuccess:async()=>{analytics.capture('circle_joined');await queryClient.invalidateQueries({queryKey:qk.circles});router.replace('/(tabs)/circles')}});return <Screen><Header title="Join a circle" subtitle="The invitation code is private. Only join circles you recognize."/><Field label="Invite code" value={code} onChangeText={v=>setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={10}/>{m.error?<Text style={{color:colors.missed}}>{m.error instanceof Error?m.error.message:'The request could not be completed.'}</Text>:null}<Button title="Join circle" loading={m.isPending} disabled={code.length<6} onPress={()=>m.mutate()}/></Screen>}
