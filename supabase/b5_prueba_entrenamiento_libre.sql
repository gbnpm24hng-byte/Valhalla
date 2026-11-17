-- =====================================================================
-- VALHALLA · Fase B5 · Prueba del Entrenamiento libre (cuentas FALSAS)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de b5_entrenamiento_libre.sql.
--
-- Crea usuarios y datos falsos (correos @example.invalid), se hace pasar por
-- ellos, intenta lo permitido y lo prohibido y al final DESHACE TODO: no queda
-- ningún usuario, programa ni serie de prueba. Se puede ejecutar las veces que quieras.
--
-- Resultado esperado: 24 filas, todas con resultado = PASA y fallas_totales = 0.
--
-- Participantes falsos:
--   coach A    -> entrenador
--   alumno 1   -> 'b5-cliente-uno', puede anotar, programa activo CON galería (data.library)
--                 y un programa viejo inactivo con galería
--   alumno 2   -> 'b5-cliente-dos', NO puede anotar, programa con galería
--   alumno 3   -> 'b5-cliente-tres', puede anotar, programa SIN galería (publicado antes de B5)
-- =====================================================================

do $$
declare
  v_coach_a uuid := gen_random_uuid();
  v_s1 uuid := gen_random_uuid();
  v_s2 uuid := gen_random_uuid();
  v_s3 uuid := gen_random_uuid();
  v_today date;
  v_case jsonb;
  v_user uuid;
  v_cnt bigint;
  v_txt text;
  v_out jsonb := '[]'::jsonb;
  v_lib constant text := '[{"id":"gal-sentadilla","name":"Sentadilla falsa","muscle":"quadriceps","image":"sentadilla.webp"},{"id":"gal-remo","name":"Remo falso","muscle":"lats"}]';
  v_cases jsonb;
begin
  begin
    -- -----------------------------------------------------------------
    -- Preparación (como administrador del SQL Editor)
    -- -----------------------------------------------------------------
    v_today := public.b3_chile_today();

    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', v_coach_a, 'authenticated', 'authenticated', 'b5-coach-a@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_s1, 'authenticated', 'authenticated', 'b5-alumno-1@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_s2, 'authenticated', 'authenticated', 'b5-alumno-2@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_s3, 'authenticated', 'authenticated', 'b5-alumno-3@example.invalid', '{}', '{}', now(), now());
    update public.profiles set role = 'coach' where id = v_coach_a;

    insert into public.client_links (auth_user_id, owner_id, client_id, can_self_log, active) values
      (v_s1, v_coach_a, 'b5-cliente-uno', true, true),
      (v_s2, v_coach_a, 'b5-cliente-dos', false, true),
      (v_s3, v_coach_a, 'b5-cliente-tres', true, true);

    insert into public.student_programs (owner_id, client_id, assignment_id, title, data, active) values
      (v_coach_a, 'b5-cliente-uno', 'b5-asig-1', 'Programa falso con galería',
       ('{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":3,"approximations":[]}]}],"library":' || v_lib || '}')::jsonb, true),
      (v_coach_a, 'b5-cliente-uno', 'b5-asig-vieja', 'Programa falso viejo',
       ('{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":3}]}],"library":' || v_lib || '}')::jsonb, false),
      (v_coach_a, 'b5-cliente-dos', 'b5-asig-2', 'Programa falso 2',
       ('{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":3}]}],"library":' || v_lib || '}')::jsonb, true),
      (v_coach_a, 'b5-cliente-tres', 'b5-asig-3', 'Programa falso sin galería',
       '{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":3}]}]}'::jsonb, true);

    -- -----------------------------------------------------------------
    -- 1 a 18. Crear series como alumno (insert)
    --   u: 1/2/3 = alumno; c: cliente; a: asignación; d: días atrás; t: tipo; s: número
    -- -----------------------------------------------------------------
    v_cases := jsonb_build_array(
      jsonb_build_object('n', 1, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 1, 'ok', true, 'p', 'Serie libre de un ejercicio de la galería'),
      jsonb_build_object('n', 2, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 10, 'ok', true, 'p', 'Serie libre número 10 (máximo)'),
      jsonb_build_object('n', 3, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 11, 'ok', false, 'p', 'Serie libre número 11 (pasa el máximo)'),
      jsonb_build_object('n', 4, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-no-existe', 't', 'S', 's', 1, 'ok', false, 'p', 'Serie libre de un ejercicio que no está en la galería'),
      jsonb_build_object('n', 5, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'ej-1', 't', 'S', 's', 1, 'ok', false, 'p', 'Día libre con un ejercicio del programa que no está en la galería'),
      jsonb_build_object('n', 6, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-remo', 't', 'A', 's', 1, 'ok', false, 'p', 'Aproximación (A) en el día libre'),
      jsonb_build_object('n', 7, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 3, 'day', 'libre', 'ex', 'gal-remo', 't', 'S', 's', 1, 'ok', true, 'p', 'Serie libre de hace 3 días (límite de fecha)'),
      jsonb_build_object('n', 8, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 4, 'day', 'libre', 'ex', 'gal-remo', 't', 'S', 's', 2, 'ok', false, 'p', 'Serie libre de hace 4 días (regla de fecha igual)'),
      jsonb_build_object('n', 9, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', -1, 'day', 'libre', 'ex', 'gal-remo', 't', 'S', 's', 3, 'ok', false, 'p', 'Serie libre de mañana'),
      jsonb_build_object('n', 10, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'dia-1', 'ex', 'gal-sentadilla', 't', 'S', 's', 1, 'ok', false, 'p', 'Ejercicio de la galería en un día del programa'),
      jsonb_build_object('n', 11, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'dia-1', 'ex', 'ej-1', 't', 'S', 's', 1, 'ok', true, 'p', 'Serie del programa (igual que antes)'),
      jsonb_build_object('n', 12, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'dia-1', 'ex', 'ej-1', 't', 'S', 's', 4, 'ok', false, 'p', 'Serie del programa que pasa sus series (igual que antes)'),
      jsonb_build_object('n', 13, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-vieja', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 1, 'ok', false, 'p', 'Serie libre en un programa inactivo'),
      jsonb_build_object('n', 14, 'u', 1, 'c', 'b5-cliente-dos', 'a', 'b5-asig-2', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 1, 'ok', false, 'p', 'Alumno 1 anota libre a nombre de otro alumno'),
      jsonb_build_object('n', 15, 'u', 2, 'c', 'b5-cliente-dos', 'a', 'b5-asig-2', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 1, 'ok', false, 'p', 'Alumno sin "Puede anotar" (can_self_log = false)'),
      jsonb_build_object('n', 16, 'u', 3, 'c', 'b5-cliente-tres', 'a', 'b5-asig-3', 'd', 0, 'day', 'libre', 'ex', 'gal-sentadilla', 't', 'S', 's', 1, 'ok', false, 'p', 'Programa publicado sin galería (data.library)'),
      jsonb_build_object('n', 17, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-remo', 't', 'S', 's', 4, 'ok', false, 'notes', 'nota', 'p', 'Serie libre con nota (sin notas, igual que antes)'),
      jsonb_build_object('n', 18, 'u', 1, 'c', 'b5-cliente-uno', 'a', 'b5-asig-1', 'd', 0, 'day', 'libre', 'ex', 'gal-remo', 't', 'S', 's', 5, 'ok', false, 'validated', true, 'p', 'Serie libre marcada como validada por el coach')
    );

    for v_case in select value from jsonb_array_elements(v_cases) loop
      v_user := case (v_case ->> 'u')::int when 1 then v_s1 when 2 then v_s2 else v_s3 end;
      perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_user::text, true);
      execute 'set local role authenticated';
      begin
        execute 'insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps, rir, notes, coach_validated)
                 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 40, 10, 2, $10, $11)'
          using v_coach_a, v_case ->> 'c', v_user, v_case ->> 'a', v_today - (v_case ->> 'd')::int,
                v_case ->> 'day', v_case ->> 'ex', v_case ->> 't', (v_case ->> 's')::int,
                v_case ->> 'notes', coalesce((v_case ->> 'validated')::boolean, false);
        v_txt := 'permitido';
      exception
        when insufficient_privilege then v_txt := 'bloqueado';
        when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
      end;
      execute 'reset role';
      v_out := v_out || jsonb_build_object('n', (v_case ->> 'n')::int, 'quien', 'alumno ' || (v_case ->> 'u'), 'prueba', v_case ->> 'p',
        'esperado', case when (v_case ->> 'ok')::boolean then 'permitido' else 'bloqueado' end, 'obtenido', v_txt,
        'resultado', case when v_txt = case when (v_case ->> 'ok')::boolean then 'permitido' else 'bloqueado' end then 'PASA' else 'FALLA' end);
    end loop;

    -- -----------------------------------------------------------------
    -- ALUMNO 1: modificar
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_s1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_s1::text, true);
    execute 'set local role authenticated';

    -- 19. Corregir el peso de su serie libre de hoy
    begin
      update public.student_sets set weight = 42.5
       where client_id = 'b5-cliente-uno' and day_id = 'libre' and exercise_id = 'gal-sentadilla' and set_number = 1 and session_date = v_today;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 19, 'quien', 'alumno 1', 'prueba', 'Corregir el peso de su serie libre de hoy', 'esperado', '1 filas modificadas', 'obtenido', v_txt,
      'resultado', case when v_txt = '1 filas modificadas' then 'PASA' else 'FALLA' end);

    -- 20. Mover la serie libre a un día del programa (candado)
    begin
      update public.student_sets set day_id = 'dia-1', exercise_id = 'ej-1'
       where client_id = 'b5-cliente-uno' and day_id = 'libre' and exercise_id = 'gal-sentadilla' and set_number = 1 and session_date = v_today;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 20, 'quien', 'alumno 1', 'prueba', 'Mover su serie libre a un día del programa (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt,
      'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 21. Borrar su serie libre (el alumno nunca borra)
    begin
      delete from public.student_sets where client_id = 'b5-cliente-uno' and day_id = 'libre';
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas borradas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 21, 'quien', 'alumno 1', 'prueba', 'Borrar sus series libres (no puede)', 'esperado', '0 filas borradas o bloqueado', 'obtenido', v_txt,
      'resultado', case when v_txt in ('0 filas borradas', 'bloqueado') then 'PASA' else 'FALLA' end);

    execute 'reset role';

    -- -----------------------------------------------------------------
    -- COACH A: ve las series libres
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_a::text, true);
    execute 'set local role authenticated';

    -- 22. El coach lee las series libres de su alumno
    select count(*) into v_cnt from public.student_sets where client_id = 'b5-cliente-uno' and day_id = 'libre';
    v_out := v_out || jsonb_build_object('n', 22, 'quien', 'coach A', 'prueba', 'Lee las series libres del alumno 1 (1, 10 y la de hace 3 días)', 'esperado', '3', 'obtenido', v_cnt::text,
      'resultado', case when v_cnt = 3 then 'PASA' else 'FALLA' end);

    execute 'reset role';

    -- -----------------------------------------------------------------
    -- Funciones: anon no puede usarlas; la de B3 sigue respondiendo igual
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    begin
      v_txt := public.b5_free_set_ok(v_coach_a, 'b5-cliente-uno', 'b5-asig-1', 'libre', 'gal-sentadilla', 'S', 1)::text;
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    execute 'reset role';
    v_out := v_out || jsonb_build_object('n', 23, 'quien', 'anon', 'prueba', 'Usar b5_free_set_ok sin sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt,
      'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 24. Como administrador: la función del programa sigue aceptando lo de siempre
    v_txt := public.b3_set_fits_program(v_coach_a, 'b5-cliente-tres', 'b5-asig-3', 'dia-1', 'ej-1', 'S', 3)::text
      || ',' || public.b3_set_fits_program(v_coach_a, 'b5-cliente-tres', 'b5-asig-3', 'libre', 'ej-1', 'S', 1)::text;
    v_out := v_out || jsonb_build_object('n', 24, 'quien', 'administrador', 'prueba', 'b3_set_fits_program: serie del programa sí, libre sin galería no', 'esperado', 'true,false', 'obtenido', v_txt,
      'resultado', case when v_txt = 'true,false' then 'PASA' else 'FALLA' end);

    -- Deshacer todo lo anterior (usuarios falsos, vínculos, programas, series).
    raise exception using errcode = 'B5RBK', message = 'b5_deshacer';
  exception
    when sqlstate 'B5RBK' then
      null;
    when others then
      v_out := v_out || jsonb_build_object('n', 0, 'quien', 'sistema', 'prueba', 'ERROR durante la prueba (todo se deshizo)', 'esperado', 'sin errores', 'obtenido', sqlstate || ': ' || sqlerrm, 'resultado', 'FALLA');
  end;

  perform set_config('valhalla.b5_resultados', v_out::text, false);
end;
$$;

select
  r.n,
  r.quien,
  r.prueba,
  r.esperado,
  r.obtenido,
  r.resultado,
  count(*) filter (where r.resultado = 'FALLA') over () as fallas_totales
from jsonb_to_recordset(current_setting('valhalla.b5_resultados')::jsonb)
  as r(n int, quien text, prueba text, esperado text, obtenido text, resultado text)
order by r.n;
