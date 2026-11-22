begin;

-- Match the persistent browser cookie. Existing sessions keep their original
-- expiration, and new sessions still participate in the same revocation rules.
alter table public.web_sessions alter column expires_at
 set default (now() + interval '4320 hours');

commit;
