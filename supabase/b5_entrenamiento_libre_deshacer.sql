-- =====================================================================
-- VALHALLA · Deshacer la fase B5 (Entrenamiento libre)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase solo si hay que volver atrás después de
-- b5_entrenamiento_libre.sql. Se puede ejecutar varias veces.
--
-- Qué hace:
--   * Deja b3_set_fits_program exactamente como en b3_1_registro_alumno.sql.
--   * Quita la función b5_free_set_ok.
--
-- Qué NO hace:
--   * No borra filas: las series libres ya registradas (day_id = 'libre') se
--     conservan y el entrenador las sigue viendo; el alumno ya no puede crear ni
--     modificar series libres.
--   * No cambia políticas, el candado, la regla de fecha ni can_self_log.
-- =====================================================================

begin;

-- Copia de b3_1_registro_alumno.sql (sección 1).
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

revoke all on function public.b3_set_fits_program(uuid, text, text, text, text, text, integer) from public, anon;
grant execute on function public.b3_set_fits_program(uuid, text, text, text, text, text, integer) to authenticated;

-- Ya no la usa nadie.
drop function if exists public.b5_free_set_ok(uuid, text, text, text, text, text, integer);

commit;
