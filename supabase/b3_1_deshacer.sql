-- =====================================================================
-- VALHALLA · Deshacer la fase B3.1 (volver a las reglas de A0 en student_sets)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase solo si hay que volver atrás después de
-- b3_1_registro_alumno.sql. Se puede ejecutar varias veces.
--
-- Qué hace:
--   * Deja las políticas del alumno en student_sets exactamente como en
--     a0_migracion_roles_sync.sql.
--   * Quita el bloqueo para mover series y las funciones de apoyo de B3.1.
--
-- Qué NO hace:
--   * No borra tablas ni filas: las series ya registradas se conservan.
--   * No cambia can_self_log. Si activaste a algún alumno y quieres que deje de
--     registrar, ponlo en false aparte.
-- =====================================================================

begin;

drop trigger if exists trg_student_sets_lock_keys on public.student_sets;

-- Políticas de A0 (copiadas de a0_migracion_roles_sync.sql, sección 6).
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

-- Las funciones ya no las usa ninguna política.
drop function if exists public.b3_student_sets_lock_keys();
drop function if exists public.b3_set_fits_program(uuid, text, text, text, text, text, integer);
drop function if exists public.b3_student_date_ok(date);
drop function if exists public.b3_chile_today();

commit;
