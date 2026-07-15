create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  email_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists email_verification_codes (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_codes_user_idx
  on email_verification_codes(user_id);

alter table users add column if not exists email_verified boolean not null default false;

create table if not exists profiles (
  id uuid primary key references users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  goal text not null default '',
  photo_data_url text,
  cycle_length int not null default 28,
  period_length int not null default 5,
  last_period_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add column if not exists cycle_length int not null default 28;
alter table profiles add column if not exists period_length int not null default 5;
alter table profiles add column if not exists last_period_start date;
alter table profiles add column if not exists last_backup_at timestamptz;
alter table profiles add column if not exists lipedema_stage text;
alter table profiles add column if not exists lipedema_type text;
alter table profiles add column if not exists garment_compression_class text;
alter table profiles add column if not exists garment_last_replaced_at date;

create table if not exists records (
  id bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  record_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists records_profile_created_idx
  on records(profile_id, created_at desc);

create table if not exists photos (
  id bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  slot text not null,
  image_data_url text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists photos_profile_slot_created_idx
  on photos(profile_id, slot, created_at desc);

create table if not exists password_reset_tokens (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx
  on password_reset_tokens(user_id);
