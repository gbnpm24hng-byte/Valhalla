-- VALHALLA Supabase schema
-- Objetivo: preparar la primera arquitectura para usuarios, finanzas y clientes/pagos.
-- Este script está pensado para copiar y ejecutar en el SQL Editor de Supabase.

-- Extensiones necesarias
create extension if not exists pgcrypto;

-- Helper para updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tabla profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('admin', 'client', 'trainer', 'nutritionist')) default 'client',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Helper para obtener el rol del usuario autenticado sin recursión en RLS
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

-- Tabla accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  account_type text,
  currency text not null default 'CLP',
  initial_balance numeric not null default 0,
  operational boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

-- Tabla financial_movements
create table if not exists public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  movement_type text not null check (movement_type in ('income', 'expense')),
  scope text not null check (scope in ('personal', 'vikingos')),
  category text not null,
  description text not null,
  amount numeric not null check (amount > 0),
  movement_date date not null,
  client_id uuid,
  payment_id uuid,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_financial_movements_updated_at
before update on public.financial_movements
for each row execute function public.set_updated_at();

-- Tabla recurring_transactions
create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  scope text not null check (scope in ('personal', 'vikingos')),
  category text not null,
  amount numeric not null default 0,
  frequency text not null,
  day_of_month integer,
  weekday integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_recurring_transactions_updated_at
before update on public.recurring_transactions
for each row execute function public.set_updated_at();

-- Tabla financial_goals
create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric not null default 0,
  current_amount numeric not null default 0,
  priority integer not null default 1,
  target_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_financial_goals_updated_at
before update on public.financial_goals
for each row execute function public.set_updated_at();

-- Tabla debts
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  total_installments integer not null default 0,
  paid_installments integer not null default 0,
  installment_amount numeric not null default 0,
  payment_day integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_debts_updated_at
before update on public.debts
for each row execute function public.set_updated_at();

-- Tabla clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  birth_date date,
  weight numeric,
  height numeric,
  emergency_contact text,
  emergency_phone text,
  photo_url text,
  last_assessment date,
  next_assessment date,
  phone text,
  service text,
  schedule_notes text,
  objective text,
  injuries text,
  observations text,
  start_date date,
  renewal_date date,
  monthly_value numeric default 0,
  payment_status text check (payment_status in ('paid', 'pending', 'overdue', 'uncertain')) default 'pending',
  client_status text check (client_status in ('active', 'paused', 'uncertain', 'inactive')) default 'active',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

-- Tabla client_payments
create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null,
  period_start date,
  period_end date,
  payment_method text,
  status text not null check (status in ('expected', 'paid', 'late', 'cancelled')) default 'expected',
  financial_movement_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_client_payments_updated_at
before update on public.client_payments
for each row execute function public.set_updated_at();

-- Tabla client_assessments
create table if not exists public.client_assessments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_date date not null,
  weight numeric,
  fat_percentage numeric,
  muscle_mass numeric,
  waist numeric,
  hip numeric,
  chest numeric,
  arm numeric,
  thigh numeric,
  calf numeric,
  photo_urls text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_client_assessments_updated_at
before update on public.client_assessments
for each row execute function public.set_updated_at();

-- Tabla client_renewals
create table if not exists public.client_renewals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  expected_date date not null,
  renewal_date date,
  expected_amount numeric,
  status text not null check (status in ('upcoming', 'due', 'paid', 'overdue', 'cancelled')) default 'upcoming',
  payment_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_client_renewals_updated_at
before update on public.client_renewals
for each row execute function public.set_updated_at();

-- Tablas entrenamiento v0.8 (modelo cloud)
create table if not exists public.training_plans (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_training_plans_updated_at
before update on public.training_plans
for each row execute function public.set_updated_at();

create table if not exists public.training_sessions (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id text references public.training_plans(id) on delete set null,
  group_session_id text,
  session_date date,
  title text not null,
  status text not null check (status in ('planned', 'in_progress', 'completed')) default 'in_progress',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_training_sessions_updated_at
before update on public.training_sessions
for each row execute function public.set_updated_at();

create table if not exists public.training_exercises (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id text not null references public.training_sessions(id) on delete cascade,
  library_exercise_id uuid,
  exercise_name text not null,
  exercise_order integer not null default 1,
  planned_sets integer not null default 1,
  planned_rep_min integer not null default 1,
  planned_rep_max integer not null default 1,
  target_weight numeric not null default 0,
  rest_seconds integer not null default 90,
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_training_exercises_updated_at
before update on public.training_exercises
for each row execute function public.set_updated_at();

create table if not exists public.training_sets (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id text not null references public.training_sessions(id) on delete cascade,
  exercise_id text not null references public.training_exercises(id) on delete cascade,
  set_number integer not null,
  weight numeric not null default 0,
  reps integer not null default 0,
  completed boolean not null default true,
  technique_status text not null default 'pending',
  coach_validated boolean not null default false,
  personal_record boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, set_number)
);

create or replace trigger trg_training_sets_updated_at
before update on public.training_sets
for each row execute function public.set_updated_at();

-- Biblioteca de ejercicios v1
create table if not exists public.library_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  description text,
  pattern text not null check (pattern in ('squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'lunge', 'carry', 'rotation', 'anti_rotation', 'core_flexion', 'core_extension', 'isolation', 'locomotion', 'cardio', 'mobility', 'other')) default 'other',
  primary_muscle text not null check (primary_muscle in ('quadriceps', 'hamstrings', 'glutes', 'calves', 'chest', 'lats', 'upper_back', 'traps', 'front_delts', 'lateral_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abdominals', 'obliques', 'spinal_erectors', 'adductors', 'abductors', 'full_body')) default 'full_body',
  technical_level text not null check (technical_level in ('beginner', 'intermediate', 'advanced')) default 'beginner',
  load_type text not null check (load_type in ('external_load', 'bodyweight', 'machine', 'cardio', 'mobility')) default 'external_load',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

create or replace trigger trg_library_exercises_updated_at
before update on public.library_exercises
for each row execute function public.set_updated_at();

create table if not exists public.library_exercise_secondary_muscles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.library_exercises(id) on delete cascade,
  muscle_key text not null check (muscle_key in ('quadriceps', 'hamstrings', 'glutes', 'calves', 'chest', 'lats', 'upper_back', 'traps', 'front_delts', 'lateral_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abdominals', 'obliques', 'spinal_erectors', 'adductors', 'abductors', 'full_body')),
  created_at timestamptz not null default now(),
  unique (exercise_id, muscle_key)
);

create table if not exists public.library_exercise_equipments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.library_exercises(id) on delete cascade,
  equipment_key text not null check (equipment_key in ('bodyweight', 'barbell', 'semi_olympic_bar', 'dumbbell', 'kettlebell', 'smith_machine', 'power_rack', 'bench', 'cable', 'resistance_band', 'trx', 'leg_press', 'leg_extension', 'leg_curl', 'hip_abductor_machine', 'hip_adductor_machine', 'hip_thrust_machine', 'bike', 'skierg', 'box', 'step', 'medicine_ball', 'sandbag', 'other')),
  created_at timestamptz not null default now(),
  unique (exercise_id, equipment_key)
);

create table if not exists public.library_exercise_relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.library_exercises(id) on delete cascade,
  related_exercise_id uuid not null references public.library_exercises(id) on delete cascade,
  relation_type text not null check (relation_type in ('variant_of', 'alternative_to', 'regression_of', 'progression_of')),
  notes text,
  created_at timestamptz not null default now(),
  unique (exercise_id, related_exercise_id, relation_type)
);

-- Ficha deportiva v1
create table if not exists public.client_sports_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary_goal text not null check (primary_goal in ('ganancia_muscular', 'perdida_grasa', 'fuerza', 'acondicionamiento', 'salud_general', 'rendimiento', 'otro')) default 'otro',
  secondary_goal text check (secondary_goal in ('ganancia_muscular', 'perdida_grasa', 'fuerza', 'acondicionamiento', 'salud_general', 'rendimiento', 'otro')),
  goal_notes text,
  experience_level text not null check (experience_level in ('principiante', 'intermedio', 'avanzado')) default 'principiante',
  experience_months integer not null default 0 check (experience_months >= 0),
  coach_start_date date,
  sessions_per_week integer not null default 3 check (sessions_per_week >= 0 and sessions_per_week <= 14),
  session_duration_minutes integer not null default 60 check (session_duration_minutes >= 0 and session_duration_minutes <= 300),
  coach_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);

create or replace trigger trg_client_sports_profiles_updated_at
before update on public.client_sports_profiles
for each row execute function public.set_updated_at();

create table if not exists public.client_sports_considerations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text,
  status text not null check (status in ('activa', 'en_observacion', 'resuelta')) default 'activa',
  noted_on date not null default current_date,
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger trg_client_sports_considerations_updated_at
before update on public.client_sports_considerations
for each row execute function public.set_updated_at();

create table if not exists public.client_movement_statuses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  library_exercise_id uuid,
  movement_name text not null,
  movement_key text not null,
  status text not null check (status in ('dominado', 'tolerado', 'en_aprendizaje', 'no_evaluado', 'adaptar', 'restringido')) default 'no_evaluado',
  coach_note text,
  evaluated_1rm numeric,
  last_evaluated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, movement_key)
);

create or replace trigger trg_client_movement_statuses_updated_at
before update on public.client_movement_statuses
for each row execute function public.set_updated_at();

-- Índices recomendados para crecimiento sostenido
create index if not exists idx_profiles_role_active on public.profiles (role, active);
create index if not exists idx_accounts_owner_active on public.accounts (owner_id, active, operational);
create index if not exists idx_financial_movements_owner_date on public.financial_movements (owner_id, movement_date desc, movement_type, scope);
create index if not exists idx_financial_movements_account on public.financial_movements (account_id);
create index if not exists idx_financial_movements_client on public.financial_movements (client_id);
create index if not exists idx_financial_movements_payment on public.financial_movements (payment_id);
create index if not exists idx_recurring_owner_active on public.recurring_transactions (owner_id, active, transaction_type);
create index if not exists idx_financial_goals_owner_active on public.financial_goals (owner_id, active, target_date);
create index if not exists idx_debts_owner_active on public.debts (owner_id, active);
create index if not exists idx_clients_owner_status on public.clients (owner_id, active, payment_status, client_status);
create index if not exists idx_clients_auth_user on public.clients (auth_user_id);
create index if not exists idx_clients_renewal on public.clients (renewal_date);
create index if not exists idx_client_payments_owner_date on public.client_payments (owner_id, payment_date desc, status);
create index if not exists idx_client_payments_client on public.client_payments (client_id);
create index if not exists idx_client_assessments_client_date on public.client_assessments (client_id, assessment_date desc);
create index if not exists idx_client_renewals_client_date on public.client_renewals (client_id, expected_date desc, status);
create index if not exists idx_training_plans_owner_client on public.training_plans (owner_id, client_id, active);
create index if not exists idx_training_sessions_owner_client_date on public.training_sessions (owner_id, client_id, session_date desc);
create index if not exists idx_training_exercises_session_order on public.training_exercises (session_id, exercise_order);
create index if not exists idx_training_sets_exercise_set on public.training_sets (exercise_id, set_number);
create index if not exists idx_training_sets_client_created on public.training_sets (client_id, created_at desc);
create index if not exists idx_library_exercises_owner_active on public.library_exercises (owner_id, active, pattern, primary_muscle, technical_level);
create index if not exists idx_library_exercises_normalized_name on public.library_exercises (owner_id, normalized_name);
create index if not exists idx_library_exercise_secondary_muscles_exercise on public.library_exercise_secondary_muscles (exercise_id, muscle_key);
create index if not exists idx_library_exercise_equipments_exercise on public.library_exercise_equipments (exercise_id, equipment_key);
create index if not exists idx_library_exercise_relations_exercise on public.library_exercise_relations (exercise_id, relation_type);
create index if not exists idx_client_sports_profiles_owner_client on public.client_sports_profiles (owner_id, client_id);
create index if not exists idx_client_sports_considerations_client_status on public.client_sports_considerations (client_id, status, noted_on desc);
create index if not exists idx_client_movement_statuses_client_key on public.client_movement_statuses (client_id, movement_key);
create index if not exists idx_client_movement_statuses_library_exercise on public.client_movement_statuses (client_id, library_exercise_id);

-- Habilitar RLS
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.financial_movements enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.financial_goals enable row level security;
alter table public.debts enable row level security;
alter table public.clients enable row level security;
alter table public.client_payments enable row level security;
alter table public.client_assessments enable row level security;
alter table public.client_renewals enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_exercises enable row level security;
alter table public.training_sets enable row level security;
alter table public.library_exercises enable row level security;
alter table public.library_exercise_secondary_muscles enable row level security;
alter table public.library_exercise_equipments enable row level security;
alter table public.library_exercise_relations enable row level security;
alter table public.client_sports_profiles enable row level security;
alter table public.client_sports_considerations enable row level security;
alter table public.client_movement_statuses enable row level security;

-- Políticas base
-- Admin: puede gestionar sus propios registros.
drop policy if exists profiles_admin_policy on public.profiles;
create policy profiles_admin_policy on public.profiles
for all
using (public.current_user_role() = 'admin' and id = auth.uid())
with check (public.current_user_role() = 'admin' and id = auth.uid());

drop policy if exists accounts_admin_policy on public.accounts;
create policy accounts_admin_policy on public.accounts
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists financial_movements_admin_policy on public.financial_movements;
create policy financial_movements_admin_policy on public.financial_movements
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists recurring_transactions_admin_policy on public.recurring_transactions;
create policy recurring_transactions_admin_policy on public.recurring_transactions
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists financial_goals_admin_policy on public.financial_goals;
create policy financial_goals_admin_policy on public.financial_goals
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists debts_admin_policy on public.debts;
create policy debts_admin_policy on public.debts
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists clients_admin_policy on public.clients;
create policy clients_admin_policy on public.clients
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists client_payments_admin_policy on public.client_payments;
create policy client_payments_admin_policy on public.client_payments
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists client_assessments_admin_policy on public.client_assessments;
create policy client_assessments_admin_policy on public.client_assessments
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists client_renewals_admin_policy on public.client_renewals;
create policy client_renewals_admin_policy on public.client_renewals
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists training_plans_admin_policy on public.training_plans;
create policy training_plans_admin_policy on public.training_plans
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists training_sessions_admin_policy on public.training_sessions;
create policy training_sessions_admin_policy on public.training_sessions
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists training_exercises_admin_policy on public.training_exercises;
create policy training_exercises_admin_policy on public.training_exercises
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists training_sets_admin_policy on public.training_sets;
create policy training_sets_admin_policy on public.training_sets
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists library_exercises_admin_policy on public.library_exercises;
create policy library_exercises_admin_policy on public.library_exercises
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists library_exercise_secondary_muscles_admin_policy on public.library_exercise_secondary_muscles;
create policy library_exercise_secondary_muscles_admin_policy on public.library_exercise_secondary_muscles
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists library_exercise_equipments_admin_policy on public.library_exercise_equipments;
create policy library_exercise_equipments_admin_policy on public.library_exercise_equipments
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists library_exercise_relations_admin_policy on public.library_exercise_relations;
create policy library_exercise_relations_admin_policy on public.library_exercise_relations
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists client_sports_profiles_admin_policy on public.client_sports_profiles;
create policy client_sports_profiles_admin_policy on public.client_sports_profiles
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists client_sports_considerations_admin_policy on public.client_sports_considerations;
create policy client_sports_considerations_admin_policy on public.client_sports_considerations
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

drop policy if exists client_movement_statuses_admin_policy on public.client_movement_statuses;
create policy client_movement_statuses_admin_policy on public.client_movement_statuses
for all
using (public.current_user_role() = 'admin' and owner_id = auth.uid())
with check (public.current_user_role() = 'admin' and owner_id = auth.uid());

-- Cliente autenticado: solo puede leer su propio profile
create policy profiles_client_read_policy on public.profiles
for select
using (id = auth.uid());

-- Cliente autenticado: solo puede leer su ficha de cliente
create policy clients_client_read_policy on public.clients
for select
using (auth_user_id = auth.uid());

-- Cliente autenticado: solo puede leer sus evaluaciones
create policy client_assessments_client_read_policy on public.client_assessments
for select
using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

-- Cliente autenticado: solo puede leer sus renovaciones
create policy client_renewals_client_read_policy on public.client_renewals
for select
using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

drop policy if exists training_plans_client_read_policy on public.training_plans;
create policy training_plans_client_read_policy on public.training_plans
for select
using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

drop policy if exists training_sessions_client_read_policy on public.training_sessions;
create policy training_sessions_client_read_policy on public.training_sessions
for select
using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

drop policy if exists training_exercises_client_read_policy on public.training_exercises;
create policy training_exercises_client_read_policy on public.training_exercises
for select
using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

drop policy if exists training_sets_client_read_policy on public.training_sets;
create policy training_sets_client_read_policy on public.training_sets
for select
using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

-- Los clientes no pueden insertar, editar ni eliminar evaluaciones, renovaciones, pagos ni información financiera.
-- No se crean políticas de escritura para esas tablas; quedarán bloqueadas por defecto.
-- Entrenadores: se deja preparada la estructura para permisos futuros, sin habilitar permisos temporales en esta fase.

-- Trigger para crear profile básico al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'client', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();

-- Relaciones adicionales para preservar historial financiero y permitir escalabilidad
-- Se usan restricciones de referencia seguras para no perder trazabilidad en pagos o movimientos.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'financial_movements_client_id_fkey'
  ) then
    alter table public.financial_movements
      add constraint financial_movements_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null on update cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'financial_movements_payment_id_fkey'
  ) then
    alter table public.financial_movements
      add constraint financial_movements_payment_id_fkey
      foreign key (payment_id) references public.client_payments(id) on delete set null on update cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_payments_financial_movement_id_fkey'
  ) then
    alter table public.client_payments
      add constraint client_payments_financial_movement_id_fkey
      foreign key (financial_movement_id) references public.financial_movements(id) on delete set null on update cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_renewals_payment_id_fkey'
  ) then
    alter table public.client_renewals
      add constraint client_renewals_payment_id_fkey
      foreign key (payment_id) references public.client_payments(id) on delete set null on update cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_exercises_library_exercise_id_fkey'
  ) then
    alter table public.training_exercises
      add constraint training_exercises_library_exercise_id_fkey
      foreign key (library_exercise_id) references public.library_exercises(id) on delete set null on update cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_movement_statuses_library_exercise_id_fkey'
  ) then
    alter table public.client_movement_statuses
      add constraint client_movement_statuses_library_exercise_id_fkey
      foreign key (library_exercise_id) references public.library_exercises(id) on delete set null on update cascade;
  end if;
end $$;
