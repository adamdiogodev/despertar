-- Receipt paths may only be set through attach_charge_receipt (which checks the
-- file is in the caller's own folder). A direct UPDATE by a manager could
-- otherwise point a charge at someone else's object and expose it.
create or replace function public.charges_receipt_guard()
returns trigger language plpgsql as $$
begin
  if new.receipt_path is distinct from old.receipt_path and current_user <> 'postgres' then
    raise exception 'Use o envio de comprovante para anexar arquivos' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger charges_receipt_guard before update on public.charges
  for each row execute function public.charges_receipt_guard();

revoke execute on function public.charges_receipt_guard() from public, anon, authenticated;
