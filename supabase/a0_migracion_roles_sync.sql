-- =====================================================================
-- VALHALLA · Fase A0 · Roles (coach / student) + sincronización híbrida
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase. Se puede ejecutar varias veces.
--
-- Qué hace:
--   * profiles: roles 'coach' y 'student' (por defecto 'student').
--   * coach_state: una fila por entrenador con el estado de la app (sin finanzas).
--   * client_links, student_programs, student_progress, student_sets: capa de alumnos.
--   * Funciones is_coach(), my_client_id() y auxiliares de permisos.
--   * RLS activado y con políticas explícitas en todas las tablas nuevas.
--
-- Qué NO hace:
--   * No borra tablas ni datos. Las 21 tablas de schema.sql (si existen) quedan
--     sin uso; solo se quitan sus políticas de lectura para alumnos.
--   * No contiene claves ni contraseñas.
--
-- No ejecutar supabase/schema.sql ni supabase/seed-example.sql en este proyecto.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Utilidades
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. profiles (puede existir desde schema.sql; se adapta sin borrar nada)
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'student',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles alter column role set default 'student';

-- La restricción vieja permitía admin/client/trainer/nutritionist.
-- NOT VALID: se aplica a filas nuevas o modificadas sin fallar por filas antiguas
-- (el script de prueba avisa si quedan filas con roles viejos).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('coach', 'student')) not valid;

create or replace trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Toda cuenta nueva nace como 'student'. El rol 'coach' se asigna a mano en el SQL Editor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'student', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. Tablas nuevas
-- ---------------------------------------------------------------------

-- Estado completo de la app de un entrenador (lo mismo que localStorage, sin finanzas).
create table if not exists public.coach_state (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint coach_state_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint coach_state_version_positive check (version >= 1),
  -- Claves de finanzas del estado local (assets/js/data.js). No deben subir a la nube.
  constraint coach_state_no_finance check (
    not (data ?| array['accounts', 'categories', 'movements', 'recurring',
                       'recurringTransactions', 'financialGoals', 'debts'])
  )
);

-- Vínculo cuenta de alumno -> cliente del entrenador (ids de texto de la app).
create table if not exists public.client_links (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id text not null,
  can_self_log boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_links_client_id_len check (char_length(client_id) between 1 and 200),
  -- Evita repetir el bug de guardar el id del entrenador como si fuera el alumno.
  constraint client_links_not_self check (auth_user_id <> owner_id),
  constraint client_links_owner_client_unique unique (owner_id, client_id)
);

-- Una cuenta de alumno tiene como máximo un vínculo activo.
create unique index if not exists client_links_one_active_per_user
  on public.client_links (auth_user_id) where active;

-- Programa asignado y publicado al alumno (botón "Publicar al alumno").
create table if not exists public.student_programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id text not null,
  assignment_id text not null,
  program_id text,
  title text,
  data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_programs_client_id_len check (char_length(client_id) between 1 and 200),
  constraint student_programs_assignment_id_len check (char_length(assignment_id) between 1 and 200),
  constraint student_programs_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint student_programs_unique unique (owner_id, client_id, assignment_id)
);

-- Historial de series publicado por el entrenador (una fila por sesión).
create table if not exists public.student_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id text not null,
  session_id text not null,
  session_date date,
  title text,
  data jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_progress_client_id_len check (char_length(client_id) between 1 and 200),
  constraint student_progress_session_id_len check (char_length(session_id) between 1 and 200),
  constraint student_progress_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint student_progress_unique unique (owner_id, client_id, session_id)
);

-- Series que registra el propio alumno (o el entrenador en su nombre).
create table if not exists public.student_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id text not null,
  auth_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assignment_id text not null,
  session_date date not null,
  day_id text not null,
  exercise_id text not null,
  set_type text not null default 'S',  -- 'A' aproximación, 'S' serie efectiva
  set_number integer not null,
  weight numeric,
  reps integer,
  rir numeric,
  completed boolean not null default true,
  notes text,
  coach_validated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_sets_set_number_range check (set_number between 1 and 50),
  constraint student_sets_weight_range check (weight is null or (weight >= 0 and weight < 1000)),
  constraint student_sets_reps_range check (reps is null or (reps >= 0 and reps <= 1000)),
  constraint student_sets_rir_range check (rir is null or (rir >= 0 and rir <= 10)),
  constraint student_sets_notes_len check (notes is null or char_length(notes) <= 500),
  constraint student_sets_session_date_min check (session_date >= date '2020-01-01')
);

-- Restricciones que pueden cambiar entre versiones de este script: se quitan y se
-- vuelven a crear para que una base donde ya corrió una versión anterior quede igual
-- que una nueva.

-- student_sets.set_type (por si la tabla se creó antes de existir la columna).
alter table public.student_sets add column if not exists set_type text not null default 'S';

alter table public.student_sets drop constraint if exists student_sets_set_type_valid;
alter table public.student_sets
  add constraint student_sets_set_type_valid check (set_type in ('A', 'S'));

-- Una serie se identifica también por su tipo: A1 y S1 del mismo ejercicio conviven.
alter table public.student_sets drop constraint if exists student_sets_unique;
alter table public.student_sets
  add constraint student_sets_unique
  unique (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number);

-- Lo publicado al alumno no puede contener datos de pago a NINGÚN nivel del JSON.
-- Es una red de seguridad; la regla principal está en supabase/A0_CRITERIOS_ACEPTACION.md
-- (copiar solo campos permitidos al publicar).
alter table public.student_programs drop constraint if exists student_programs_no_finance;
alter table public.student_programs
  add constraint student_programs_no_finance check (
    not jsonb_path_exists(data, 'lax $.** ? (exists(@.monthly_value) || exists(@.amount) || exists(@.payment_status) || exists(@.payments) || exists(@.renewal_date) || exists(@.renewal_day) || exists(@.movements) || exists(@.accounts))')
  );

alter table public.student_progress drop constraint if exists student_progress_no_finance;
alter table public.student_progress
  add constraint student_progress_no_finance check (
    not jsonb_path_exists(data, 'lax $.** ? (exists(@.monthly_value) || exists(@.amount) || exists(@.payment_status) || exists(@.payments) || exists(@.renewal_date) || exists(@.renewal_day) || exists(@.movements) || exists(@.accounts))')
  );

create index if not exists idx_student_programs_owner_client on public.student_programs (owner_id, client_id, active);
create index if not exists idx_student_progress_owner_client on public.student_progress (owner_id, client_id, session_date desc);
create index if not exists idx_student_sets_owner_client_date on public.student_sets (owner_id, client_id, session_date desc);
create index if not exists idx_client_links_owner on public.client_links (owner_id);

-- updated_at automático
create or replace trigger trg_client_links_updated_at
before update on public.client_links
for each row execute function public.set_updated_at();

create or replace trigger trg_student_programs_updated_at
before update on public.student_programs
for each row execute function public.set_updated_at();

create or replace trigger trg_student_progress_updated_at
before update on public.student_progress
for each row execute function public.set_updated_at();

create or replace trigger trg_student_sets_updated_at
before update on public.student_sets
for each row execute function public.set_updated_at();

-- coach_state: cada guardado debe subir la versión exactamente en 1.
-- La app actualiza con "where version = <la que leyó>"; si otro dispositivo
-- guardó antes, no se actualiza ninguna fila y la app muestra el aviso de conflicto.
create or replace function public.coach_state_check_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'VERSION_CONFLICT: versión actual %, recibida %', old.version, new.version;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_coach_state_version
before update on public.coach_state
for each row execute function public.coach_state_check_version();

-- ---------------------------------------------------------------------
-- 4. Funciones de permisos (security definer: leen profiles/client_links
--    sin pasar por RLS, para evitar recursión)
-- ---------------------------------------------------------------------

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'coach'
      and p.active
  );
$$;

create or replace function public.my_client_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.client_id
  from public.client_links l
  join public.profiles p on p.id = l.auth_user_id
  where l.auth_user_id = auth.uid()
    and l.active
    and p.active
    and p.role = 'student'
  limit 1;
$$;

-- ¿El usuario conectado es el alumno vinculado a (entrenador, cliente)?
create or replace function public.is_my_client(p_owner_id uuid, p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_links l
    join public.profiles p on p.id = l.auth_user_id
    where l.auth_user_id = auth.uid()
      and l.owner_id = p_owner_id
      and l.client_id = p_client_id
      and l.active
      and p.active
      and p.role = 'student'
  );
$$;

-- ¿Además tiene permiso para registrar sus propias series?
create or replace function public.my_can_self_log(p_owner_id uuid, p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_links l
    join public.profiles p on p.id = l.auth_user_id
    where l.auth_user_id = auth.uid()
      and l.owner_id = p_owner_id
      and l.client_id = p_client_id
      and l.active
      and l.can_self_log
      and p.active
      and p.role = 'student'
  );
$$;

revoke all on function public.is_coach() from public, anon;
revoke all on function public.my_client_id() from public, anon;
revoke all on function public.is_my_client(uuid, text) from public, anon;
revoke all on function public.my_can_self_log(uuid, text) from public, anon;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.my_client_id() to authenticated;
grant execute on function public.is_my_client(uuid, text) to authenticated;
grant execute on function public.my_can_self_log(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Privilegios de tabla (RLS decide las filas; esto decide las operaciones)
-- ---------------------------------------------------------------------

-- anon (sin sesión) no toca nada de esto.
revoke all on public.profiles, public.coach_state, public.client_links,
  public.student_programs, public.student_progress, public.student_sets from anon;

-- profiles: con sesión solo se puede leer. Nadie la modifica desde la app;
-- los roles se cambian en el SQL Editor.
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Tablas nuevas: operaciones normales; sin TRUNCATE (que ignora RLS).
revoke all on public.coach_state, public.client_links, public.student_programs,
  public.student_progress, public.student_sets from authenticated;
grant select, insert, update, delete on public.coach_state, public.client_links,
  public.student_programs, public.student_progress, public.student_sets to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS y políticas
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.coach_state enable row level security;
alter table public.client_links enable row level security;
alter table public.student_programs enable row level security;
alter table public.student_progress enable row level security;
alter table public.student_sets enable row level security;

-- profiles --------------------------------------------------------------
drop policy if exists profiles_admin_policy on public.profiles;        -- vieja (schema.sql)
drop policy if exists profiles_client_read_policy on public.profiles;  -- vieja (schema.sql)

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_coach_select_linked on public.profiles;
create policy profiles_coach_select_linked on public.profiles
for select to authenticated
using (
  (select public.is_coach())
  and exists (
    select 1 from public.client_links l
    where l.owner_id = (select auth.uid())
      and l.auth_user_id = profiles.id
  )
);

-- coach_state -----------------------------------------------------------
drop policy if exists coach_state_coach_all on public.coach_state;
create policy coach_state_coach_all on public.coach_state
for all to authenticated
using ((select public.is_coach()) and owner_id = (select auth.uid()))
with check ((select public.is_coach()) and owner_id = (select auth.uid()));

-- client_links ----------------------------------------------------------
drop policy if exists client_links_coach_all on public.client_links;
create policy client_links_coach_all on public.client_links
for all to authenticated
using ((select public.is_coach()) and owner_id = (select auth.uid()))
with check ((select public.is_coach()) and owner_id = (select auth.uid()));

drop policy if exists client_links_student_select_own on public.client_links;
create policy client_links_student_select_own on public.client_links
for select to authenticated
using (auth_user_id = (select auth.uid()));

-- student_programs ------------------------------------------------------
drop policy if exists student_programs_coach_all on public.student_programs;
create policy student_programs_coach_all on public.student_programs
for all to authenticated
using ((select public.is_coach()) and owner_id = (select auth.uid()))
with check ((select public.is_coach()) and owner_id = (select auth.uid()));

drop policy if exists student_programs_student_select on public.student_programs;
create policy student_programs_student_select on public.student_programs
for select to authenticated
using (active and public.is_my_client(owner_id, client_id));

-- student_progress ------------------------------------------------------
drop policy if exists student_progress_coach_all on public.student_progress;
create policy student_progress_coach_all on public.student_progress
for all to authenticated
using ((select public.is_coach()) and owner_id = (select auth.uid()))
with check ((select public.is_coach()) and owner_id = (select auth.uid()));

drop policy if exists student_progress_student_select on public.student_progress;
create policy student_progress_student_select on public.student_progress
for select to authenticated
using (public.is_my_client(owner_id, client_id));

-- student_sets ----------------------------------------------------------
drop policy if exists student_sets_coach_all on public.student_sets;
create policy student_sets_coach_all on public.student_sets
for all to authenticated
using ((select public.is_coach()) and owner_id = (select auth.uid()))
with check ((select public.is_coach()) and owner_id = (select auth.uid()));

drop policy if exists student_sets_student_select on public.student_sets;
create policy student_sets_student_select on public.student_sets
for select to authenticated
using (public.is_my_client(owner_id, client_id));

drop policy if exists student_sets_student_insert on public.student_sets;
create policy student_sets_student_insert on public.student_sets
for insert to authenticated
with check (
  public.my_can_self_log(owner_id, client_id)
  and auth_user_id = (select auth.uid())
  and coach_validated = false
  and exists (
    select 1 from public.student_programs sp
    where sp.owner_id = student_sets.owner_id
      and sp.client_id = student_sets.client_id
      and sp.assignment_id = student_sets.assignment_id
      and sp.active
  )
);

drop policy if exists student_sets_student_update on public.student_sets;
create policy student_sets_student_update on public.student_sets
for update to authenticated
using (
  public.my_can_self_log(owner_id, client_id)
  and auth_user_id = (select auth.uid())
  and coach_validated = false
)
with check (
  public.my_can_self_log(owner_id, client_id)
  and auth_user_id = (select auth.uid())
  and coach_validated = false
  and exists (
    select 1 from public.student_programs sp
    where sp.owner_id = student_sets.owner_id
      and sp.client_id = student_sets.client_id
      and sp.assignment_id = student_sets.assignment_id
      and sp.active
  )
);
-- Sin política de DELETE para alumnos: solo el entrenador borra series.

-- ---------------------------------------------------------------------
-- 7. Tablas viejas de schema.sql (si existen): se quitan las lecturas de alumno.
--    No se borran tablas ni datos. Con RLS activo y sin esas políticas,
--    un alumno no ve nada en ellas.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'client_assessments', 'client_renewals',
                           'training_plans', 'training_sessions',
                           'training_exercises', 'training_sets']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_client_read_policy', t);
    end if;
  end loop;
end;
$$;

commit;
