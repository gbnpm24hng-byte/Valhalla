-- =====================================================================
-- VALHALLA · Deshacer la fase B4 (invitaciones de alumnos)
-- =====================================================================
-- Ejecutar en el SQL Editor de Supabase solo si hay que volver atrás después de
-- b4_invitaciones.sql. Se puede ejecutar varias veces.
--
-- Qué hace:
--   * Quita las 4 funciones de invitaciones y sus 2 funciones de apoyo.
--   * Borra las tablas student_invites y student_invite_attempts (el historial de
--     invitaciones se pierde; ninguna otra tabla depende de ellas).
--
-- Qué NO hace:
--   * No toca las cuentas ya vinculadas: sus filas de client_links, sus perfiles
--     (full_name) y sus series siguen igual. Para quitar acceso a alguien:
--     client_links.active = false (desde la ficha, "Quitar acceso").
--   * No borra usuarios.
-- =====================================================================

begin;

drop function if exists public.redeem_student_invite(text);
drop function if exists public.create_student_invite(text, text);
drop function if exists public.revoke_student_invite(uuid);
drop function if exists public.coach_student_accounts();
drop function if exists public.b4_invite_hash(text);
drop function if exists public.b4_invite_normalize(text);

drop table if exists public.student_invite_attempts;
drop table if exists public.student_invites;

commit;

notify pgrst, 'reload schema';
