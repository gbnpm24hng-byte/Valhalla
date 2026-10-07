-- =====================================================================
-- VALHALLA · Fase B3.1 · Reglas para que el alumno registre sus series
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de a0_migracion_roles_sync.sql.
-- Se puede ejecutar varias veces. Para volver a las reglas de A0: b3_1_deshacer.sql.
--
-- Qué hace (solo en student_sets, y solo para alumnos; el entrenador no cambia):
--   * El alumno escribe únicamente en ejercicios y días que existen en su programa
--     publicado y vigente, y solo hasta las series (S) y aproximaciones (A) de la rutina.
--   * Fechas: hoy y hasta 3 días atrás, en hora de Chile, para crear y para modificar.
--   * Sin notas.
--   * No puede mover una serie (cambiar ejercicio, día, fecha, número o tipo) ni
--     cambiar de quién es.
--   * Lo que ya registró en un programa que dejó de estar publicado se conserva,
--     pero no se puede volver a modificar.
--   * El RIR no lo exige la base (lo exigirá la app).
--
-- Qué NO hace:
--   * No borra tablas, filas ni columnas. No toca coach_state ni la app.
--   * No activa a ningún alumno: can_self_log se cambia a mano.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Funciones de apoyo
-- ---------------------------------------------------------------------

-- Fecha de hoy en Chile (la base trabaja en UTC).
create or replace function public.b3_chile_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- ¿La fecha está entre hoy y 3 días atrás (hora de Chile)?
create or replace function public.b3_student_date_ok(p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_date is not null
     and p_date between public.b3_chile_today() - 3 and public.b3_chile_today();
$$;

-- ¿La serie cabe en el programa publicado y vigente de ese alumno?
-- Día y ejercicio deben existir; el número no puede pasar de las series (S) de la
-- rutina ni de sus aproximaciones (A). Lee student_programs sin pasar por RLS.
create or replace function public.b3_set_fits_program(
  p_owner_id uuid,
  p_client_id text,
  p_assignment_id text,
  p_day_id text,
  p_exercise_id text,
  p_set_type text,
  p_set_number integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_programs sp
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sp.data -> 'days') = 'array' then sp.data -> 'days' else '[]'::jsonb end
    ) as d(day)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.day -> 'exercises') = 'array' then d.day -> 'exercises' else '[]'::jsonb end
    ) as e(ex)
    where sp.owner_id = p_owner_id
      and sp.client_id = p_client_id
      and sp.assignment_id = p_assignment_id
      and sp.active
      and d.day ->> 'id' = p_day_id
      and e.ex ->> 'id' = p_exercise_id
      and p_set_number >= 1
      and p_set_number <= case p_set_type
        when 'S' then case when jsonb_typeof(e.ex -> 'sets') = 'number' then floor((e.ex ->> 'sets')::numeric)::integer else 0 end
        when 'A' then case when jsonb_typeof(e.ex -> 'approximations') = 'array' then jsonb_array_length(e.ex -> 'approximations') else 0 end
        else 0
      end
  );
$$;

revoke all on function public.b3_chile_today() from public, anon;
revoke all on function public.b3_student_date_ok(date) from public, anon;
revoke all on function public.b3_set_fits_program(uuid, text, text, text, text, text, integer) from public, anon;
grant execute on function public.b3_chile_today() to authenticated;
grant execute on function public.b3_student_date_ok(date) to authenticated;
grant execute on function public.b3_set_fits_program(uuid, text, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Políticas del alumno en student_sets (las del entrenador no cambian)
-- ---------------------------------------------------------------------

drop policy if exists student_sets_student_insert on public.student_sets;
create policy student_sets_student_insert on public.student_sets
for insert to authenticated
with check (
  public.my_can_self_log(owner_id, client_id)
  and auth_user_id = (select auth.uid())
  and coach_validated = false
  and notes is null
  and public.b3_student_date_ok(session_date)
  and public.b3_set_fits_program(owner_id, client_id, assignment_id, day_id, exercise_id, set_type, set_number)
);

-- USING revisa la serie como está guardada; WITH CHECK, como quedaría.
drop policy if exists student_sets_student_update on public.student_sets;
create policy student_sets_student_update on public.student_sets
for update to authenticated
using (
  public.my_can_self_log(owner_id, client_id)
  and auth_user_id = (select auth.uid())
  and coach_validated = false
  and public.b3_student_date_ok(session_date)
  and public.b3_set_fits_program(owner_id, client_id, assignment_id, day_id, exercise_id, set_type, set_number)
)
with check (
  public.my_can_self_log(owner_id, client_id)
  and auth_user_id = (select auth.uid())
  and coach_validated = false
  and notes is null
  and public.b3_student_date_ok(session_date)
  and public.b3_set_fits_program(owner_id, client_id, assignment_id, day_id, exercise_id, set_type, set_number)
);
-- Sigue sin política de DELETE para alumnos: solo el entrenador borra series.

-- ---------------------------------------------------------------------
-- 3. El alumno no puede mover una serie ni cambiar de quién es
-- ---------------------------------------------------------------------
-- Solo aplica a sesiones de alumno (rol "authenticated" sin ser entrenador).
-- El entrenador y el SQL Editor no se ven afectados.
create or replace function public.b3_student_sets_lock_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.is_coach() then
    if new.owner_id is distinct from old.owner_id
      or new.client_id is distinct from old.client_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.assignment_id is distinct from old.assignment_id
      or new.session_date is distinct from old.session_date
      or new.day_id is distinct from old.day_id
      or new.exercise_id is distinct from old.exercise_id
      or new.set_type is distinct from old.set_type
      or new.set_number is distinct from old.set_number
      or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'B3_SERIE_BLOQUEADA: el alumno no puede mover una serie';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_sets_lock_keys on public.student_sets;
create trigger trg_student_sets_lock_keys
before update on public.student_sets
for each row execute function public.b3_student_sets_lock_keys();

commit;
