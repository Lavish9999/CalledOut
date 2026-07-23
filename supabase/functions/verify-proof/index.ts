import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const allowedPrompts=new Set(['Hold up two fingers','Give a thumbs-up','Point toward the equipment','Turn your head to the left']);

Deno.serve(async(req)=>{
  try{
    const auth=req.headers.get('authorization');
    if(!auth)return json({error:'Unauthorized'},401);
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{global:{headers:{authorization:auth}}});
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return json({error:'Unauthorized'},401);
    const {submissionId}=await req.json();
    const {data:p,error}=await supabase.from('proof_submissions').select('*,commitment:commitments(*)').eq('id',submissionId).eq('user_id',user.id).single();
    if(error||!p)return json({error:'Proof not found'},404);

    const captured=new Date(p.captured_at).getTime();
    const deadline=new Date(p.commitment.deadline_at).getTime();
    const windowStart=new Date(p.commitment.proof_window_starts_at).getTime();
    const submitted=new Date(p.created_at).getTime();
    const promptValid=Boolean(p.liveness_completed&&allowedPrompts.has(p.liveness_prompt));
    const locationRequired=Boolean(p.commitment.requires_location);
    const locationMatch=!locationRequired||p.location_result==='within_approved_location';
    const signals={
      freshCapture:p.capture_source==='in_app_camera'&&Number.isFinite(captured)&&captured<=submitted&&submitted-captured<48*60*60_000,
      liveness:promptValid,
      withinWindow:captured<=deadline+(Number(p.commitment.grace_period_minutes??0)*60_000)&&captured>=windowStart,
      locationMatch,
      integrityClean:Boolean(p.asset_path&&p.client_submission_key),
    };
    const checks=[
      ['fresh_capture',signals.freshCapture,25],
      ['liveness_prompt',signals.liveness,20],
      ['submission_window',signals.withinWindow,15],
      ['location_match',signals.locationMatch,15],
      ['integrity_and_duplicate',signals.integrityClean,10],
    ] as const;
    const score=checks.reduce((sum,[,passed,points])=>sum+(passed?points:0),0);
    const blockingFailure=!signals.freshCapture||!signals.liveness||!signals.withinWindow||(locationRequired&&!signals.locationMatch);
    const status=blockingFailure?'more_proof_required':score>=70?'verified':score>=45?'circle_review':'more_proof_required';
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    await admin.from('verification_checks').delete().eq('proof_submission_id',submissionId);
    await admin.from('verification_checks').insert(checks.map(([check_type,passed,points])=>({proof_submission_id:submissionId,check_type,passed,points_awarded:passed?points:0,details:{automated:true,blocking:check_type!=='integrity_and_duplicate'}})));
    await admin.from('proof_submissions').update({status,verification_score:score,decided_at:status==='verified'?new Date().toISOString():null}).eq('id',submissionId);
    const commitmentStatus=status==='verified'?'verified':status==='circle_review'?'under_review':'proof_window_open';
    const nowIso=new Date().toISOString();
    const commitmentUpdate:Record<string,unknown>={status:commitmentStatus,verified_at:status==='verified'?nowIso:null};
    let recaptureExtended=false;
    let extendedDeadline:string|null=null;
    if(status==='more_proof_required'&&deadline<Date.now()+15*60_000){
      extendedDeadline=new Date(Date.now()+15*60_000).toISOString();
      commitmentUpdate.deadline_at=extendedDeadline;
      commitmentUpdate.proof_window_starts_at=nowIso;
      recaptureExtended=true;
    }
    await admin.from('commitments').update(commitmentUpdate).eq('id',p.commitment_id);
    if(extendedDeadline){
      await admin.from('redemptions').update({deadline_at:extendedDeadline}).eq('redemption_commitment_id',p.commitment_id).eq('status','in_progress');
    }
    if(status==='verified')await admin.from('activity_events').insert({actor_id:user.id,circle_id:p.commitment.circle_id,commitment_id:p.commitment_id,proof_submission_id:submissionId,event_type:'proof_verified',payload:{title:p.commitment.title}});
    await admin.from('notification_outbox').insert({user_id:user.id,category:'proof_results',title:status==='verified'?'Receipt verified':status==='circle_review'?'Circle review required':'More proof required',body:status==='verified'?`${p.commitment.title} is verified.`:status==='circle_review'?'Your receipt needs circle review.':recaptureExtended?'A required check did not pass. You have 15 minutes to recapture or request circle review.':'A required proof check did not pass. Open CalledOut to review or recapture.',data:{commitment_id:p.commitment_id,submission_id:submissionId}});
    if(status==='circle_review'&&p.commitment.circle_id){
      const {data:reviewers}=await admin.from('circle_members').select('user_id').eq('circle_id',p.commitment.circle_id).eq('status','active').neq('user_id',user.id);
      if(reviewers?.length)await admin.from('notification_outbox').insert(reviewers.map(({user_id})=>({user_id,category:'review_required',title:'Receipt needs review',body:`${p.commitment.title} needs a circle decision.`,data:{circle_id:p.commitment.circle_id,submission_id:submissionId}})));
    }
    await admin.from('audit_logs').insert({actor_id:user.id,action:'proof_verification_decision',entity_type:'proof_submission',entity_id:submissionId,after_state:{status,score,signals}});
    return json({status,score,signals,explanation:status==='more_proof_required'?(recaptureExtended?'A required check did not pass. The proof window was extended by 15 minutes for a fresh receipt.':'A required check did not pass. Capture a new receipt or request circle review when available.'):'Automated checks passed. Circle review and disputes remain available.'});
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:'Unexpected error'},500);}
});
