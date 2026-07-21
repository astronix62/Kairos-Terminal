-- ============================================================
-- SCHEMA SUPABASE — KAIROS Discipline Cockpit (mono-user)
-- ============================================================
-- Calqué directement sur la structure `state` du fichier HTML source :
--   state.profile  { name, rules[] }
--   state.days     { [iso]: { type, objectives[], checklist[{label,done}] } }
--   state.entries  [ { id, date, time, mode, dayType, setup, grade, context,
--                       emotion, energy, planRespected, impulsive, pnl,
--                       notes, screenshot } ]
--   state.settings { apiKey, model, endpoint }  -- apiKey NE DOIT PAS être stockée serveur
--
-- Choix : une ligne par jour dans `days`, une ligne par entrée dans `entries`,
-- une seule ligne de profil par utilisateur. Pas de JSON monolithique en base —
-- ça permettrait des requêtes SQL directes plus tard si besoin (stats, exports).
-- ============================================================

-- ---------- 1. PROFIL (une seule ligne par utilisateur) ----------
create table profile (
  user_id uuid primary key default auth.uid(),
  name text not null default 'Trader',
  rules jsonb not null default '[]'::jsonb, -- array de strings
  settings jsonb not null default '{"model":"gpt-4o-mini","endpoint":"https://api.openai.com/v1/chat/completions"}'::jsonb,
  -- La clé API LLM n'est JAMAIS stockée ici : elle reste en localStorage
  -- du navigateur uniquement (cf. js/app.js). Voir note sécurité en bas.
  ui_state jsonb not null default '{}'::jsonb, -- calMonth etc, confort uniquement
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 2. JOURS PLANIFIÉS (calendrier) ----------
create table days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  date date not null,
  day_type text not null check (day_type in ('trading','analyse','backtest','formation','repos','mix')),
  objectives jsonb not null default '[]'::jsonb, -- array de strings
  checklist jsonb not null default '[]'::jsonb,  -- array de {label, done}
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- ---------- 3. ENTRÉES JOURNAL (trading + analyse) ----------
create table entries (
  id uuid primary key default gen_random_uuid(), -- même id que uid() côté client, réutilisé tel quel
  user_id uuid not null default auth.uid(),
  entry_date date not null,
  entry_time text, -- format "HH:MM", stocké en text pour matcher le format client existant
  mode text not null check (mode in ('trading','analyse')),
  day_type text, -- dénormalisé depuis days.day_type au moment de la saisie (comme dans le code source)
  setup text,
  grade text check (grade in ('A','B','C')),
  context text,
  emotion text,
  energy smallint check (energy between 1 and 5),
  plan_respected boolean,
  impulsive boolean default false,
  pnl numeric, -- null si journée analyse
  notes text,
  screenshot_path text, -- chemin dans le bucket Storage, remplace le dataURL base64
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profile enable row level security;
alter table days enable row level security;
alter table entries enable row level security;

create policy "own profile only" on profile for all using (auth.uid() = user_id);
create policy "own days only" on days for all using (auth.uid() = user_id);
create policy "own entries only" on entries for all using (auth.uid() = user_id);

-- ============================================================
-- INDEX
-- ============================================================
create index idx_days_date on days(date desc);
create index idx_entries_date on entries(entry_date desc);
create index idx_entries_mode on entries(mode);

-- ============================================================
-- STORAGE — bucket screenshots (remplace le stockage base64 en JSON)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('kairos-screenshots', 'kairos-screenshots', false)
on conflict (id) do nothing;

create policy "own screenshots - select"
on storage.objects for select
using (bucket_id = 'kairos-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own screenshots - insert"
on storage.objects for insert
with check (bucket_id = 'kairos-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own screenshots - delete"
on storage.objects for delete
using (bucket_id = 'kairos-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- TRIGGER — updated_at automatique
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profile_updated_at before update on profile
  for each row execute function set_updated_at();
create trigger days_updated_at before update on days
  for each row execute function set_updated_at();

-- ============================================================
-- NOTE SÉCURITÉ IMPORTANTE — clé API LLM
-- ============================================================
-- La colonne profile.settings ne contient QUE model/endpoint, jamais apiKey.
-- La clé reste stockée exclusivement dans le localStorage du navigateur
-- (comme dans le fichier source), pour ne jamais transiter par la base
-- de données ni être visible dans une table que quelqu'un d'autre avec
-- un accès admin au projet Supabase pourrait consulter.
-- C'est un choix de sécurité délibéré, pas un oubli — à ne pas "corriger"
-- en ajoutant apiKey dans le schéma plus tard sans y réfléchir.
