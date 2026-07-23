import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../lib/supabase';
export type ProofInput={commitmentId:string;uri:string;prompt:string;promptCompleted:boolean;locationResult:'within_approved_location'|'outside_approved_location'|'unavailable';capturedAt:string;submissionId?:string};
export async function submitProof(input:ProofInput){
 const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Not authenticated');
 const submissionId=input.submissionId??Crypto.randomUUID();
 const existing=await supabase.from('proof_submissions').select('id,status').eq('id',submissionId).maybeSingle();
 if(existing.data){if(existing.data.status==='processing'){const result=await supabase.functions.invoke('verify-proof',{body:{submissionId}});if(result.error)throw result.error;return result.data;}return existing.data;}
 const bytes=await FileSystem.readAsStringAsync(input.uri,{encoding:FileSystem.EncodingType.Base64});const path=`${user.id}/${submissionId}.jpg`;
 const arr=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));const upload=await supabase.storage.from('proof-media').upload(path,arr,{contentType:'image/jpeg',upsert:true});if(upload.error)throw upload.error;
 const{error}=await supabase.from('proof_submissions').insert({id:submissionId,commitment_id:input.commitmentId,user_id:user.id,captured_at:input.capturedAt,capture_source:'in_app_camera',liveness_prompt:input.prompt,liveness_completed:input.promptCompleted,location_result:input.locationResult,status:'processing',asset_path:path,client_submission_key:submissionId});if(error)throw error;
 const result=await supabase.functions.invoke('verify-proof',{body:{submissionId}});if(result.error)throw result.error;return result.data;
}

export async function getLatestProofResult(commitmentId:string){
  const {data,error}=await supabase.from('proof_submissions').select('*,commitment:commitments(circle_id),checks:verification_checks(check_type,passed,points_awarded,details)').eq('commitment_id',commitmentId).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  let signed_url:string|null=null;
  if(data.asset_path){const signed=await supabase.storage.from('proof-media').createSignedUrl(data.asset_path,300);signed_url=signed.data?.signedUrl??null;}
  return {...data,signed_url} as unknown as import('../../types/domain').ProofResult;
}

export async function requestCircleReview(submissionId:string){const{error}=await supabase.rpc('request_circle_review',{p_submission_id:submissionId});if(error)throw error;}

export async function disputeProof(submissionId:string,reason:string){
  const {error}=await supabase.rpc('dispute_proof',{p_submission_id:submissionId,p_reason:reason});
  if(error)throw error;
}

export async function getCircleReviewQueue(circleId:string){
  const {data,error}=await supabase.from('proof_submissions').select('id,commitment_id,user_id,status,verification_score,liveness_prompt,created_at,asset_path,user:profiles!proof_submissions_user_id_fkey(display_name,username,avatar_path),commitment:commitments!inner(id,title,circle_id)').eq('status','circle_review').eq('commitment.circle_id',circleId).order('created_at');
  if(error)throw error;
  const rows=await Promise.all((data??[]).map(async(row:any)=>{
    let signed_url:string|null=null;
    if(row.asset_path){const signed=await supabase.storage.from('proof-media').createSignedUrl(row.asset_path,300);signed_url=signed.data?.signedUrl??null;}
    return {...row,signed_url};
  }));
  return rows as import('../../types/domain').ProofReviewItem[];
}

export async function castProofVote(submissionId:string,vote:'accept'|'reject',reason?:string){
  const {error}=await supabase.rpc('cast_verification_vote',{p_submission:submissionId,p_vote:vote,p_reason:reason??null});
  if(error)throw error;
}
