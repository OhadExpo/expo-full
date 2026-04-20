-- One-shot migration (already executed 2026-04-21 via Management API).
-- Per coach decision "no shared plans for couples": split each plan currently
-- assigned to the couple's parent trainee_id into two member-specific copies.
-- After this runs there are zero plans on the parent ID; both members own
-- independent rows, so the trainer-side assign/unassign toggle stops ghosting.
--
-- Kept here for traceability. Re-running is a no-op once the parent row is empty.

do $$
declare
  r record;
  new_id text;
begin
  for r in select * from plans where trainee_id = 'tr_neta_tom' loop
    new_id := 'pl_' || substr(md5(random()::text || r.id), 1, 16);
    insert into plans (id, name, trainee_id, phase, notes, active, data, created_at, updated_at)
      values (new_id, r.name, 'tr_neta_tom__1', r.phase, r.notes, r.active, r.data, now(), now());
    update plans set trainee_id = 'tr_neta_tom__0', updated_at = now() where id = r.id;
  end loop;
end $$;
