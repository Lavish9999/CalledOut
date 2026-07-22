begin;

create table if not exists public.apple_revocation_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  encrypted_refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apple_revocation_tokens enable row level security;

drop trigger if exists set_updated_at on public.apple_revocation_tokens;
create trigger set_updated_at
before update on public.apple_revocation_tokens
for each row
execute function public.set_updated_at();

revoke all on table public.apple_revocation_tokens from anon, authenticated;
grant all on table public.apple_revocation_tokens to service_role;

commit;
