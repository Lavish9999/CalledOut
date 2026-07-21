begin;
create or replace function public.admin_moderate_user(p_user_id uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare v_status text;v_type public.moderation_action_type;begin
 if not public.is_admin() then raise exception 'admin authorization required'; end if;
 if p_user_id=auth.uid() then raise exception 'admins cannot moderate themselves'; end if;
 if p_action='suspend' then v_status:='suspended';v_type:='suspended';elsif p_action='ban' then v_status:='banned';v_type:='banned';elsif p_action='reinstate' then v_status:='active';v_type:='reinstated';else raise exception 'unsupported action';end if;
 update profiles set account_status=v_status,public_profile_opt_in=case when v_status='active' then public_profile_opt_in else false end,public_wall_opt_in=case when v_status='active' then public_wall_opt_in else false end where id=p_user_id;
 insert into moderation_actions(admin_id,target_user_id,action_type,reason) values(auth.uid(),p_user_id,v_type,p_reason);
 insert into audit_logs(actor_id,action,entity_type,entity_id,after_state) values(auth.uid(),'admin_'||p_action,'profile',p_user_id,jsonb_build_object('account_status',v_status,'reason',p_reason));
end $$;
create or replace function public.admin_resolve_report(p_report_id uuid,p_status text,p_notes text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'admin authorization required';end if;
 if p_status not in ('actioned','dismissed') then raise exception 'invalid status';end if;
 update reports set status=p_status::report_status,assigned_admin_id=auth.uid(),resolved_at=now() where id=p_report_id;
 insert into audit_logs(actor_id,action,entity_type,entity_id,after_state) values(auth.uid(),'report_'||p_status,'report',p_report_id,jsonb_build_object('notes',p_notes));
end $$;
grant execute on function public.admin_moderate_user(uuid,text,text) to authenticated;
grant execute on function public.admin_resolve_report(uuid,text,text) to authenticated;

drop policy if exists proof_owner_read on storage.objects;
create policy proof_owner_member_admin_read on storage.objects for select to authenticated using(bucket_id='proof-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.proof_submissions p join public.commitments c on c.id=p.commitment_id where p.asset_path=name and c.circle_id is not null and public.is_circle_member(c.circle_id))));
commit;
