-- =====================================================================
-- VALHALLA · Fases A0 y B3.1 · Prueba de seguridad (RLS) con cuentas FALSAS
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de a0_migracion_roles_sync.sql
-- y de b3_1_registro_alumno.sql.
--
-- Crea usuarios y datos falsos (correos @example.invalid), se hace pasar por
-- ellos, intenta lo prohibido y al final DESHACE TODO: no queda ningún usuario
-- ni fila de prueba en la base. Se puede ejecutar las veces que quieras.
--
-- Resultado esperado: 69 filas, todas con resultado = PASA y fallas_totales = 0.
-- (Las pruebas 37 a 40 se agregaron después de A0 y las 41 a 69 con B3.1; se
-- ejecutan en su sección pero aparecen en orden de número.)
-- Si se corre sin B3.1 (o después de b3_1_deshacer.sql), varias de 41 a 69 fallan:
-- es lo esperado, porque esas reglas no están.
--   * Pruebas "debe bloquearse": el alumno intenta algo prohibido; PASA si se bloquea.
--   * Pruebas "control": algo que SÍ debe funcionar; si falla, la prueba no sirve
--     (las políticas estarían cerrando de más o los datos de prueba están mal).
--
-- Participantes falsos:
--   coach A  -> entrenador dueño de los datos
--   coach B  -> otro entrenador (no debe ver nada de A)
--   alumno 1 -> vinculado a A, cliente 'a0-cliente-uno', puede registrar series
--   alumno 2 -> vinculado a A, cliente 'a0-cliente-dos', NO puede registrar series
--
-- Programa publicado falso del alumno 1 ('a0-asig-1', día 'dia-1'):
--   ej-1: 3 series y 1 aproximación · ej-2: 3 series, sin aproximaciones
--   ej-3: 2 series y 2 aproximaciones
-- y un programa anterior ('a0-asig-vieja') que ya no está publicado.
-- Las fechas usan el día de hoy en hora de Chile.
-- =====================================================================

do $$
declare
  v_coach_a uuid := gen_random_uuid();
  v_coach_b uuid := gen_random_uuid();
  v_s1 uuid := gen_random_uuid();
  v_s2 uuid := gen_random_uuid();
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_set_s2 uuid;
  v_set_by_coach uuid;
  v_set_validated uuid;
  v_set_own uuid;
  v_set_old uuid;
  v_set_edge uuid;
  v_set_old_prog uuid;
  v_set_removed uuid;
  v_set_no_rir uuid;
  v_expected bigint;
  v_cnt bigint;
  v_txt text;
  v_out jsonb := '[]'::jsonb;
begin
  begin
    -- -----------------------------------------------------------------
    -- Preparación (como administrador del SQL Editor)
    -- -----------------------------------------------------------------
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', v_coach_a, 'authenticated', 'authenticated', 'a0-coach-a@example.invalid', '{}', '{"full_name":"A0 Coach A"}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_coach_b, 'authenticated', 'authenticated', 'a0-coach-b@example.invalid', '{}', '{"full_name":"A0 Coach B"}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_s1, 'authenticated', 'authenticated', 'a0-alumno-1@example.invalid', '{}', '{"full_name":"A0 Alumno 1"}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_s2, 'authenticated', 'authenticated', 'a0-alumno-2@example.invalid', '{}', '{"full_name":"A0 Alumno 2"}', now(), now());

    -- Control: el trigger crea los perfiles como 'student'.
    select count(*) into v_cnt from public.profiles where id in (v_coach_a, v_coach_b, v_s1, v_s2) and role = 'student';
    v_out := v_out || jsonb_build_object('n', 1, 'quien', 'sistema', 'prueba', 'Cuenta nueva nace con rol student', 'esperado', '4 perfiles student', 'obtenido', v_cnt || ' perfiles student', 'resultado', case when v_cnt = 4 then 'PASA' else 'FALLA' end);

    update public.profiles set role = 'coach' where id in (v_coach_a, v_coach_b);

    insert into public.client_links (auth_user_id, owner_id, client_id, can_self_log, active) values
      (v_s1, v_coach_a, 'a0-cliente-uno', true, true),
      (v_s2, v_coach_a, 'a0-cliente-dos', false, true);

    insert into public.coach_state (owner_id, data, version) values
      (v_coach_a, '{"clients":[{"id":"a0-cliente-uno","full_name":"Falso"}]}', 1),
      (v_coach_b, '{"clients":[]}', 1);

    insert into public.student_programs (owner_id, client_id, assignment_id, title, data, active) values
      (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', 'Programa falso 1',
       '{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":3,"approximations":[{"label":"A1"}]},{"id":"ej-2","sets":3,"approximations":[]},{"id":"ej-3","sets":2,"approximations":[{"label":"A1"},{"label":"A2"}]}]}]}', true),
      (v_coach_a, 'a0-cliente-dos', 'a0-asig-2', 'Programa falso 2',
       '{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":5,"approximations":[]}]}]}', true),
      (v_coach_a, 'a0-cliente-uno', 'a0-asig-vieja', 'Programa anterior falso',
       '{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","sets":3,"approximations":[]}]}]}', false);

    insert into public.student_progress (owner_id, client_id, session_id, session_date, data) values
      (v_coach_a, 'a0-cliente-uno', 'a0-sesion-1', current_date, '{}'),
      (v_coach_a, 'a0-cliente-dos', 'a0-sesion-2', current_date, '{}');

    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'a0-cliente-dos', v_s2, 'a0-asig-2', v_hoy, 'dia-1', 'ej-1', 1, 40, 10)
    returning id into v_set_s2;

    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'a0-cliente-uno', v_coach_a, 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 1, 50, 8)
    returning id into v_set_by_coach;

    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps, coach_validated)
    values (v_coach_a, 'a0-cliente-uno', v_s1, 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 2, 50, 8, true)
    returning id into v_set_validated;

    -- Series del alumno 1 cargadas antes (para probar qué puede modificar después).
    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'a0-cliente-uno', v_s1, 'a0-asig-1', v_hoy - 5, 'dia-1', 'ej-2', 1, 40, 10)
    returning id into v_set_old;

    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'a0-cliente-uno', v_s1, 'a0-asig-1', v_hoy - 3, 'dia-1', 'ej-2', 1, 40, 10)
    returning id into v_set_edge;

    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'a0-cliente-uno', v_s1, 'a0-asig-vieja', v_hoy, 'dia-1', 'ej-1', 1, 40, 10)
    returning id into v_set_old_prog;

    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'a0-cliente-uno', v_s1, 'a0-asig-1', v_hoy, 'dia-1', 'ej-quitado', 1, 40, 10)
    returning id into v_set_removed;

    -- Una serie de otro entrenador (coach B) en un cliente suyo.
    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_b, 'b0-cliente', v_coach_b, 'b0-asig', v_hoy, 'dia-1', 'ej-1', 1, 70, 5);

    -- Tabla vieja clients (si existe): fila con auth_user_id del alumno 1,
    -- para comprobar que la antigua política de lectura ya no aplica.
    if to_regclass('public.clients') is not null then
      execute 'insert into public.clients (owner_id, auth_user_id, full_name) values ($1, $2, $3)'
        using v_coach_a, v_s1, 'A0 cliente falso';
    end if;

    -- -----------------------------------------------------------------
    -- Desde aquí: sesión como ALUMNO 1
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_s1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_s1::text, true);
    execute 'set local role authenticated';

    -- 2. Leer coach_state
    begin
      select count(*) into v_cnt from public.coach_state;
      v_txt := v_cnt || ' filas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 2, 'quien', 'alumno 1', 'prueba', 'Leer coach_state (debe bloquearse)', 'esperado', '0 filas o bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('0 filas', 'bloqueado') then 'PASA' else 'FALLA' end);

    -- 3. Leer clients (tabla vieja)
    if to_regclass('public.clients') is null then
      v_txt := 'la tabla no existe';
    else
      begin
        execute 'select count(*) from public.clients' into v_cnt;
        v_txt := v_cnt || ' filas';
      exception
        when insufficient_privilege then v_txt := 'bloqueado';
        when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
      end;
    end if;
    v_out := v_out || jsonb_build_object('n', 3, 'quien', 'alumno 1', 'prueba', 'Leer clients, incluso la fila con su propio auth_user_id (debe bloquearse)', 'esperado', '0 filas, bloqueado o no existe', 'obtenido', v_txt, 'resultado', case when v_txt in ('0 filas', 'bloqueado', 'la tabla no existe') then 'PASA' else 'FALLA' end);

    -- 4. Leer perfiles ajenos
    select count(*) into v_cnt from public.profiles where id <> v_s1;
    v_out := v_out || jsonb_build_object('n', 4, 'quien', 'alumno 1', 'prueba', 'Leer perfiles de otros (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 5. Leer vínculos ajenos
    select count(*) into v_cnt from public.client_links where auth_user_id <> v_s1;
    v_out := v_out || jsonb_build_object('n', 5, 'quien', 'alumno 1', 'prueba', 'Leer client_links de otros alumnos (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 6. Leer programas ajenos
    select count(*) into v_cnt from public.student_programs where client_id <> 'a0-cliente-uno';
    v_out := v_out || jsonb_build_object('n', 6, 'quien', 'alumno 1', 'prueba', 'Leer student_programs de otro alumno (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 7. Leer progreso ajeno
    select count(*) into v_cnt from public.student_progress where client_id <> 'a0-cliente-uno';
    v_out := v_out || jsonb_build_object('n', 7, 'quien', 'alumno 1', 'prueba', 'Leer student_progress de otro alumno (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 8. Leer series ajenas
    select count(*) into v_cnt from public.student_sets where client_id <> 'a0-cliente-uno';
    v_out := v_out || jsonb_build_object('n', 8, 'quien', 'alumno 1', 'prueba', 'Leer student_sets de otro alumno (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 9. Cambiar su propio rol
    begin
      update public.profiles set role = 'coach' where id = v_s1;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 9, 'quien', 'alumno 1', 'prueba', 'Cambiar su propio rol a coach (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 10. Crear un perfil coach
    begin
      insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'Intruso', 'coach');
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 10, 'quien', 'alumno 1', 'prueba', 'Insertar un perfil con rol coach (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 11. Confirmar que is_coach() le dice que no
    v_out := v_out || jsonb_build_object('n', 11, 'quien', 'alumno 1', 'prueba', 'is_coach() para un alumno', 'esperado', 'false', 'obtenido', public.is_coach()::text, 'resultado', case when public.is_coach() = false then 'PASA' else 'FALLA' end);

    -- 12. Escribir coach_state
    begin
      insert into public.coach_state (owner_id, data) values (v_s1, '{}');
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 12, 'quien', 'alumno 1', 'prueba', 'Crear su propio coach_state (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 13. Modificar su vínculo (cambiarse de cliente o darse permisos)
    begin
      update public.client_links set client_id = 'a0-cliente-dos', can_self_log = true where auth_user_id = v_s1;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 13, 'quien', 'alumno 1', 'prueba', 'Modificar su propio client_links (debe bloquearse)', 'esperado', '0 filas o bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 14. Registrar series a nombre de otro alumno
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-dos', 'a0-asig-2', v_hoy, 'dia-1', 'ej-1', 2, 999, 1);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 14, 'quien', 'alumno 1', 'prueba', 'Insertar serie en el cliente de otro alumno (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 15. Corregir series de otro alumno
    begin
      update public.student_sets set reps = 99 where id = v_set_s2;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 15, 'quien', 'alumno 1', 'prueba', 'Corregir serie de otro alumno (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 16. Marcar una serie propia como validada por el entrenador
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps, coach_validated)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 1, 60, 5, true);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 16, 'quien', 'alumno 1', 'prueba', 'Insertar serie ya "validada por coach" (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 17. Modificar una serie ya validada por el entrenador
    begin
      update public.student_sets set reps = 20, coach_validated = false where id = v_set_validated;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 17, 'quien', 'alumno 1', 'prueba', 'Modificar su serie ya validada (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 18. Modificar una serie que cargó el entrenador
    begin
      update public.student_sets set reps = 20 where id = v_set_by_coach;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 18, 'quien', 'alumno 1', 'prueba', 'Modificar serie cargada por el entrenador (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 19. Registrar series en un programa que no le publicaron
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-inexistente', v_hoy, 'dia-1', 'ej-1', 1, 50, 8);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 19, 'quien', 'alumno 1', 'prueba', 'Insertar serie en programa no publicado (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 20. Vaciar la tabla de series (TRUNCATE ignora RLS, por eso se quitó el permiso)
    begin
      execute 'truncate public.student_sets';
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 20, 'quien', 'alumno 1', 'prueba', 'TRUNCATE student_sets (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 21. Control: my_client_id()
    v_txt := coalesce(public.my_client_id(), '(nulo)');
    v_out := v_out || jsonb_build_object('n', 21, 'quien', 'alumno 1', 'prueba', 'Control: my_client_id() devuelve su cliente', 'esperado', 'a0-cliente-uno', 'obtenido', v_txt, 'resultado', case when v_txt = 'a0-cliente-uno' then 'PASA' else 'FALLA' end);

    -- 22. Control: ve su programa y su progreso
    select (select count(*) from public.student_programs) + (select count(*) from public.student_progress) into v_cnt;
    v_out := v_out || jsonb_build_object('n', 22, 'quien', 'alumno 1', 'prueba', 'Control: lee su programa y su progreso', 'esperado', '2 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 2 then 'PASA' else 'FALLA' end);

    -- 23. Control: registra su propia serie
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps, rir)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 3, 52.5, 8, 2)
      returning id into v_set_own;
      v_txt := 'permitido';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 23, 'quien', 'alumno 1', 'prueba', 'Control: registra su propia serie', 'esperado', 'permitido', 'obtenido', v_txt, 'resultado', case when v_txt = 'permitido' then 'PASA' else 'FALLA' end);

    -- 24. Control: corrige su propia serie
    begin
      update public.student_sets set reps = 9 where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 24, 'quien', 'alumno 1', 'prueba', 'Control: corrige su propia serie', 'esperado', '1 filas modificadas', 'obtenido', v_txt, 'resultado', case when v_txt = '1 filas modificadas' then 'PASA' else 'FALLA' end);

    -- 37. Control: aproximación A1 y serie efectiva S1 del mismo ejercicio conviven
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values
        (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-3', 'A', 1, 20, 10),
        (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-3', 'S', 1, 60, 6);
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas insertadas';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 37, 'quien', 'alumno 1', 'prueba', 'Control: registra A1 y S1 del mismo ejercicio', 'esperado', '2 filas insertadas', 'obtenido', v_txt, 'resultado', case when v_txt = '2 filas insertadas' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- B3.1: lo que el alumno 1 (con permiso) puede y no puede registrar
    -- -----------------------------------------------------------------

    -- 41. Ejercicio que no está en su programa
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-99', 1, 50, 8);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 41, 'quien', 'alumno 1', 'prueba', 'B3: registrar en un ejercicio que no está en su programa (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 42. Día que no existe en su programa
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-9', 'ej-1', 3, 50, 8);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 42, 'quien', 'alumno 1', 'prueba', 'B3: registrar en un día que no está en su programa (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 43. Serie efectiva más allá de las de la rutina (ej-1 tiene 3)
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 4, 50, 8);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 43, 'quien', 'alumno 1', 'prueba', 'B3: registrar la serie 4 cuando la rutina tiene 3 (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 44. Aproximación más allá de las de la rutina (ej-1 tiene 1)
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 'A', 2, 30, 8);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 44, 'quien', 'alumno 1', 'prueba', 'B3: registrar la aproximación 2 cuando la rutina tiene 1 (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 45. Aproximación en un ejercicio que no tiene aproximaciones (ej-2)
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 'A', 1, 30, 8);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 45, 'quien', 'alumno 1', 'prueba', 'B3: registrar aproximación en un ejercicio sin aproximaciones (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 46. Control: la aproximación que sí tiene la rutina
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 'A', 1, 30, 8);
      v_txt := 'permitido';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 46, 'quien', 'alumno 1', 'prueba', 'B3 control: registra la aproximación que tiene la rutina', 'esperado', 'permitido', 'obtenido', v_txt, 'resultado', case when v_txt = 'permitido' then 'PASA' else 'FALLA' end);

    -- 47. Serie con nota
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps, notes)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 2, 40, 10, 'nota del alumno');
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 47, 'quien', 'alumno 1', 'prueba', 'B3: registrar una serie con nota (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 48. Fecha de mañana
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy + 1, 'dia-1', 'ej-2', 2, 40, 10);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 48, 'quien', 'alumno 1', 'prueba', 'B3: registrar con fecha de mañana (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 49. Fecha de hace 4 días
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy - 4, 'dia-1', 'ej-2', 2, 40, 10);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 49, 'quien', 'alumno 1', 'prueba', 'B3: registrar con fecha de hace 4 días (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 50. Control: fecha de hace 3 días
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy - 3, 'dia-1', 'ej-2', 2, 40, 10);
      v_txt := 'permitido';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 50, 'quien', 'alumno 1', 'prueba', 'B3 control: registra con fecha de hace 3 días', 'esperado', 'permitido', 'obtenido', v_txt, 'resultado', case when v_txt = 'permitido' then 'PASA' else 'FALLA' end);

    -- 51. Control: serie sin RIR (la base no lo exige; lo exigirá la app)
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 2, 40, 10)
      returning id into v_set_no_rir;
      v_txt := 'permitido';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 51, 'quien', 'alumno 1', 'prueba', 'B3 control: registra una serie sin RIR', 'esperado', 'permitido', 'obtenido', v_txt, 'resultado', case when v_txt = 'permitido' then 'PASA' else 'FALLA' end);

    -- 52. Programa que ya no es el publicado
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-vieja', v_hoy, 'dia-1', 'ej-1', 2, 40, 10);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 52, 'quien', 'alumno 1', 'prueba', 'B3: registrar en un programa que ya no está publicado (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 53. A nombre de otra cuenta, en su propio cliente
    begin
      insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', v_s2, 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 3, 40, 10);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 53, 'quien', 'alumno 1', 'prueba', 'B3: registrar a nombre de otra cuenta (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 54. Serie de tipo "T" (nunca va a student_sets)
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 'T', 1, 40, 3);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when check_violation then v_txt := 'rechazado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 54, 'quien', 'alumno 1', 'prueba', 'B3: registrar una serie tipo T (debe bloquearse)', 'esperado', 'bloqueado o rechazado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', 'rechazado') then 'PASA' else 'FALLA' end);

    -- 55. Modificar su serie de hace 5 días
    begin
      update public.student_sets set reps = 12 where id = v_set_old;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 55, 'quien', 'alumno 1', 'prueba', 'B3: modificar su serie de hace 5 días (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 56. Control: modificar su serie de hace 3 días
    begin
      update public.student_sets set reps = 12, rir = 1 where id = v_set_edge;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 56, 'quien', 'alumno 1', 'prueba', 'B3 control: modifica su serie de hace 3 días', 'esperado', '1 filas modificadas', 'obtenido', v_txt, 'resultado', case when v_txt = '1 filas modificadas' then 'PASA' else 'FALLA' end);

    -- 57. Modificar su serie de un programa que ya no está publicado
    begin
      update public.student_sets set reps = 12 where id = v_set_old_prog;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 57, 'quien', 'alumno 1', 'prueba', 'B3: modificar su serie de un programa ya no publicado (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 58. Modificar su serie de un ejercicio que ya no está en el programa
    begin
      update public.student_sets set reps = 12 where id = v_set_removed;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 58, 'quien', 'alumno 1', 'prueba', 'B3: modificar su serie de un ejercicio quitado del programa (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 59. Mover su serie a otro ejercicio (aunque el destino sea válido)
    begin
      update public.student_sets set exercise_id = 'ej-2' where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 59, 'quien', 'alumno 1', 'prueba', 'B3: mover su serie a otro ejercicio (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 60. Agregarle una nota a su serie
    begin
      update public.student_sets set notes = 'nota del alumno' where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 60, 'quien', 'alumno 1', 'prueba', 'B3: agregarle una nota a su serie (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 61. Cambiar la fecha de su serie a mañana
    begin
      update public.student_sets set session_date = v_hoy + 1 where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 61, 'quien', 'alumno 1', 'prueba', 'B3: cambiar la fecha de su serie (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 62. Pasarle su serie a otra cuenta
    begin
      update public.student_sets set auth_user_id = v_s2 where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 62, 'quien', 'alumno 1', 'prueba', 'B3: pasar su serie a otra cuenta (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- 63. Leer series de otro entrenador
    select count(*) into v_cnt from public.student_sets where owner_id = v_coach_b;
    v_out := v_out || jsonb_build_object('n', 63, 'quien', 'alumno 1', 'prueba', 'B3: leer series de otro entrenador (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 64. "Insertar o actualizar" sobre la serie que escribió el entrenador (gana el entrenador)
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-1', 'S', 1, 99, 1)
      on conflict (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number)
      do update set weight = excluded.weight, reps = excluded.reps;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 64, 'quien', 'alumno 1', 'prueba', 'B3: sobrescribir la serie del entrenador con insertar o actualizar (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas') then 'PASA' else 'FALLA' end);

    -- 25. Borrar su propia serie (solo el entrenador borra)
    begin
      delete from public.student_sets where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas borradas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 25, 'quien', 'alumno 1', 'prueba', 'Borrar su propia serie (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas borradas') then 'PASA' else 'FALLA' end);

    -- B3: el entrenador le quita el permiso (como administrador) y el alumno 1 lo intenta de nuevo.
    execute 'reset role';
    update public.client_links set can_self_log = false where auth_user_id = v_s1;
    execute 'set local role authenticated';

    -- 65. Registrar sin permiso
    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-1', v_hoy, 'dia-1', 'ej-2', 3, 40, 10);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 65, 'quien', 'alumno 1', 'prueba', 'B3: registrar después de quitarle can_self_log (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 66. Corregir su serie sin permiso
    begin
      update public.student_sets set reps = 7 where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 66, 'quien', 'alumno 1', 'prueba', 'B3: corregir su serie después de quitarle can_self_log (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    execute 'reset role';
    update public.client_links set can_self_log = true where auth_user_id = v_s1;
    execute 'set local role authenticated';

    -- -----------------------------------------------------------------
    -- ALUMNO 2 (sin permiso para registrar series)
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_s2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_s2::text, true);

    begin
      insert into public.student_sets (owner_id, client_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-dos', 'a0-asig-2', v_hoy, 'dia-1', 'ej-1', 5, 40, 10);
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 26, 'quien', 'alumno 2', 'prueba', 'Registrar serie sin can_self_log (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- COACH B (otro entrenador)
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_b, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_b::text, true);

    select (select count(*) from public.coach_state where owner_id = v_coach_a)
         + (select count(*) from public.student_sets where owner_id = v_coach_a)
         + (select count(*) from public.client_links) into v_cnt;
    v_out := v_out || jsonb_build_object('n', 27, 'quien', 'coach B', 'prueba', 'Leer datos del coach A (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- COACH A (dueño)
    -- -----------------------------------------------------------------
    -- Cuántas series del coach A hay de verdad (contadas como administrador).
    execute 'reset role';
    select count(*) into v_expected from public.student_sets where owner_id = v_coach_a;
    execute 'set local role authenticated';

    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_a::text, true);

    select (select count(*) from public.coach_state)
         + (select count(*) from public.client_links)
         + (select count(*) from public.student_sets) into v_cnt;
    -- 1 coach_state + 2 vínculos + todas sus series (y ninguna del coach B)
    v_out := v_out || jsonb_build_object('n', 28, 'quien', 'coach A', 'prueba', 'Control: el entrenador ve todo lo suyo (y nada del coach B)', 'esperado', (3 + v_expected) || ' filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 3 + v_expected then 'PASA' else 'FALLA' end);

    begin
      update public.coach_state set data = '{"clients":[]}', version = 2 where owner_id = v_coach_a and version = 1;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 29, 'quien', 'coach A', 'prueba', 'Control: guarda coach_state subiendo versión 1 -> 2', 'esperado', '1 filas modificadas', 'obtenido', v_txt, 'resultado', case when v_txt = '1 filas modificadas' then 'PASA' else 'FALLA' end);

    begin
      update public.coach_state set data = '{"clients":[]}', version = 2 where owner_id = v_coach_a;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when raise_exception then v_txt := case when sqlerrm like 'VERSION_CONFLICT%' then 'conflicto detectado' else 'error ' || sqlerrm end;
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 30, 'quien', 'coach A', 'prueba', 'Guardar con versión vieja (otro dispositivo) debe dar conflicto', 'esperado', 'conflicto detectado', 'obtenido', v_txt, 'resultado', case when v_txt = 'conflicto detectado' then 'PASA' else 'FALLA' end);

    begin
      update public.coach_state set data = '{"movements":[]}', version = 3 where owner_id = v_coach_a;
      v_txt := 'permitido';
    exception
      when check_violation then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 31, 'quien', 'coach A', 'prueba', 'Subir finanzas dentro de coach_state (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    begin
      delete from public.student_sets where id = v_set_own;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas borradas';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 32, 'quien', 'coach A', 'prueba', 'Control: el entrenador borra una serie', 'esperado', '1 filas borradas', 'obtenido', v_txt, 'resultado', case when v_txt = '1 filas borradas' then 'PASA' else 'FALLA' end);

    -- 38. Tipo de serie inválido (lo hace el coach, que pasa RLS, para probar la restricción misma)
    begin
      insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps)
      values (v_coach_a, 'a0-cliente-uno', v_coach_a, 'a0-asig-1', v_hoy, 'dia-1', 'ej-4', 'X', 1, 50, 8);
      v_txt := 'permitido';
    exception
      when check_violation then v_txt := 'rechazado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 38, 'quien', 'coach A', 'prueba', 'Insertar serie con set_type ''X'' (debe rechazarse)', 'esperado', 'rechazado', 'obtenido', v_txt, 'resultado', case when v_txt = 'rechazado' then 'PASA' else 'FALLA' end);

    -- 39. Publicar un programa con datos de pago escondidos en un nivel profundo
    begin
      insert into public.student_programs (owner_id, client_id, assignment_id, title, data)
      values (v_coach_a, 'a0-cliente-uno', 'a0-asig-pago', 'Programa con fuga',
              '{"days":[{"id":"dia-1","exercises":[{"id":"ej-1","client":{"monthly_value":45000}}]}]}');
      v_txt := 'permitido';
    exception
      when check_violation then v_txt := 'rechazado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 39, 'quien', 'coach A', 'prueba', 'Publicar programa con monthly_value anidado (debe rechazarse)', 'esperado', 'rechazado', 'obtenido', v_txt, 'resultado', case when v_txt = 'rechazado' then 'PASA' else 'FALLA' end);

    -- 40. Publicar progreso con payment_status anidado
    begin
      insert into public.student_progress (owner_id, client_id, session_id, session_date, data)
      values (v_coach_a, 'a0-cliente-uno', 'a0-sesion-pago', current_date,
              '{"exercises":[{"sets":[{"reps":8}],"meta":{"payment_status":"overdue"}}]}');
      v_txt := 'permitido';
    exception
      when check_violation then v_txt := 'rechazado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 40, 'quien', 'coach A', 'prueba', 'Publicar progreso con payment_status anidado (debe rechazarse)', 'esperado', 'rechazado', 'obtenido', v_txt, 'resultado', case when v_txt = 'rechazado' then 'PASA' else 'FALLA' end);

    -- 67. Control: el entrenador corrige una serie del alumno (queda a su nombre y validada)
    begin
      update public.student_sets set weight = 45, reps = 9, auth_user_id = v_coach_a, coach_validated = true where id = v_set_no_rir;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 67, 'quien', 'coach A', 'prueba', 'B3 control: el entrenador corrige una serie del alumno', 'esperado', '1 filas modificadas', 'obtenido', v_txt, 'resultado', case when v_txt = '1 filas modificadas' then 'PASA' else 'FALLA' end);

    -- 68. Control: las reglas del alumno no limitan al entrenador (nota y fecha antigua)
    begin
      insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps, notes)
      values (v_coach_a, 'a0-cliente-uno', v_coach_a, 'a0-asig-1', v_hoy - 10, 'dia-1', 'ej-2', 1, 40, 10, 'nota del entrenador');
      v_txt := 'permitido';
    exception
      when others then v_txt := 'error ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 68, 'quien', 'coach A', 'prueba', 'B3 control: el entrenador registra con nota y fecha de hace 10 días', 'esperado', 'permitido', 'obtenido', v_txt, 'resultado', case when v_txt = 'permitido' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- ALUMNO 1 otra vez: la serie que corrigió el entrenador ya no es suya
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_s1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_s1::text, true);

    -- 69. Modificar la serie que corrigió el entrenador (gana el entrenador)
    begin
      update public.student_sets set weight = 60 where id = v_set_no_rir;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 69, 'quien', 'alumno 1', 'prueba', 'B3: modificar la serie que corrigió el entrenador (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- SIN SESIÓN (anon)
    -- -----------------------------------------------------------------
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';

    begin
      select (select count(*) from public.coach_state) + (select count(*) from public.student_sets) into v_cnt;
      v_txt := v_cnt || ' filas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 33, 'quien', 'anon', 'prueba', 'Leer sin iniciar sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas') then 'PASA' else 'FALLA' end);

    execute 'reset role';

    -- -----------------------------------------------------------------
    -- Revisión de estructura (como administrador)
    -- -----------------------------------------------------------------
    select count(*) into v_cnt
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'coach_state', 'client_links', 'student_programs', 'student_progress', 'student_sets')
      and c.relrowsecurity;
    v_out := v_out || jsonb_build_object('n', 34, 'quien', 'sistema', 'prueba', 'RLS activado en las 6 tablas', 'esperado', '6', 'obtenido', v_cnt::text, 'resultado', case when v_cnt = 6 then 'PASA' else 'FALLA' end);

    select count(distinct tablename) into v_cnt
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'coach_state', 'client_links', 'student_programs', 'student_progress', 'student_sets');
    v_out := v_out || jsonb_build_object('n', 35, 'quien', 'sistema', 'prueba', 'Las 6 tablas tienen políticas explícitas', 'esperado', '6', 'obtenido', v_cnt::text, 'resultado', case when v_cnt = 6 then 'PASA' else 'FALLA' end);

    select count(*) into v_cnt
    from public.profiles
    where role not in ('coach', 'student')
      and id not in (v_coach_a, v_coach_b, v_s1, v_s2);
    v_out := v_out || jsonb_build_object('n', 36, 'quien', 'sistema', 'prueba', 'Perfiles reales con roles viejos (admin, client, ...)', 'esperado', '0', 'obtenido', v_cnt::text, 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- Deshacer todo lo anterior (usuarios falsos, filas, cambios de rol).
    raise exception using errcode = 'A0RBK', message = 'a0_deshacer';
  exception
    when sqlstate 'A0RBK' then
      null;
    when others then
      v_out := v_out || jsonb_build_object('n', 0, 'quien', 'sistema', 'prueba', 'ERROR durante la prueba (todo se deshizo)', 'esperado', 'sin errores', 'obtenido', sqlstate || ': ' || sqlerrm, 'resultado', 'FALLA');
  end;

  perform set_config('valhalla.a0_resultados', v_out::text, false);
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
from jsonb_to_recordset(current_setting('valhalla.a0_resultados')::jsonb)
  as r(n int, quien text, prueba text, esperado text, obtenido text, resultado text)
order by r.n;
