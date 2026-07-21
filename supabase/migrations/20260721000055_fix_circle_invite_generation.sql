begin;

alter function public.create_circle(text, text)
set search_path = public, extensions;

commit;
