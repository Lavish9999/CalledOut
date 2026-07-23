import { useMemo,useRef,useState } from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CameraView,useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { View,StyleSheet } from 'react-native';
import { Button,Card,Loading,Screen,StatusPill,Text } from '../../components/ui';
import { colors,spacing } from '../../theme/tokens';
import { submitProof } from '../../features/proofs/api';
import { getCommitment } from '../../features/commitments/api';
import { enqueueProof } from '../../lib/upload-queue';
import { analytics } from '../../lib/analytics';
import { queryClient,qk } from '../../lib/query';

const prompts=['Hold up two fingers','Give a thumbs-up','Point toward the equipment','Turn your head to the left'];

function promptForCommitment(id:string){
  const hash=[...id].reduce((total,char)=>total+char.charCodeAt(0),0);
  return prompts[hash%prompts.length];
}
function distanceMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
  const r=6371e3;const rad=(value:number)=>value*Math.PI/180;
  const p1=rad(a.latitude),p2=rad(b.latitude),dp=rad(b.latitude-a.latitude),dl=rad(b.longitude-a.longitude);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*r*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

export default function Capture(){
  const {commitmentId}=useLocalSearchParams<{commitmentId:string}>();
  const commitment=useQuery({queryKey:qk.commitment(commitmentId),queryFn:()=>getCommitment(commitmentId),enabled:Boolean(commitmentId)});
  const [permission,requestPermission]=useCameraPermissions();
  const camera=useRef<CameraView>(null);
  const prompt=useMemo(()=>promptForCommitment(commitmentId??''),[commitmentId]);
  const [promptReady,setPromptReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  if(commitment.isLoading)return <Screen><Loading/></Screen>;
  if(!permission)return null;
  if(!permission.granted)return <Screen><Text variant="title">Camera required</Text><Text>Fresh in-app capture is required for standard proof. You can change permissions in system settings.</Text><Button title="Allow camera" onPress={requestPermission}/><Button title="Cancel" variant="ghost" onPress={()=>router.back()}/></Screen>;

  async function capture(){
    if(!commitmentId||!camera.current||!commitment.data)return;
    setLoading(true);setError('');let photoForRetry:{uri:string}|null=null;let capturedAt=new Date().toISOString();let locationResult:'within_approved_location'|'outside_approved_location'|'unavailable'='unavailable';const submissionId=Crypto.randomUUID();
    try{
      analytics.capture('proof_started',{requires_location:commitment.data.requires_location});
      const photo=await camera.current.takePictureAsync({quality:.78,skipProcessing:false});
      photoForRetry=photo;capturedAt=new Date().toISOString();
      if(!photo)throw new Error('The camera did not return a photo.');
      if(commitment.data.requires_location){
        let permissionResult=await Location.getForegroundPermissionsAsync();
        if(!permissionResult.granted)permissionResult=await Location.requestForegroundPermissionsAsync();
        if(permissionResult.granted){
          const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
          const geofence=commitment.data.location_geofence;
          if(geofence?.latitude!=null&&geofence?.longitude!=null){
            const distance=distanceMeters(current.coords,geofence);
            locationResult=distance<=Number(geofence.radius_m??250)?'within_approved_location':'outside_approved_location';
          }else{locationResult='within_approved_location';}
        }
      }
      const result=await submitProof({commitmentId,uri:photo.uri,prompt,promptCompleted:promptReady,locationResult,capturedAt,submissionId});
      analytics.capture('proof_submitted',{status:result?.status});
      if(result?.status==='verified')analytics.capture('proof_verified');
      else if(result?.status==='circle_review')analytics.capture('proof_sent_to_review');
      else if(result?.status==='more_proof_required'||result?.status==='rejected')analytics.capture('proof_rejected',{status:result.status});
      await Promise.all([
        queryClient.invalidateQueries({queryKey:qk.today}),
        queryClient.invalidateQueries({queryKey:['wall']}),
      ]);
      router.replace(`/proof/result/${commitmentId}` as never);
    }catch(e){
      if(photoForRetry){
        await enqueueProof({commitmentId,uri:photoForRetry.uri,prompt,promptCompleted:promptReady,locationResult,capturedAt,submissionId});
        setError('Upload paused. The receipt was copied into secure app storage and will retry when your connection returns.');
      }else setError(e instanceof Error?e.message:'Capture failed. Please try again.');
    }finally{setLoading(false);}
  }

  return <View style={{flex:1,backgroundColor:colors.dark}}>
    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front"/>
    <View style={s.overlay}>
      <Card style={{backgroundColor:'rgba(255,255,255,.96)'}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text variant="label">LIVE PROMPT</Text><StatusPill status={promptReady?'ready':'not ready'}/></View>
        <Text variant="section">{prompt}</Text>
        <Text>Keep your face and workout environment visible. This prompt is recorded with the fresh capture.</Text>
        {commitment.data?.requires_location?<Text variant="caption">Location verification is required for this promise.</Text>:null}
      </Card>
      <View style={{gap:spacing.sm}}>
        {error?<Text style={{color:colors.surface,backgroundColor:colors.missed,padding:12}}>{error}</Text>:null}
        {!promptReady?<Button title="Iâ€™m in position" onPress={()=>setPromptReady(true)}/>:<Button title="Capture receipt" loading={loading} onPress={capture}/>} 
        <Button title="Cancel" variant="secondary" onPress={()=>router.back()}/>
      </View>
    </View>
  </View>;
}
const s=StyleSheet.create({overlay:{flex:1,justifyContent:'space-between',padding:spacing.lg,paddingTop:72,paddingBottom:48}});

