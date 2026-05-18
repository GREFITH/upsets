-- Store Harvest ``statement_key`` on clients; drop unused JSON payload.
alter table public.harvest_clients
  add column if not exists statement_key text;

alter table public.harvest_clients drop column if exists payload;
