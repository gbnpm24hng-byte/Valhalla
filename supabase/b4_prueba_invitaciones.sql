-- =====================================================================
-- VALHALLA · Fase B4 · Prueba de permisos de las invitaciones (cuentas FALSAS)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de b4_invitaciones.sql.
--
-- Crea usuarios y datos falsos (correos @example.invalid), se hace pasar por
-- ellos, intenta lo prohibido y al final DESHACE TODO: no queda ningún usuario,
-- invitación ni vínculo de prueba. Se puede ejecutar las veces que quieras.
--
-- Resultado esperado: 36 filas, todas con resultado = PASA y fallas_totales = 0.
--
-- Participantes falsos:
--   coach A   -> entrenador que invita
--   coach B   -> otro entrenador (no debe ver ni anular nada de A)
--   alumno V  -> ya vinculado a A como 'b4-cliente-viejo'
--   nuevo 1   -> cuenta nueva que canjea la invitación de 'b4-cliente-nuevo'
--   nuevo 2   -> cuenta nueva que llega tarde con el mismo código y luego reemplaza al 1
--   nuevo 3   -> cuenta nueva que prueba códigos al azar (límite de intentos)
-- =====================================================================

do $$
declare
  v_coach_a uuid := gen_random_uuid();
  v_coach_b uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
  v_old_b uuid := gen_random_uuid();
  v_n1 uuid := gen_random_uuid();
  v_n2 uuid := gen_random_uuid();
  v_n3 uuid := gen_random_uuid();
  v_res jsonb;
  v_code_1 text;
  v_code_2 text;
  v_code_3 text;
  v_invite_2 uuid;
  v_link_id uuid;
  v_cnt bigint;
  v_txt text;
  v_i integer;
  v_out jsonb := '[]'::jsonb;
begin
  begin
    -- -----------------------------------------------------------------
    -- Preparación (como administrador del SQL Editor)
    -- -----------------------------------------------------------------
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', v_coach_a, 'authenticated', 'authenticated', 'b4-coach-a@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_coach_b, 'authenticated', 'authenticated', 'b4-coach-b@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_old, 'authenticated', 'authenticated', 'b4-alumno-viejo@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_old_b, 'authenticated', 'authenticated', 'b4-alumno-de-b@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_n1, 'authenticated', 'authenticated', 'b4-nuevo-1@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_n2, 'authenticated', 'authenticated', 'b4-nuevo-2@example.invalid', '{}', '{}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', v_n3, 'authenticated', 'authenticated', 'b4-nuevo-3@example.invalid', '{}', '{}', now(), now());
    update public.profiles set role = 'coach' where id in (v_coach_a, v_coach_b);

    insert into public.client_links (auth_user_id, owner_id, client_id, can_self_log, active)
    values (v_old, v_coach_a, 'b4-cliente-viejo', false, true),
           (v_old_b, v_coach_b, 'b4-cliente-de-b', false, true);

    -- Una serie del alumno viejo (para comprobar que "Quitar acceso" no borra nada).
    insert into public.student_sets (owner_id, client_id, auth_user_id, assignment_id, session_date, day_id, exercise_id, set_number, weight, reps)
    values (v_coach_a, 'b4-cliente-viejo', v_old, 'b4-asig', current_date, 'dia-1', 'ej-1', 1, 40, 10);

    -- Invitaciones hechas "a mano" con códigos conocidos:
    --   ZZZZ-2222 para el alumno que YA tiene cuenta (creada antes de vincularlo)
    --   ZZZZ-3333 vencida
    insert into public.student_invites (owner_id, client_id, display_name, code_hash, expires_at)
    values
      (v_coach_a, 'b4-cliente-viejo', 'Alumno Viejo Falso', public.b4_invite_hash('ZZZZ2222'), now() + interval '7 days'),
      (v_coach_a, 'b4-cliente-vencido', 'Alumno Vencido Falso', public.b4_invite_hash('ZZZZ3333'), now() - interval '1 minute');

    -- -----------------------------------------------------------------
    -- COACH A
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_a::text, true);
    execute 'set local role authenticated';

    -- 1. Crear invitación
    v_res := public.create_student_invite('b4-cliente-nuevo', 'Nuevo Falso');
    v_code_1 := v_res ->> 'code';
    v_out := v_out || jsonb_build_object('n', 1, 'quien', 'coach A', 'prueba', 'Crear invitación: código de 8 sin 0/O/1/I/L', 'esperado', 'ok y XXXX-XXXX',
      'obtenido', coalesce(v_res::text, 'nulo'),
      'resultado', case when (v_res ->> 'ok')::boolean and v_code_1 ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$' then 'PASA' else 'FALLA' end);

    -- 2. Vence en 7 días
    v_out := v_out || jsonb_build_object('n', 2, 'quien', 'coach A', 'prueba', 'La invitación vence en 7 días', 'esperado', '7 días',
      'obtenido', ((v_res ->> 'expires_at')::timestamptz - now())::text,
      'resultado', case when ((v_res ->> 'expires_at')::timestamptz - now()) = interval '7 days' then 'PASA' else 'FALLA' end);

    -- 3. Una nueva anula la anterior
    v_res := public.create_student_invite('b4-cliente-nuevo', 'Nuevo Falso');
    v_code_2 := v_res ->> 'code';
    v_invite_2 := (v_res ->> 'invite_id')::uuid;
    select count(*) filter (where revoked_at is null and used_at is null) || ' pendiente, ' || count(*) filter (where revoked_at is not null) || ' anulada'
      into v_txt from public.student_invites where client_id = 'b4-cliente-nuevo';
    v_out := v_out || jsonb_build_object('n', 3, 'quien', 'coach A', 'prueba', 'Invitación nueva anula la pendiente anterior', 'esperado', '1 pendiente, 1 anulada', 'obtenido', v_txt,
      'resultado', case when v_txt = '1 pendiente, 1 anulada' and v_code_2 <> v_code_1 then 'PASA' else 'FALLA' end);

    -- 4. No puede leer el hash del código
    begin
      select count(code_hash) into v_cnt from public.student_invites;
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 4, 'quien', 'coach A', 'prueba', 'Leer code_hash (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 5. No puede escribir la tabla directamente (todo pasa por las funciones)
    begin
      update public.student_invites set expires_at = now() + interval '1 year' where owner_id = v_coach_a;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 5, 'quien', 'coach A', 'prueba', 'Alargar el vencimiento a mano (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 6. Con cuenta activa no se invita
    v_res := public.create_student_invite('b4-cliente-viejo', 'Alumno Viejo Falso');
    v_out := v_out || jsonb_build_object('n', 6, 'quien', 'coach A', 'prueba', 'Invitar a un alumno con cuenta activa (debe rechazarse)', 'esperado', 'already_linked', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'already_linked' then 'PASA' else 'FALLA' end);

    -- 7. Correos de sus alumnos vinculados
    select string_agg(email, ',') into v_txt from public.coach_student_accounts();
    v_out := v_out || jsonb_build_object('n', 7, 'quien', 'coach A', 'prueba', 'Ve SOLO el correo de su alumno vinculado (no el del alumno de coach B)', 'esperado', 'b4-alumno-viejo@example.invalid', 'obtenido', coalesce(v_txt, 'nada'),
      'resultado', case when v_txt = 'b4-alumno-viejo@example.invalid' then 'PASA' else 'FALLA' end);

    -- 8. El entrenador no canjea
    v_res := public.redeem_student_invite(v_code_2);
    v_out := v_out || jsonb_build_object('n', 8, 'quien', 'coach A', 'prueba', 'Canjear siendo entrenador (debe rechazarse)', 'esperado', 'is_coach', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'is_coach' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- COACH B
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_b, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_b::text, true);

    -- 9. No ve las invitaciones de A
    select count(*) into v_cnt from public.student_invites;
    v_out := v_out || jsonb_build_object('n', 9, 'quien', 'coach B', 'prueba', 'Ver invitaciones de otro entrenador (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 10. No anula las de A
    v_res := public.revoke_student_invite(v_invite_2);
    v_out := v_out || jsonb_build_object('n', 10, 'quien', 'coach B', 'prueba', 'Anular una invitación de otro entrenador (debe bloquearse)', 'esperado', 'revoked = false', 'obtenido', v_res::text,
      'resultado', case when (v_res ->> 'revoked')::boolean is false then 'PASA' else 'FALLA' end);

    -- 11. No ve correos de alumnos de A: solo el de su propio alumno
    select coalesce(string_agg(email, ','), 'nada') into v_txt from public.coach_student_accounts();
    v_out := v_out || jsonb_build_object('n', 11, 'quien', 'coach B', 'prueba', 'Ver correos de alumnos de otro entrenador (debe bloquearse): solo ve el suyo', 'esperado', 'b4-alumno-de-b@example.invalid', 'obtenido', v_txt,
      'resultado', case when v_txt = 'b4-alumno-de-b@example.invalid' then 'PASA' else 'FALLA' end);

    -- 31. Otro entrenador tampoco canjea
    v_res := public.redeem_student_invite(v_code_2);
    v_out := v_out || jsonb_build_object('n', 31, 'quien', 'coach B', 'prueba', 'Canjear siendo entrenador, código de otro coach (debe rechazarse)', 'esperado', 'is_coach', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'is_coach' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- NUEVO 1 (cuenta recién creada, sin vínculo)
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_n1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_n1::text, true);

    -- 12. No ve invitaciones
    select count(*) into v_cnt from public.student_invites;
    v_out := v_out || jsonb_build_object('n', 12, 'quien', 'nuevo 1', 'prueba', 'Ver invitaciones (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 0 then 'PASA' else 'FALLA' end);

    -- 13. No crea invitaciones
    v_res := public.create_student_invite('b4-cliente-viejo', 'Yo');
    v_out := v_out || jsonb_build_object('n', 13, 'quien', 'nuevo 1', 'prueba', 'Crear una invitación siendo alumno (debe rechazarse)', 'esperado', 'not_coach', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'not_coach' then 'PASA' else 'FALLA' end);

    -- 14. Código anulado
    v_res := public.redeem_student_invite(v_code_1);
    v_out := v_out || jsonb_build_object('n', 14, 'quien', 'nuevo 1', 'prueba', 'Canjear el código anulado (debe rechazarse)', 'esperado', 'revoked', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'revoked' then 'PASA' else 'FALLA' end);

    -- 15. Código vencido
    v_res := public.redeem_student_invite('zzzz 3333');
    v_out := v_out || jsonb_build_object('n', 15, 'quien', 'nuevo 1', 'prueba', 'Canjear un código vencido (debe rechazarse)', 'esperado', 'expired', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'expired' then 'PASA' else 'FALLA' end);

    -- 16. Alumno que ya tiene cuenta
    v_res := public.redeem_student_invite('ZZZZ-2222');
    v_out := v_out || jsonb_build_object('n', 16, 'quien', 'nuevo 1', 'prueba', 'Canjear el código de un alumno que ya tiene cuenta (debe rechazarse)', 'esperado', 'student_has_account', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'student_has_account' then 'PASA' else 'FALLA' end);

    -- 17. No puede vincularse a otro alumno escribiendo client_links
    begin
      insert into public.client_links (auth_user_id, owner_id, client_id) values (v_n1, v_coach_a, 'b4-cliente-otro');
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 17, 'quien', 'nuevo 1', 'prueba', 'Crear su propio vínculo a otro alumno (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 18. Canje correcto (con minúsculas y sin guion)
    v_res := public.redeem_student_invite(lower(replace(v_code_2, '-', '')));
    v_out := v_out || jsonb_build_object('n', 18, 'quien', 'nuevo 1', 'prueba', 'Control: canjear el código vigente', 'esperado', 'ok', 'obtenido', v_res::text,
      'resultado', case when (v_res ->> 'ok')::boolean then 'PASA' else 'FALLA' end);

    -- 19. Queda vinculado a esa ficha y con su nombre
    select l.client_id || ' · ' || l.can_self_log || ' · ' || p.full_name into v_txt
    from public.client_links l join public.profiles p on p.id = l.auth_user_id
    where l.auth_user_id = v_n1 and l.active;
    v_out := v_out || jsonb_build_object('n', 19, 'quien', 'nuevo 1', 'prueba', 'Control: vínculo activo, sin registrar series, y nombre puesto', 'esperado', 'b4-cliente-nuevo · false · Nuevo Falso', 'obtenido', coalesce(v_txt, 'sin vínculo'),
      'resultado', case when v_txt = 'b4-cliente-nuevo · false · Nuevo Falso' then 'PASA' else 'FALLA' end);

    -- 20. No puede canjear dos veces
    v_res := public.redeem_student_invite(v_code_2);
    v_out := v_out || jsonb_build_object('n', 20, 'quien', 'nuevo 1', 'prueba', 'Canjear otra vez (debe rechazarse)', 'esperado', 'already_linked', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'already_linked' then 'PASA' else 'FALLA' end);

    -- 21. No puede cambiar su vínculo a otro alumno
    begin
      update public.client_links set client_id = 'b4-cliente-viejo' where auth_user_id = v_n1;
      get diagnostics v_cnt = row_count;
      v_txt := v_cnt || ' filas modificadas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 21, 'quien', 'nuevo 1', 'prueba', 'Cambiar su vínculo a otro alumno (debe bloquearse)', 'esperado', '0 filas', 'obtenido', v_txt,
      'resultado', case when v_txt in ('bloqueado', '0 filas modificadas') then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- NUEVO 2: llega tarde con el mismo código
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_n2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_n2::text, true);

    -- 22. Código ya usado
    v_res := public.redeem_student_invite(v_code_2);
    v_out := v_out || jsonb_build_object('n', 22, 'quien', 'nuevo 2', 'prueba', 'Canjear un código ya usado (debe rechazarse)', 'esperado', 'used', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'used' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- COACH A: "Quitar acceso" al nuevo 1 e invitación nueva
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_a::text, true);

    select id into v_link_id from public.client_links where client_id = 'b4-cliente-nuevo';
    update public.client_links set active = false where owner_id = v_coach_a and client_id = 'b4-cliente-nuevo';
    get diagnostics v_cnt = row_count;
    v_out := v_out || jsonb_build_object('n', 23, 'quien', 'coach A', 'prueba', 'Control: "Quitar acceso" deja active = false', 'esperado', '1 fila', 'obtenido', v_cnt || ' filas', 'resultado', case when v_cnt = 1 then 'PASA' else 'FALLA' end);

    v_res := public.create_student_invite('b4-cliente-nuevo', 'Nuevo Falso');
    v_code_3 := v_res ->> 'code';

    -- 24. Lo de antes sigue ahí (como administrador)
    execute 'reset role';
    select (select count(*) from auth.users where id = v_n1) || ' cuenta, ' || (select count(*) from public.student_sets where owner_id = v_coach_a) || ' serie'
      into v_txt;
    v_out := v_out || jsonb_build_object('n', 24, 'quien', 'sistema', 'prueba', 'Quitar acceso no borra la cuenta ni las series', 'esperado', '1 cuenta, 1 serie', 'obtenido', v_txt, 'resultado', case when v_txt = '1 cuenta, 1 serie' then 'PASA' else 'FALLA' end);
    execute 'set local role authenticated';

    -- -----------------------------------------------------------------
    -- NUEVO 2: canjea la invitación nueva -> reactiva el mismo vínculo
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_n2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_n2::text, true);

    v_res := public.redeem_student_invite(v_code_3);
    execute 'reset role';
    select count(*) || ' fila, misma: ' || bool_and(id = v_link_id) || ', cuenta nueva: ' || bool_and(auth_user_id = v_n2 and active)
      into v_txt from public.client_links where owner_id = v_coach_a and client_id = 'b4-cliente-nuevo';
    v_out := v_out || jsonb_build_object('n', 25, 'quien', 'nuevo 2', 'prueba', 'Control: canjear tras "Quitar acceso" reactiva el vínculo con la cuenta nueva', 'esperado', '1 fila, misma: true, cuenta nueva: true',
      'obtenido', coalesce(v_res ->> 'error', '') || ' ' || coalesce(v_txt, ''),
      'resultado', case when (v_res ->> 'ok')::boolean and v_txt = '1 fila, misma: true, cuenta nueva: true' then 'PASA' else 'FALLA' end);
    execute 'set local role authenticated';

    -- -----------------------------------------------------------------
    -- NUEVO 3: límite de intentos
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims', json_build_object('sub', v_n3, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_n3::text, true);

    v_txt := '';
    for v_i in 1..10 loop
      v_res := public.redeem_student_invite('AAAA-AAA' || substr('23456789AB', v_i, 1));
      v_txt := v_txt || coalesce(v_res ->> 'error', 'ok') || case when v_i < 10 then ',' else '' end;
    end loop;
    v_out := v_out || jsonb_build_object('n', 26, 'quien', 'nuevo 3', 'prueba', 'Control: 10 códigos inventados responden "invalid" sin decir si existen', 'esperado', '10 veces invalid', 'obtenido', v_txt,
      'resultado', case when v_txt = 'invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid,invalid' then 'PASA' else 'FALLA' end);

    -- 27. El intento 11 se bloquea aunque el código sea bueno
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_coach_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_coach_a::text, true);
    execute 'set local role authenticated';
    v_res := public.create_student_invite('b4-cliente-tres', 'Tres Falso');
    v_code_3 := v_res ->> 'code';
    perform set_config('request.jwt.claims', json_build_object('sub', v_n3, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_n3::text, true);
    v_res := public.redeem_student_invite(v_code_3);
    v_out := v_out || jsonb_build_object('n', 27, 'quien', 'nuevo 3', 'prueba', 'Intento 11 en una hora, aun con código bueno (debe bloquearse)', 'esperado', 'too_many', 'obtenido', coalesce(v_res ->> 'error', v_res::text),
      'resultado', case when v_res ->> 'error' = 'too_many' then 'PASA' else 'FALLA' end);

    -- 28. No ve los intentos
    begin
      select count(*) into v_cnt from public.student_invite_attempts;
      v_txt := v_cnt || ' filas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 28, 'quien', 'nuevo 3', 'prueba', 'Leer o borrar sus intentos (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- -----------------------------------------------------------------
    -- SIN SESIÓN (anon)
    -- -----------------------------------------------------------------
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';

    begin
      select count(*) into v_cnt from public.student_invites;
      v_txt := v_cnt || ' filas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 29, 'quien', 'anon', 'prueba', 'Leer invitaciones sin sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt in ('bloqueado', '0 filas') then 'PASA' else 'FALLA' end);

    begin
      v_res := public.redeem_student_invite('ZZZZ-2222');
      v_txt := 'permitido: ' || v_res::text;
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 30, 'quien', 'anon', 'prueba', 'Canjear sin sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    begin
      v_res := public.create_student_invite('b4-cliente-nuevo', 'Anónimo');
      v_txt := 'permitido: ' || v_res::text;
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 32, 'quien', 'anon', 'prueba', 'Crear invitación sin sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    begin
      v_res := public.revoke_student_invite(v_invite_2);
      v_txt := 'permitido: ' || v_res::text;
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 33, 'quien', 'anon', 'prueba', 'Anular invitación sin sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    begin
      select count(*) into v_cnt from public.coach_student_accounts();
      v_txt := 'permitido: ' || v_cnt || ' filas';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 34, 'quien', 'anon', 'prueba', 'Leer correos de alumnos sin sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    -- 35 y 36. Las funciones de apoyo tampoco (anon ni con sesión)
    begin
      v_txt := public.b4_invite_hash('ZZZZ2222');
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 35, 'quien', 'anon', 'prueba', 'Usar la función interna de hash (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_n1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_n1::text, true);
    execute 'set local role authenticated';
    begin
      v_txt := public.b4_invite_normalize('zzzz-2222');
      v_txt := 'permitido';
    exception
      when insufficient_privilege then v_txt := 'bloqueado';
      when others then v_txt := 'error inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
    v_out := v_out || jsonb_build_object('n', 36, 'quien', 'nuevo 1', 'prueba', 'Usar la función interna de normalizar con sesión (debe bloquearse)', 'esperado', 'bloqueado', 'obtenido', v_txt, 'resultado', case when v_txt = 'bloqueado' then 'PASA' else 'FALLA' end);

    execute 'reset role';

    -- Deshacer todo lo anterior (usuarios falsos, invitaciones, vínculos, series).
    raise exception using errcode = 'B4RBK', message = 'b4_deshacer';
  exception
    when sqlstate 'B4RBK' then
      null;
    when others then
      v_out := v_out || jsonb_build_object('n', 0, 'quien', 'sistema', 'prueba', 'ERROR durante la prueba (todo se deshizo)', 'esperado', 'sin errores', 'obtenido', sqlstate || ': ' || sqlerrm, 'resultado', 'FALLA');
  end;

  perform set_config('valhalla.b4_resultados', v_out::text, false);
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
from jsonb_to_recordset(current_setting('valhalla.b4_resultados')::jsonb)
  as r(n int, quien text, prueba text, esperado text, obtenido text, resultado text)
order by r.n;
