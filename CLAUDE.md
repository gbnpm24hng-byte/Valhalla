# VALHALLA — guía para Claude

PWA estática (HTML/CSS/JS sin build) de Vikingos Radical, publicada en GitHub Pages desde un repo PÚBLICO (nunca claves ni datos de clientes).
Guarda primero en localStorage y sincroniza con Supabase (coach_state + tablas de alumno protegidas con RLS).

## Mapa de assets/js
- data.js — estado local, normalización, importar/exportar respaldo.
- app.js — interfaz del entrenador: clientes, entrenamientos, Modo Grupo, biblioteca, finanzas, nutrición.
- finance.js — cálculos de finanzas.
- config.js — Project URL y clave publishable (lo único público permitido).
- supabase.js, auth.js — cliente de Supabase y sesión. auth-gate.js — pantalla de acceso, roles coach/student, modo sin conexión.
- sync-core.js, cloud-sync.js — qué se sube (lista cerrada, sin finanzas) y guardado automático con versión y conflictos.
  Ojo: importState/loadState NO son idempotentes (inventan id/createdAt/updatedAt si faltan; p. ej. series de
  Modo Grupo sin createdAt). Para verificar una carga desde la nube usar syncCore.verifyCloudLoad (lo escrito
  tal cual + lo leído salvo esos campos), nunca comparar dos normalizaciones con compare().identical.
- publish-core.js, publish.js — "Publicar al alumno" (copia campo por campo desde una lista cerrada).
- student-view.js — vista de alumno de solo lectura. v0.9.52: renderPreview = "Vista alumno" del entrenador
  (ficha y Modo Grupo "⋯"): lo publicado leído con publish.loadPreview, encima de la pantalla, franja
  "Así lo ve NOMBRE · Volver", nunca escribe (ni caché, ni cola, ni student_sets). La pantalla vieja #studentTraining se quitó.
- labels.js — tabla única de etiquetas en español y categorías del armador.
- client-overrides-core.js — cambios de ejercicio de UN alumno (Modo Grupo: "Solo hoy" / "De aquí en adelante"),
  guardados en trainingsV08.clientOverrides y aplicados encima de su asignación (nunca tocan el programa común).
- group-draft-core.js — borrador de Modo Grupo (lo escrito sin confirmar), solo en el teléfono:
  clave propia valhalla_group_draft:<cuenta>, fuera del estado; no sube a la nube ni sale en respaldos.
- group-round-core.js — Modo Grupo compacto v2: series hechas (peso y reps), −/+ (2,5 kg / 1 rep), coma decimal,
  siguiente alumno en orden circular, vuelta y Cierre de ronda. Solo arma valores del borrador; el peso propuesto lo da getGroupProposedWeight (app.js).
- blocks-core.js — Bloques fase 1 (v0.9.44): ejercicio por tiempo (measure 'time', durationSeconds; series con seconds;
  en student_sets los segundos van en reps) y superseries (day.blocks + blockId, de 2 a 4 seguidos, series = vueltas).
  Todo opcional. Fase 2 (circuitos) = otro type en BLOCK_TYPES. Se carga antes de data.js.
- student-import-core.js — "Traer registros" (B3.3): junta student_sets en las sesiones sin pisar lo del entrenador.
- coach-sets-core.js — B3.4: Modo Grupo prellena con lo del alumno; al confirmar escribe en student_sets solo lo
  corregido o no registrado (coach_validated). Lo pendiente vive en valhalla_coach_sets:<cuenta>, fuera del estado.
- settings-core.js — Ajustes: fecha del último respaldo en valhalla_last_export_at (fuera del estado, no sube a la nube)
  y revisión del archivo antes de "Restaurar" (archivo de programa o sin alumnos = bloqueado).
- monthly-card-core.js — Tarjeta del mes (v0.9.47): trainingsV08.monthlyCards { 'AAAA-MM': { clientId: { message, sentAt } } }
  (sube con trainingsV08) y los números del mes con los cálculos que le pasa app.js. Se carga antes de data.js.
  monthly-card.js — dibujo en canvas 1080 × 1350 y envío (compartir el PNG o descargar + wa.me).
- invite-core.js — B4 invitaciones (v0.9.49): forma del código (8, sin 0/O/1/I/L), link ?invitacion=, mensaje de
  WhatsApp y textos de error. invites.js — "Cuenta de la app" en la ficha (Invitar, Copiar mensaje, WhatsApp,
  Nueva invitación, Anular, Quitar acceso = client_links.active=false). El alumno crea su cuenta con código en
  auth-gate.js ("Tengo un código"). Nube: supabase/b4_invitaciones.sql (solo agrega); sin ese SQL "Invitar" avisa.
  El código nunca se guarda en texto (solo su hash en la nube) ni entra al estado local.
- payment-period-core.js — v0.9.51: período de pago por clases. "Marcar pagado" guarda paidAt = hoy; el pago vuelve
  solo a Pendiente al usar las clases (classesPerPayment a mano o clases por semana × 4; 12 sin dato) o a los 28 días.
  Revisión al abrir (con la nube al día) y al guardar (persist y saveSessionState en app.js). paidAt y classesPerPayment
  suben con los alumnos en coach_state; nunca se publican. Pagado sin paidAt = "sin fecha de inicio" y nunca cambia
  solo (no se deduce de finanzas). En Editar, "Inicio del pago" corrige paidAt a mano (startDateFromForm).
- onboarding.js — formulario público de ingreso (?onboarding=1), sin login.
- cloud-data.js — capa de tablas antiguas, desactivada. supabase/ — migración A0 y prueba de RLS (SQL);
  B4: b4_invitaciones.sql, b4_invitaciones_deshacer.sql y b4_prueba_invitaciones.sql (36 pruebas, todo se deshace).

## Reglas fijas
- No hacer commit ni push sin confirmación explícita.
- Nunca tocar ni leer seed-data/ (datos reales, en .gitignore), por ningún motivo: tampoco para buscar nombres.
  La búsqueda de nombres reales antes del commit se hace solo sobre el diff, con una lista genérica de nombres.
- Agregar archivos uno por uno; nunca `git add -A`.
- Antes del commit: correr la suite y las baterías; mostrar `git status` y `git diff --cached --stat`;
  buscar secretos (sb_secret, service_role, password, contraseña, JWT) y nombres de clientes.
- Nunca pedir contraseñas ni la secret key. Nunca escribir en el Supabase real: probar con Supabase simulado y datos falsos.
- Lo publicado al alumno nunca incluye datos de pago (monthly_value, payment_status, amount, renewal_*)
  ni personales (teléfono, correo, lesiones, observaciones).
- Si cambia cualquier archivo que sirve la app (JS, CSS o HTML), subir la versión de la caché en
  service-worker.js, el número visible del encabezado (index.html) y APP_VERSION en sync-core.js
  (candado de versión: una app más vieja que la última que guardó en coach_state no guarda en la nube).
  tests/version-lock.test.js revisa que las tres coincidan.
- data.js conserva los campos que no conoce (keepUnknown): no quitarlo, es lo que evita que
  guardar desde una versión borre datos de otra.
- Reporte final corto: hash, un renglón por resultado de pruebas y solo lo que requiera decisión del usuario.

## Tests
& "C:\Users\sebal\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test

Baterías de Playwright (A1 caídas y login, A2, A3, B, Modo Grupo, Fichas…): en la carpeta hermana
..\valhalla-pruebas-privadas (fuera del repo). CONTIENEN NOMBRES REALES: nunca copiarlas al repo.
Instalación y uso en su LEEME.md (playwright-core, Chrome y serve-local.js en 127.0.0.1:8765, que bloquea seed-data/).

## Al compactar
Conservar: qué archivos se cambiaron, qué pruebas pasaron (con sus números) y qué quedó pendiente o sin confirmar.
