import { useState } from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useMutation,useQuery } from '@tanstack/react-query';
import { Button,Card,Field,Header,Loading,Notice,Screen,StatusPill,Text } from '../../../components/ui';
import { disputeProof,getLatestProofResult,requestCircleReview } from '../../../features/proofs/api';
import { queryClient,qk } from '../../../lib/query';
import { colors,radius } from '../../../theme/tokens';
import { analytics } from '../../../lib/analytics';

export default function ProofResultScreen(){
  const{commitmentId}=useLocalSearchParams<{commitmentId:string}>();
  const[reason,setReason]=useState('The automated result does not match the proof I submitted.');
  const query=useQuery({queryKey:qk.proofResult(commitmentId),queryFn:()=>getLatestProofResult(commitmentId),enabled:Boolean(commitmentId)});
  const circleReview=useMutation({
    mutationFn:async()=>{if(!query.data)throw new Error('Proof result unavailable');await requestCircleReview(query.data.id);},
    onSuccess:async()=>{analytics.capture('proof_sent_to_review');await Promise.all([queryClient.invalidateQueries({queryKey:qk.proofResult(commitmentId)}),queryClient.invalidateQueries({queryKey:qk.today})]);},
  });
  const dispute=useMutation({
    mutationFn:async()=>{if(!query.data)throw new Error('Proof result unavailable');await disputeProof(query.data.id,reason);},
    onSuccess:async()=>{analytics.capture('report_submitted',{target:'proof'});await Promise.all([queryClient.invalidateQueries({queryKey:qk.proofResult(commitmentId)}),queryClient.invalidateQueries({queryKey:qk.today})]);},
  });
  if(query.isLoading)return <Screen><Loading/></Screen>;
  if(!query.data)return <Screen><Header title="No proof result"/><Notice title="Nothing to review" body="No proof submission is attached to this commitment yet."/><Button title="Back" onPress={()=>router.back()}/></Screen>;
  const proof=query.data;
  const canDispute=['rejected','more_proof_required'].includes(proof.status);
  return <Screen>
    <Header title="Proof result" subtitle="Automated checks are evidence, not infallible judgment." action={<StatusPill status={proof.status}/>}/>
    {proof.signed_url?<Image source={{uri:proof.signed_url}} style={{width:'100%',aspectRatio:4/5,borderRadius:radius.lg,backgroundColor:colors.border}} contentFit="cover"/>:null}
    <Card><Text variant="label">VERIFICATION SCORE</Text><Text variant="display">{proof.verification_score??'—'}</Text><Text>Prompt: {proof.liveness_prompt??'Not recorded'}</Text></Card>
    {proof.checks?.map(check=><Card key={check.check_type}><Text variant="bodyStrong">{check.check_type.replaceAll('_',' ')}</Text><Text style={{color:check.passed?colors.verified:colors.missed}}>{check.passed?'Passed':'Did not pass'} · {check.points_awarded} points</Text></Card>)}
    {proof.status==='verified'?<Notice title="Receipt accepted" body="The commitment and your profile record have been updated." tone="success"/>:null}
    {proof.status==='circle_review'?<Notice title="Circle review" body="Eligible circle members can review the receipt. You will be notified when the vote resolves."/>:null}
    {proof.status==='disputed'?<Notice title="Appeal submitted" body="The report is in the moderation queue. Do not resubmit the same dispute." tone="success"/>:null}
    {proof.status==='more_proof_required'?<><Notice title="A required check failed" body="You can capture a new receipt while the proof window remains open, or dispute the automated result." tone="warning"/><Button title="Capture new proof" onPress={()=>router.replace({pathname:'/proof/capture',params:{commitmentId}} as never)}/></>:null}
    {proof.status==='more_proof_required'&&proof.commitment?.circle_id?<><Button title="Request circle review" variant="secondary" loading={circleReview.isPending} onPress={()=>circleReview.mutate()}/>{circleReview.error?<Notice title="Circle review unavailable" body={circleReview.error instanceof Error?circleReview.error.message:'Try again.'} tone="warning"/>:null}</>:null}
    {canDispute?<><Field label="Why is this result wrong?" value={reason} onChangeText={setReason} multiline/><Button title="Submit appeal" variant="secondary" loading={dispute.isPending} disabled={reason.trim().length<10} onPress={()=>dispute.mutate()}/></>:null}
    {dispute.error?<Notice title="Appeal not submitted" body={dispute.error instanceof Error?dispute.error.message:'Try again.'} tone="warning"/>:null}
    <Button title="Back" variant="ghost" onPress={()=>router.back()}/>
  </Screen>;
}
