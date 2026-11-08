-- =====================================================================
-- VALHALLA · Fase B4 · Invitaciones de alumnos (cuenta propia con código)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de a0_migracion_roles_sync.sql
-- (y de b3_1_registro_alumno.sql si se usa). Se puede ejecutar varias veces.
-- Para volver atrás: b4_invitaciones_deshacer.sql. Prueba: b4_prueba_invitaciones.sql.
--
-- Qué hace (solo agrega cosas nuevas):
--   * Tabla student_invites: una invitación por alumno con el HASH del código
--     (el código en texto nunca se guarda), vencimiento, uso y anulación.
--   * Tabla student_invite_attempts: intentos fallidos de canje (límite por hora).
--   * Funciones nuevas:
--       create_student_invite(client_id, nombre)  -> solo entrenador; devuelve el código UNA vez
--       revoke_student_invite(invite_id)          -> solo entrenador; anula una pendiente suya
--       redeem_student_invite(código)             -> cuenta con sesión; vincula a la ficha
--       coach_student_accounts()                  -> solo entrenador; correo de sus alumnos vinculados
--
-- Qué NO hace:
--   * No cambia tablas, políticas ni funciones existentes (profiles, client_links,
--     student_sets, coach_state...). Escribe en client_links y profiles.full_name
--     SOLO a través de redeem_student_invite, con las mismas reglas de siempre
--     (un vínculo activo por cuenta; unique(owner_id, client_id)).
--   * No borra usuarios ni filas. Quitar acceso = client_links.active = false (desde la app).
--   * No contiene claves ni contraseñas.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tablas nuevas
-- ---------------------------------------------------------------------

create table if not exists public.student_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id text not null,
  display_name text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_invites_client_id_len check (char_length(client_id) between 1 and 200),
  constraint student_invites_display_name_len check (char_length(display_name) between 1 and 120),
  constraint student_invites_code_hash_unique unique (code_hash)
);

-- Como máximo una invitación pendiente (sin usar ni anular) por alumno del entrenador.
create unique index if not exists student_invites_one_pending
  on public.student_invites (owner_id, client_id) where used_at is null and revoked_at is null;

create index if not exists idx_student_invites_owner_client on public.student_invites (owner_id, client_id);

-- Intentos fallidos de canje (solo los escriben las funciones; nadie los lee desde la app).
create table if not exists public.student_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_student_invite_attempts_user on public.student_invite_attempts (user_id, attempted_at);

-- ---------------------------------------------------------------------
-- 2. Privilegios y RLS
-- ---------------------------------------------------------------------

revoke all on public.student_invites, public.student_invite_attempts from anon, authenticated;

-- El entrenador solo LEE sus invitaciones, y sin la columna code_hash.
-- Crear, anular y canjear pasa solo por las funciones de abajo.
grant select (id, owner_id, client_id, display_name, expires_at, used_at, used_by, revoked_at, created_at)
  on public.student_invites to authenticated;

alter table public.student_invites enable row level security;
alter table public.student_invite_attempts enable row level security;

drop policy if exists student_invites_coach_select on public.student_invites;
create policy student_invites_coach_select on public.student_invites
for select to authenticated
using ((select public.is_coach()) and owner_id = (select auth.uid()));

-- student_invite_attempts: RLS activo y sin políticas = nadie la ve desde la app.

-- ---------------------------------------------------------------------
-- 3. Funciones de apoyo (no se pueden llamar desde la app)
-- ---------------------------------------------------------------------

-- Deja solo letras y números, en mayúscula: "vk7q-4m2p " -> "VK7Q4M2P".
create or replace function public.b4_invite_normalize(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Hash del código normalizado (sha256 de PostgreSQL; no necesita extensiones).
create or replace function public.b4_invite_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to('valhalla-b4:' || p_code, 'UTF8')), 'hex');
$$;

revoke all on function public.b4_invite_normalize(text) from public, anon, authenticated;
revoke all on function public.b4_invite_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Crear invitación (solo entrenador)
-- ---------------------------------------------------------------------
-- Código de 8 caracteres sin 0/O ni 1/I/L (31 posibles), sacados de gen_random_uuid()
-- (fuente aleatoria segura) con descarte para que todos tengan la misma probabilidad.
-- Vence en 7 días, sirve una vez y anula la invitación pendiente anterior de ese alumno.
-- Respuesta: {"ok":true,"code":"VK7Q-4M2P","invite_id":...,"expires_at":...}
--         o  {"ok":false,"error":"not_coach" | "bad_client" | "already_linked"}
create or replace function public.create_student_invite(p_client_id text, p_display_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_name text := left(btrim(coalesce(p_display_name, '')), 120);
  v_expires timestamptz := now() + interval '7 days';
  v_code text;
  v_bytes bytea;
  v_byte integer;
  v_pos integer;
  v_id uuid;
  v_tries integer := 0;
begin
  if v_owner is null or not public.is_coach() then
    return jsonb_build_object('ok', false, 'error', 'not_coach');
  end if;
  if p_client_id is null or char_length(p_client_id) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'bad_client');
  end if;
  if v_name = '' then
    v_name := 'Alumno';
  end if;
  -- Con cuenta activa no se invita: primero "Quitar acceso" (deja active = false).
  if exists (
    select 1 from public.client_links l
    where l.owner_id = v_owner and l.client_id = p_client_id and l.active
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;

  update public.student_invites
  set revoked_at = now()
  where owner_id = v_owner and client_id = p_client_id and used_at is null and revoked_at is null;

  loop
    v_code := '';
    while char_length(v_code) < 8 loop
      v_bytes := uuid_send(gen_random_uuid());
      -- Bytes 6 y 8 llevan bits fijos (versión y variante del uuid): no se usan.
      foreach v_pos in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15] loop
        v_byte := get_byte(v_bytes, v_pos);
        if v_byte < 248 and char_length(v_code) < 8 then  -- 248 = 31 * 8
          v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
        end if;
      end loop;
    end loop;
    begin
      insert into public.student_invites (owner_id, client_id, display_name, code_hash, expires_at)
      values (v_owner, p_client_id, v_name, public.b4_invite_hash(v_code), v_expires)
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- Código repetido (muy improbable): se genera otro.
      v_tries := v_tries + 1;
      if v_tries >= 5 then
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'invite_id', v_id,
    'code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4),
    'expires_at', v_expires
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Anular invitación (solo entrenador, solo las suyas y pendientes)
-- ---------------------------------------------------------------------
create or replace function public.revoke_student_invite(p_invite_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_count integer;
begin
  if v_owner is null or not public.is_coach() then
    return jsonb_build_object('ok', false, 'error', 'not_coach');
  end if;
  update public.student_invites
  set revoked_at = now()
  where id = p_invite_id and owner_id = v_owner and used_at is null and revoked_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'revoked', v_count > 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Correo de los alumnos vinculados (solo entrenador, solo vínculos activos suyos)
-- ---------------------------------------------------------------------
create or replace function public.coach_student_accounts()
returns table (client_id text, email text, linked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.client_id, u.email::text, l.updated_at
  from public.client_links l
  join auth.users u on u.id = l.auth_user_id
  where public.is_coach()
    and l.owner_id = auth.uid()
    and l.active;
$$;

-- ---------------------------------------------------------------------
-- 7. Canjear invitación (cuenta con sesión, sin vínculo activo)
-- ---------------------------------------------------------------------
-- Errores (la app los traduce; "invalid" no dice si el código existe):
--   not_authenticated, no_profile, is_coach, inactive, already_linked, too_many,
--   invalid, used, revoked, expired, student_has_account, conflict
-- Límite: 10 intentos fallidos por cuenta en la última hora. Como la función responde
-- (no lanza un error), el intento fallido queda guardado.
create or replace function public.redeem_student_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_code text;
  v_invite public.student_invites%rowtype;
  v_fails integer;
  v_link_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select p.role, p.active into v_role, v_active from public.profiles p where p.id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_role = 'coach' then
    return jsonb_build_object('ok', false, 'error', 'is_coach');
  end if;
  if v_role is distinct from 'student' or not v_active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;
  if exists (select 1 from public.client_links l where l.auth_user_id = v_uid and l.active) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;

  delete from public.student_invite_attempts a
  where a.user_id = v_uid and a.attempted_at < now() - interval '1 day';
  select count(*) into v_fails
  from public.student_invite_attempts a
  where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  v_code := public.b4_invite_normalize(p_code);
  if v_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$' then
    insert into public.student_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_invite
  from public.student_invites i
  where i.code_hash = public.b4_invite_hash(v_code)
  for update;
  if not found or not exists (
    select 1 from public.profiles p where p.id = v_invite.owner_id and p.role = 'coach' and p.active
  ) then
    insert into public.student_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_invite.used_at is not null then
    insert into public.student_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'used');
  end if;
  if v_invite.revoked_at is not null then
    insert into public.student_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if v_invite.expires_at <= now() then
    insert into public.student_invite_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if exists (
    select 1 from public.client_links l
    where l.owner_id = v_invite.owner_id and l.client_id = v_invite.client_id and l.active
  ) then
    return jsonb_build_object('ok', false, 'error', 'student_has_account');
  end if;

  begin
    -- Un vínculo inactivo de ese entrenador y alumno (unique incluye inactivos) se
    -- reactiva con la cuenta nueva; si no hay, se crea. can_self_log siempre parte en false.
    update public.client_links l
    set auth_user_id = v_uid, active = true, can_self_log = false
    where l.owner_id = v_invite.owner_id and l.client_id = v_invite.client_id
    returning l.id into v_link_id;
    if v_link_id is null then
      insert into public.client_links (auth_user_id, owner_id, client_id, can_self_log, active)
      values (v_uid, v_invite.owner_id, v_invite.client_id, false, true)
      returning id into v_link_id;
    end if;

    update public.profiles set full_name = v_invite.display_name where id = v_uid;
    update public.student_invites set used_at = now(), used_by = v_uid where id = v_invite.id;
  exception when unique_violation then
    -- Otro canje terminó justo antes (misma cuenta o mismo alumno): no se cambia nada.
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end;

  return jsonb_build_object('ok', true, 'display_name', v_invite.display_name);
end;
$$;

revoke all on function public.create_student_invite(text, text) from public, anon;
revoke all on function public.revoke_student_invite(uuid) from public, anon;
revoke all on function public.coach_student_accounts() from public, anon;
revoke all on function public.redeem_student_invite(text) from public, anon;
grant execute on function public.create_student_invite(text, text) to authenticated;
grant execute on function public.revoke_student_invite(uuid) to authenticated;
grant execute on function public.coach_student_accounts() to authenticated;
grant execute on function public.redeem_student_invite(text) to authenticated;

commit;

-- Para que la app vea las funciones y la tabla nuevas sin esperar:
notify pgrst, 'reload schema';
