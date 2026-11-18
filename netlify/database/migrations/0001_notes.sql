create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  -- Netlify Identity user id.
  user_id text not null,
  title text not null default '',
  body text not null default '',
  captured_on text not null check (captured_on in ('ios', 'android', 'web')),
  device text,
  place jsonb,
  -- { key, width, height } of the photo in the "photos" blob store.
  photo jsonb,
  recognized_text text,
  transcript text,
  tags text[] not null default '{}',
  share_id text unique,
  -- Millisecond precision so an ISO createdAt from the API is an exact `before` cursor.
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  search tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || coalesce(recognized_text, '') || ' ' || coalesce(transcript, '')
    )
  ) stored
);

create index if not exists notes_user_created_idx on notes (user_id, created_at desc, id desc);
create index if not exists notes_search_idx on notes using gin (search);

-- The API pages with `before` = the last note's createdAt, so a user's created_at
-- values must be unique; a burst of inserts in one millisecond is spread out.
create or replace function notes_unique_created_at() returns trigger
language plpgsql as $$
declare
  latest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('notes:' || new.user_id));
  select max(created_at) into latest from notes where user_id = new.user_id;
  if latest is not null and new.created_at <= latest then
    new.created_at := latest + interval '1 millisecond';
    new.updated_at := new.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_unique_created_at on notes;
create trigger notes_unique_created_at
  before insert on notes
  for each row execute function notes_unique_created_at();

create or replace function notes_notify() returns trigger
language plpgsql as $$
declare
  r notes;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  perform pg_notify('notes', json_build_object('op', lower(tg_op), 'id', r.id, 'user_id', r.user_id)::text);
  return null;
end;
$$;

drop trigger if exists notes_notify on notes;
create trigger notes_notify
  after insert or update or delete on notes
  for each row execute function notes_notify();
