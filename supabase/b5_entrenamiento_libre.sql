-- =====================================================================
-- VALHALLA · Fase B5 · Entrenamiento libre del alumno
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de b3_1_registro_alumno.sql.
-- Se puede ejecutar varias veces. Para volver atrás: b5_entrenamiento_libre_deshacer.sql.
-- Prueba (datos falsos, todo se deshace): b5_prueba_entrenamiento_libre.sql.
--
-- Qué hace:
--   * Agrega la función b5_free_set_ok: una serie del "Entrenamiento libre" cabe si
--       - day_id = 'libre',
--       - el exercise_id está en data.library del programa publicado y activo
--         (la galería que publica la app: id, nombre, músculo principal, imagen),
--       - es una serie efectiva (S) con número entre 1 y 10.
--   * b3_set_fits_program acepta además esas series (lo de antes sigue igual).
--
-- Qué NO cambia:
--   * Las políticas de student_sets (siguen llamando a b3_set_fits_program).
--   * La regla de fecha (hoy y hasta 3 días atrás, hora de Chile), el candado para
--     mover series (trg_student_sets_lock_keys) ni can_self_log.
--   * No crea ni borra tablas, filas ni columnas. No toca coach_state.
--   * Mientras un programa publicado no traiga data.library, nada cambia para ese alumno.
-- =====================================================================

begin;

-- ¿La serie es de un Entrenamiento libre permitido?
-- Lee student_programs sin pasar por RLS (como b3_set_fits_program).
create or replace function public.b5_free_set_ok(
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
  select p_day_id = 'libre'
     and p_set_type = 'S'
     and p_set_number between 1 and 10
     and exists (
       select 1
       from public.student_programs sp
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(sp.data -> 'library') = 'array' then sp.data -> 'library' else '[]'::jsonb end
       ) as l(item)
       where sp.owner_id = p_owner_id
         and sp.client_id = p_client_id
         and sp.assignment_id = p_assignment_id
         and sp.active
         and coalesce(l.item ->> 'id', '') <> ''
         and l.item ->> 'id' = p_exercise_id
     );
$$;

-- Igual que en b3_1_registro_alumno.sql, más "or b5_free_set_ok(...)" al final.
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
  )
  or public.b5_free_set_ok(p_owner_id, p_client_id, p_assignment_id, p_day_id, p_exercise_id, p_set_type, p_set_number);
$$;

revoke all on function public.b5_free_set_ok(uuid, text, text, text, text, text, integer) from public, anon;
revoke all on function public.b3_set_fits_program(uuid, text, text, text, text, text, integer) from public, anon;
grant execute on function public.b5_free_set_ok(uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.b3_set_fits_program(uuid, text, text, text, text, text, integer) to authenticated;

commit;
