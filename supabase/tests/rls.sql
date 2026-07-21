begin;
create extension if not exists pgtap;
select plan(5);

select has_table('public','profiles','profiles exists');
select has_table('public','commitments','commitments exists');
select has_table('public','proof_submissions','proof submissions exists');
select has_function('public','is_circle_member',array['uuid','uuid'],'membership helper exists');
select has_function('public','admin_moderate_user',array['uuid','text','text'],'admin moderation RPC exists');

select * from finish();
rollback;
