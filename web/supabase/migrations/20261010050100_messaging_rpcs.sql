-- Messaging read helpers.
-- Profile RLS hides a guardian from a therapist once their care link ends, so the
-- conversation list (which must still show the read-only thread with its name)
-- and the contact picker are served by SECURITY DEFINER functions scoped to the caller.

-- People the caller may start a conversation with (can_message policy).
create or replace function public.list_message_contacts()
returns table (id uuid, full_name text, role public.app_role, specialty text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.role, t.specialty
  from public.profiles p
  left join public.therapists t on t.id = p.id
  where p.active
    and p.id <> auth.uid()
    and public.can_message(auth.uid(), p.id)
  order by p.full_name
$$;

-- The caller's 1:1 conversations with the other participant, last message,
-- unread count (by the caller's last_read_at) and whether sending is still allowed.
create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_profile_id uuid,
  other_full_name text,
  other_role public.app_role,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender_id uuid,
  unread_count integer,
  can_send boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    c.id,
    other.profile_id,
    p.full_name,
    p.role,
    c.last_message_at,
    lm.body,
    lm.sender_id,
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and (me.last_read_at is null or m.created_at > me.last_read_at)),
    public.can_message(auth.uid(), other.profile_id)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other
    on other.conversation_id = c.id and other.profile_id <> me.profile_id
  join public.profiles p on p.id = other.profile_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where me.profile_id = auth.uid()
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

revoke execute on function public.list_message_contacts(), public.list_my_conversations() from public, anon;
grant execute on function public.list_message_contacts(), public.list_my_conversations() to authenticated;
