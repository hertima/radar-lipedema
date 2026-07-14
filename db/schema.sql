create table if not exists profiles (
  id text primary key,
  name text not null default '',
  email text not null default '',
  goal text not null default '',
  photo_data_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists records (
  id bigserial primary key,
  profile_id text not null references profiles(id) on delete cascade,
  record_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists records_profile_created_idx
  on records(profile_id, created_at desc);

create table if not exists photos (
  id bigserial primary key,
  profile_id text not null references profiles(id) on delete cascade,
  slot text not null,
  image_data_url text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists photos_profile_slot_created_idx
  on photos(profile_id, slot, created_at desc);
