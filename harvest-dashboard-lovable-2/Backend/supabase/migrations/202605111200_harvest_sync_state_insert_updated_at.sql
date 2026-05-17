-- Ensure harvest_sync_state.updated_at is set on INSERT (ORM may send NULL and bypass column default).
drop trigger if exists harvest_sync_state_set_updated_at on public.harvest_sync_state;
create trigger harvest_sync_state_set_updated_at
before insert or update on public.harvest_sync_state
for each row execute function public.set_updated_at();
