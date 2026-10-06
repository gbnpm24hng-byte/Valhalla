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
- publish-core.js, publish.js — "Publicar al alumno" (copia campo por campo desde una lista cerrada).
- student-view.js — vista de alumno de solo lectura.
- labels.js — tabla única de etiquetas en español y categorías del armador.
- onboarding.js — formulario público de ingreso (?onboarding=1), sin login.
- cloud-data.js — capa de tablas antiguas, desactivada. supabase/ — migración A0 y prueba de RLS (SQL).

## Reglas fijas
- No hacer commit ni push sin confirmación explícita.
- Nunca tocar seed-data/ (datos reales, en .gitignore). Leerlo solo si se pide, sin subir nada.
- Agregar archivos uno por uno; nunca `git add -A`.
- Antes del commit: correr la suite y las baterías; mostrar `git status` y `git diff --cached --stat`;
  buscar secretos (sb_secret, service_role, password, contraseña, JWT) y nombres de clientes.
- Nunca pedir contraseñas ni la secret key. Nunca escribir en el Supabase real: probar con Supabase simulado y datos falsos.
- Lo publicado al alumno nunca incluye datos de pago (monthly_value, payment_status, amount, renewal_*)
  ni personales (teléfono, correo, lesiones, observaciones).
- Si cambia cualquier archivo que sirve la app (JS, CSS o HTML), subir la versión de la caché en
  service-worker.js y el número visible del encabezado (index.html).
- Reporte final corto: hash, un renglón por resultado de pruebas y solo lo que requiera decisión del usuario.

## Tests
& "C:\Users\sebal\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test

Baterías de Playwright (A1 caídas y login, A2, A3, B, Modo Grupo, Fichas…): en la carpeta hermana
..\valhalla-pruebas-privadas (fuera del repo). CONTIENEN NOMBRES REALES: nunca copiarlas al repo.
Instalación y uso en su LEEME.md (playwright-core, Chrome y serve-local.js en 127.0.0.1:8765, que bloquea seed-data/).

## Al compactar
Conservar: qué archivos se cambiaron, qué pruebas pasaron (con sus números) y qué quedó pendiente o sin confirmar.
