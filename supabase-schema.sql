-- EXPO Database Schema for Supabase
-- Run this in the Supabase SQL Editor after creating the project

-- Client workout logs (from the client portal)
create table client_workouts (
  id text primary key,
  client_id text not null,
  plan_name text,
  day_name text,
  week integer,
  date timestamptz default now(),
  autoregulation jsonb default '{}',
  notes text default '',
  exercises jsonb default '[]',
  form_videos jsonb default '[]',
  created_at timestamptz default now()
);

-- Body weight logs — one row per (client_id, block_name, week); upsert on relog
create table bw_logs (
  id serial primary key,
  client_id text not null,
  block_name text not null,
  plan_id text,
  week integer,
  bw numeric,
  date timestamptz default now(),
  constraint bw_logs_client_block_week_uniq unique (client_id, block_name, week)
);

-- Weekly focus notes (trainer sets per exercise per week)
create table weekly_focus (
  id serial primary key,
  focus_key text unique not null,
  value text not null,
  updated_at timestamptz default now()
);

-- Trainer-side data (trainees, exercises, plans, workouts, payments)
create table store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Allow anonymous access (no auth required for MVP)
alter table client_workouts enable row level security;
alter table bw_logs enable row level security;
alter table weekly_focus enable row level security;
alter table store enable row level security;

-- Public read/write policies (MVP - no auth)
create policy "public_all" on client_workouts for all using (true) with check (true);
create policy "public_all" on bw_logs for all using (true) with check (true);
create policy "public_all" on weekly_focus for all using (true) with check (true);
create policy "public_all" on store for all using (true) with check (true);
