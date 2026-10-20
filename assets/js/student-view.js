(function () {
  // Fase B2: vista del alumno. Lee únicamente student_programs y student_progress con la
  // sesión del alumno (RLS: solo lo suyo y solo lo publicado). No muestra finanzas, lista
  // de clientes ni nada de otros alumnos.
  // Fase B3.2: si el vínculo tiene can_self_log, el alumno registra sus series. Se guardan
  // primero en el teléfono (por cuenta) y se suben a student_sets cuando hay conexión.
  // Sin can_self_log ve las mismas pantallas en solo lectura.
  // v0.9.29: pantallas "Hoy", "Ejercicio" y "Resumen". Racha, semana y récords se calculan
  // solo en pantalla: no se guarda nada nuevo y lo que se sube es la misma fila de siempre.
  window.VALHALLA = window.VALHALLA || {};

  const authApi = window.VALHALLA.auth;
  const selfLog = window.VALHALLA.selfLogCore;
  const CACHE_KEY = 'valhalla_student_cache';
  const TIMEOUT_MS = 15000;
  const RETRY_MS = 20000;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  function formatDate(value, withTime = false) {
    if (!value) {
      return '';
    }
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return withTime
      ? date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
      : date.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function withTimeout(promise, fallback) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))]);
  }

  const TIMED_OUT = { data: null, error: { message: 'timeout', timedOut: true }, status: 0 };

  function unavailable(result) {
    return Boolean(result.error && (result.error.timedOut || authApi.isUnavailableError(result.error, result.status)));
  }

  function readCache(userId) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return cache && cache.userId === userId ? cache : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      // Sin espacio: simplemente no habrá vista sin conexión.
    }
  }

  // Se llama al cerrar sesión. Lo pendiente de subir NO se borra: queda bajo esa cuenta.
  function clearCache() {
    stopLog();
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      // Nada que limpiar.
    }
  }

  // Lee el vínculo, el programa publicado y el historial del alumno.
  async function fetchData(userId) {
    const client = authApi.getClient();
    const link = await withTimeout(
      client.from('client_links').select('client_id, owner_id, can_self_log').eq('auth_user_id', userId).eq('active', true).maybeSingle(),
      TIMED_OUT
    );
    if (link.error) {
      return { error: true, unavailable: unavailable(link) };
    }
    if (!link.data) {
      return { linked: false };
    }
    const { client_id: clientId, owner_id: ownerId } = link.data;
    const canSelfLog = link.data.can_self_log === true;
    const [programs, progress, sets] = await Promise.all([
      withTimeout(
        client.from('student_programs').select('assignment_id, title, data, published_at')
          .eq('owner_id', ownerId).eq('client_id', clientId).eq('active', true)
          .order('published_at', { ascending: false }),
        TIMED_OUT
      ),
      withTimeout(
        client.from('student_progress').select('session_id, session_date, title, data')
          .eq('owner_id', ownerId).eq('client_id', clientId)
          .order('session_date', { ascending: false }).limit(60),
        TIMED_OUT
      ),
      // Sus series ya registradas (por él o corregidas por el entrenador), solo si puede registrar.
      canSelfLog
        ? withTimeout(
          client.from('student_sets')
            .select('assignment_id, session_date, day_id, exercise_id, set_type, set_number, weight, reps, rir, auth_user_id, updated_at')
            .eq('owner_id', ownerId).eq('client_id', clientId)
            .order('session_date', { ascending: false }).limit(500),
          TIMED_OUT
        )
        : Promise.resolve({ data: [] })
    ]);
    if (programs.error || progress.error || sets.error) {
      const failed = programs.error ? programs : progress.error ? progress : sets;
      return { error: true, unavailable: unavailable(failed) };
    }
    return { linked: true, ownerId, clientId, canSelfLog, programs: programs.data || [], progress: progress.data || [], setRows: sets.data || [] };
  }

  // ---------------------------------------------------------------------------
  // Formato (también lo usan las pruebas)
  // ---------------------------------------------------------------------------

  // Un número "con dato": la app guarda 0 cuando el campo quedó vacío.
  function hasValue(value) {
    return value !== null && value !== undefined && value !== '' && Number(value) > 0;
  }

  // Serie: muestra solo lo que tiene dato ("60 kg", sin "× 0 reps").
  function setLine(set) {
    const parts = [];
    if (hasValue(set.weight)) parts.push(`${Number(set.weight)} kg`);
    if (hasValue(set.reps)) parts.push(`${Number(set.reps)} reps`);
    let line = parts.join(' × ') || 'por definir';
    if (set.rir !== null && set.rir !== undefined && set.rir !== '') line += ` · RIR ${Number(set.rir)}`;
    return line;
  }

  // Lo mismo para las pantallas del alumno: sin la palabra RIR (se muestra cómo se sintió).
  function studentSetLine(set) {
    const parts = [];
    if (hasValue(set.weight)) parts.push(`${formatNumber(Number(set.weight))} kg`);
    if (hasValue(set.reps)) parts.push(`${Number(set.reps)} reps`);
    const feel = feelFromRir(set.rir);
    return `${parts.join(' × ') || 'por definir'}${feel ? ` · ${feel}` : ''}`;
  }

  function setHasData(set) {
    return hasValue(set?.weight) || hasValue(set?.reps);
  }

  function repsRange(exercise) {
    if (!hasValue(exercise.repMin)) return 'reps por definir';
    return hasValue(exercise.repMax) && Number(exercise.repMax) !== Number(exercise.repMin)
      ? `${Number(exercise.repMin)}–${Number(exercise.repMax)} reps`
      : `${Number(exercise.repMin)} reps`;
  }

  // "3 × 10-12", "3 × reps por definir" o "Series por definir".
  function exerciseScheme(exercise) {
    const sets = hasValue(exercise.sets) ? Math.floor(Number(exercise.sets)) : 0;
    if (!sets) return 'Series por definir';
    if (!hasValue(exercise.repMin)) return `${sets} × reps por definir`;
    const reps = hasValue(exercise.repMax) && Number(exercise.repMax) !== Number(exercise.repMin)
      ? `${Number(exercise.repMin)}-${Number(exercise.repMax)}`
      : `${Number(exercise.repMin)}`;
    return `${sets} × ${reps}`;
  }

  // Nota para el alumno: sin frases internas (también en lo que se publicó antes del filtro).
  function noteForStudent(value) {
    return window.VALHALLA.publishCore?.studentNote ? window.VALHALLA.publishCore.studentNote(value) : String(value || '');
  }

  function formatNumber(value) {
    return value === null || value === undefined || value === '' ? '' : String(value).replace('.', ',');
  }

  function formatKg(value) {
    return Math.round(Number(value) || 0).toLocaleString('es-CL');
  }

  function foldText(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // "¿Cómo se sintió?" se guarda en el RIR de la última serie efectiva. El alumno nunca ve "RIR".
  const FEEL_OPTIONS = [
    { rir: 3, label: 'Fácil', hint: 'podía más' },
    { rir: 2, label: 'Bien', hint: 'justo' },
    { rir: 0, label: 'Difícil', hint: 'apenas' }
  ];

  function feelFromRir(rir) {
    if (rir === null || rir === undefined || rir === '' || !Number.isFinite(Number(rir))) return '';
    const value = Number(rir);
    // También traduce el RIR del entrenador en el historial: 0-1 Difícil, 2 Bien, 3 o más Fácil.
    return value >= 3 ? 'Fácil' : value >= 2 ? 'Bien' : 'Difícil';
  }

  // ---------------------------------------------------------------------------
  // Fechas en hora local del teléfono: semana (lunes a domingo) y racha
  // ---------------------------------------------------------------------------

  const pad2 = (n) => String(n).padStart(2, '0');

  function localToday(now = new Date()) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  // Suma días a una fecha AAAA-MM-DD (calendario puro, sin zona horaria).
  function addDays(isoDate, days) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  function weekStart(isoDate) {
    const weekday = new Date(`${isoDate}T12:00:00`).getDay(); // 0 = domingo
    return addDays(isoDate, -((weekday + 6) % 7));
  }

  function weekDates(isoDate) {
    const start = weekStart(isoDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  // Semanas seguidas con al menos un día registrado, hasta la actual. La semana actual
  // todavía sin registro no corta la racha (se cuenta desde la anterior).
  function weekStreak(dates, today) {
    const has = (start) => weekDates(start).some((date) => dates.has(date));
    let start = weekStart(today);
    if (!has(start)) start = addDays(start, -7);
    let count = 0;
    while (has(start) && count < 520) {
      count += 1;
      start = addDays(start, -7);
    }
    return count;
  }

  // Día que entrena: con series propias, pendientes o sesiones publicadas por el entrenador.
  function activityDates(cache, outbox) {
    const dates = new Set();
    (cache.setRows || []).forEach((row) => row.session_date && dates.add(row.session_date));
    (outbox || []).filter((item) => item.status !== 'rejected').forEach((item) => item.sessionDate && dates.add(item.sessionDate));
    (cache.progress || []).forEach((row) => {
      const date = row.session_date || row.data?.date;
      if (date) dates.add(date);
    });
    return dates;
  }

  // Día del programa que coincide con el día de la semana ("Lunes — Piernas", "Mié ...").
  function weekdayFromDayName(name) {
    const folded = foldText(name);
    const prefixes = [['domingo', 'dom'], ['lunes', 'lun'], ['martes', 'mar'], ['miercoles', 'mie'], ['jueves', 'jue'], ['viernes', 'vie'], ['sabado', 'sab']];
    return prefixes.findIndex(([full, short]) => folded.startsWith(full) || new RegExp(`^${short}\\b`).test(folded));
  }

  // ---------------------------------------------------------------------------
  // Pantalla antigua (programa completo). Ya no se muestra, pero se mantiene: la usan
  // las pruebas y otras baterías para revisar lo publicado.
  // ---------------------------------------------------------------------------

  function renderExercise(exercise) {
    const summary = [
      hasValue(exercise.sets) ? `${Number(exercise.sets)} ${Number(exercise.sets) === 1 ? 'serie' : 'series'}` : '',
      repsRange(exercise),
      hasValue(exercise.targetWeight) ? `${Number(exercise.targetWeight)} kg objetivo` : ''
    ].filter(Boolean).join(' · ');
    // Aproximaciones sin peso ni repeticiones no se muestran.
    const rows = [
      ...(exercise.approximations || []).filter(setHasData).map((set) => `<li><span class="sv-set-label">${escapeHtml(set.label || 'A')}</span> ${escapeHtml(setLine(set))}</li>`),
      ...(exercise.effectiveSets || []).map((set) => `<li class="sv-effective"><span class="sv-set-label">${escapeHtml(set.label || 'S')}</span> ${escapeHtml(setLine(set))}</li>`)
    ].join('');
    const note = noteForStudent(exercise.techniqueNotes);
    return `
      <li class="sv-exercise">
        <strong>${escapeHtml(exercise.name || 'Ejercicio')}</strong>
        ${summary ? `<div class="sv-meta">${escapeHtml(summary)}</div>` : ''}
        ${rows ? `<ul class="sv-sets">${rows}</ul>` : ''}
        ${note ? `<div class="sv-note">${escapeHtml(note)}</div>` : ''}
      </li>`;
  }

  function renderProgram(row) {
    const data = row.data || {};
    const days = Array.isArray(data.days) ? data.days : [];
    return `
      <section class="card sv-card" data-student-program>
        <p class="eyebrow">Tu programa</p>
        <h2>${escapeHtml(row.title || data.programName || 'Programa')}</h2>
        <p class="sv-meta">Publicado ${escapeHtml(formatDate(row.published_at, true))}</p>
        ${days.map((day, index) => `
          <details class="sv-day"${index === 0 ? ' open' : ''}>
            <summary>${escapeHtml(day.name || `Día ${index + 1}`)} <span class="sv-meta">${plural((day.exercises || []).length, 'ejercicio', 'ejercicios')}</span></summary>
            <ul class="sv-exercises">${(day.exercises || []).map((exercise) => renderExercise(exercise)).join('')}</ul>
          </details>`).join('') || '<p class="sv-meta">Este programa aún no tiene días.</p>'}
      </section>`;
  }

  // Sesiones que publicó el entrenador (con sus comentarios), plegado al pie de "Hoy".
  function renderHistory(progress) {
    if (!progress.length) {
      return '<details class="sv-history" data-student-history><summary>Tu historial</summary><p class="sv-meta">Aún no hay sesiones registradas.</p></details>';
    }
    return `
      <details class="sv-history" data-student-history>
        <summary>Tu historial <span class="sv-meta">${plural(progress.length, 'sesión', 'sesiones')}</span></summary>
        ${progress.map((row) => {
          const data = row.data || {};
          return `
            <details class="sv-day">
              <summary>${escapeHtml(formatDate(row.session_date || data.date) || 'Sesión')} <span class="sv-meta">${escapeHtml(data.dayName || row.title || '')}</span></summary>
              <ul class="sv-exercises">${(data.exercises || []).map((exercise) => `
                <li class="sv-history-exercise">
                  <strong>${escapeHtml(exercise.name || 'Ejercicio')}</strong>
                  <ul class="sv-sets">${(exercise.sets || []).filter(setHasData).map((set) => `<li${set.type === 'S' ? ' class="sv-effective"' : ''}><span class="sv-set-label">${escapeHtml(`${set.type || 'S'}${set.setNumber || ''}`)}</span> ${escapeHtml(studentSetLine(set))}</li>`).join('')}</ul>
                  ${exercise.comment ? `<div class="sv-note" data-sv-comment>💬 ${escapeHtml(exercise.comment)}</div>` : ''}
                </li>`).join('')}</ul>
            </details>`;
        }).join('')}
      </details>`;
  }

  // ---------------------------------------------------------------------------
  // Estado de cada serie (lo mismo que antes)
  // ---------------------------------------------------------------------------

  const STATUS_TEXT = {
    saved: '✓ Guardada',
    pending: '⏳ Pendiente de subir',
    rejected: '✕ Rechazada',
    coach: '✓ Corregida por tu entrenador'
  };
  const DONE = new Set(['saved', 'pending', 'coach']);

  function rowKey(ctx, dayId, exerciseId, setType, setNumber) {
    return selfLog.setKey({ assignmentId: ctx.assignmentId, sessionDate: ctx.date, dayId, exerciseId, setType, setNumber });
  }

  function serverRowKey(row) {
    return selfLog.setKey({
      assignmentId: row.assignment_id, sessionDate: row.session_date, dayId: row.day_id,
      exerciseId: row.exercise_id, setType: row.set_type, setNumber: Number(row.set_number)
    });
  }

  // Qué mostrar en una serie: lo que corrigió el entrenador gana; si no, lo del teléfono;
  // si no, lo que ya está en la base.
  function setState(ctx, key) {
    if (!ctx.canLog) {
      return { status: '', weight: null, reps: null, rir: null };
    }
    const server = ctx.serverByKey.get(key);
    if (server && server.auth_user_id && server.auth_user_id !== ctx.userId) {
      return { status: 'coach', weight: server.weight, reps: server.reps, rir: server.rir };
    }
    const local = ctx.localByKey.get(key);
    if (local) {
      return { status: local.status, weight: local.weight, reps: local.reps, rir: local.rir, error: local.error };
    }
    if (server) {
      return { status: 'saved', weight: server.weight, reps: server.reps, rir: server.rir };
    }
    return { status: '', weight: null, reps: null, rir: null };
  }

  // Series efectivas hechas de un ejercicio en la fecha elegida (guardadas, pendientes o corregidas).
  function exerciseProgress(ctx, dayId, exercise) {
    const planned = selfLog.plannedEffectiveSets(exercise);
    const states = Array.from({ length: planned }, (_, index) => setState(ctx, rowKey(ctx, dayId, exercise.id, 'S', index + 1)));
    return { planned, done: states.filter((state) => DONE.has(state.status)).length, states };
  }

  function loggable(exercise) {
    return selfLog.plannedEffectiveSets(exercise) > 0;
  }

  function dayComplete(ctx, day) {
    const exercises = (day?.exercises || []).filter(loggable);
    return ctx.canLog && exercises.length > 0 && exercises.every((exercise) => {
      const progress = exerciseProgress(ctx, day.id, exercise);
      return progress.done === progress.planned;
    });
  }

  // Historial de un ejercicio: por fecha, sus series efectivas. Lo registrado por el alumno
  // (base y teléfono) manda; las sesiones publicadas por el entrenador se usan por nombre
  // para las fechas sin registro propio.
  function exerciseHistory(ctx, exercise) {
    const byDate = new Map();
    const put = (date, setNumber, weight, reps, rir) => {
      if (!date) return;
      if (!byDate.has(date)) byDate.set(date, new Map());
      byDate.get(date).set(setNumber, { setNumber, weight, reps, rir });
    };
    ctx.setRows.filter((row) => row.exercise_id === exercise.id && row.set_type === 'S')
      .forEach((row) => put(row.session_date, Number(row.set_number), row.weight, row.reps, row.rir));
    ctx.outbox.filter((item) => item.exerciseId === exercise.id && item.setType === 'S' && item.status !== 'rejected')
      .forEach((item) => put(item.sessionDate, item.setNumber, item.weight, item.reps, item.rir));
    const name = foldText(exercise.name);
    (ctx.progress || []).forEach((row) => {
      const date = row.session_date || row.data?.date;
      if (!date || byDate.has(date) || !name) return;
      (row.data?.exercises || []).filter((item) => foldText(item.name) === name).forEach((item) => {
        (item.sets || []).filter((set) => (set.type || set.setType || 'S') === 'S').forEach((set, index) => {
          put(date, Number(set.setNumber) || index + 1, set.weight, set.reps, set.rir);
        });
      });
    });
    return [...byDate.keys()].sort().map((date) => ({ date, sets: [...byDate.get(date).values()].sort((a, b) => a.setNumber - b.setNumber) }));
  }

  function maxWeight(sets) {
    return sets.reduce((max, set) => (hasValue(set.weight) ? Math.max(max, Number(set.weight)) : max), 0);
  }

  // Récord anterior (máximo de las fechas antes de `date`) y la última vez antes de `date`.
  function exerciseReference(ctx, exercise, date) {
    const before = exerciseHistory(ctx, exercise).filter((entry) => entry.date < date && entry.sets.some(setHasData));
    return {
      record: before.reduce((max, entry) => Math.max(max, maxWeight(entry.sets)), 0),
      last: before.length ? before[before.length - 1] : null
    };
  }

  // Récords nuevos: fechas en que el máximo de un ejercicio superó a todo lo anterior.
  function findRecords(ctx, exercises, dates) {
    const records = [];
    const seen = new Set();
    exercises.forEach((exercise) => {
      if (!exercise?.id || seen.has(exercise.id)) return;
      seen.add(exercise.id);
      let best = 0;
      exerciseHistory(ctx, exercise).forEach((entry) => {
        const top = maxWeight(entry.sets);
        if (best > 0 && top > best && dates.has(entry.date)) {
          records.push({ date: entry.date, name: exercise.name || 'Ejercicio', weight: top });
        }
        best = Math.max(best, top);
      });
    });
    return records.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)));
  }

  // Valores que aparecen en una serie sin registrar: la última vez, si no lo planificado
  // por el entrenador para esa serie, si no el objetivo.
  function prefillValues(exercise, setType, setNumber, last) {
    if (setType === 'A') {
      const planned = (exercise.approximations || [])[setNumber - 1];
      return planned && setHasData(planned) ? { weight: hasValue(planned.weight) ? planned.weight : null, reps: hasValue(planned.reps) ? planned.reps : null } : { weight: null, reps: null };
    }
    const previous = last?.sets.find((set) => set.setNumber === setNumber);
    if (previous && setHasData(previous)) {
      return { weight: hasValue(previous.weight) ? previous.weight : null, reps: hasValue(previous.reps) ? previous.reps : null };
    }
    const planned = (exercise.effectiveSets || [])[setNumber - 1];
    if (planned && setHasData(planned)) {
      return { weight: hasValue(planned.weight) ? planned.weight : null, reps: hasValue(planned.reps) ? planned.reps : null };
    }
    return { weight: hasValue(exercise.targetWeight) ? exercise.targetWeight : null, reps: hasValue(exercise.repMin) ? exercise.repMin : null };
  }

  // ---------------------------------------------------------------------------
  // Estado de la vista (solo en memoria)
  // ---------------------------------------------------------------------------

  // Una sola vista de alumno abierta a la vez (la del usuario conectado).
  const logState = {
    container: null, cache: null, userId: '', date: '', timer: null, flushing: false, listening: false, offline: false,
    screen: 'today', assignmentId: '', dayId: '', exerciseId: '', feelKey: ''
  };

  function buildContext(cache) {
    const userId = cache.userId;
    const canLog = Boolean(cache.canSelfLog && selfLog);
    const dates = canLog ? selfLog.allowedDates(new Date()) : [localToday()];
    if (!dates.includes(logState.date) || logState.userId !== userId) {
      logState.date = dates[0];
    }
    logState.userId = userId;
    const outbox = canLog ? selfLog.readOutbox(localStorage, userId) : [];
    return {
      userId,
      canLog,
      date: logState.date,
      dates,
      setRows: cache.setRows || [],
      progress: cache.progress || [],
      outbox,
      serverByKey: new Map((cache.setRows || []).map((row) => [serverRowKey(row), row])),
      localByKey: new Map(outbox.map((item) => [item.key, item]))
    };
  }

  // Programa, día y ejercicio elegidos (con valores por defecto si no hay o ya no existen).
  function resolveSelection(ctx, programs) {
    const program = programs.find((row) => row.assignment_id === logState.assignmentId) || programs[0];
    if (logState.assignmentId !== program.assignment_id) {
      logState.assignmentId = program.assignment_id || '';
      logState.dayId = '';
    }
    ctx.assignmentId = program.assignment_id;
    const days = Array.isArray(program.data?.days) ? program.data.days : [];
    let day = days.find((item) => item.id === logState.dayId);
    if (!day) {
      // 1) el día con series en la fecha elegida; 2) el del día de la semana; 3) el primero.
      const withSets = ctx.canLog ? days.find((item) => (item.exercises || []).some((exercise) => exerciseProgress(ctx, item.id, exercise).done > 0)) : null;
      const weekday = new Date(`${ctx.date}T12:00:00`).getDay();
      day = withSets || days.find((item) => (item.exercises || []).length && weekdayFromDayName(item.name) === weekday)
        || days.find((item) => (item.exercises || []).length) || days[0] || null;
      logState.dayId = day?.id || '';
    }
    const exercises = day?.exercises || [];
    const exerciseIndex = Math.max(exercises.findIndex((item) => item.id === logState.exerciseId), 0);
    return { program, days, day, exercises, exerciseIndex, exercise: exercises[exerciseIndex] || null };
  }

  // ---------------------------------------------------------------------------
  // Pantalla "Hoy"
  // ---------------------------------------------------------------------------

  function renderWeek(ctx, cache) {
    const today = localToday();
    const active = activityDates(cache, ctx.outbox);
    const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const names = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    return `
      <ol class="sv-week" aria-label="Esta semana" data-sv-week>
        ${weekDates(today).map((date, index) => {
          const done = active.has(date);
          const isToday = date === today;
          return `<li class="sv-week-day${done ? ' is-done' : ''}${isToday ? ' is-today' : ''}" data-date="${date}" aria-label="${names[index]}${done ? ', entrenaste' : ''}${isToday ? ', hoy' : ''}">
            <span class="sv-week-letter">${letters[index]}</span>
            <span class="sv-week-dot" aria-hidden="true">${done ? '✓' : ''}</span>
          </li>`;
        }).join('')}
      </ol>`;
  }

  function renderDatePicker(ctx) {
    const today = ctx.dates[0];
    const label = (date) => (date === today ? `Hoy (${formatDate(date)})` : formatDate(date));
    return `
      <label class="sv-log-date">Registrando
        <select data-sv-log-date>${ctx.dates.map((date) => `<option value="${date}"${date === ctx.date ? ' selected' : ''}>${escapeHtml(label(date))}</option>`).join('')}</select>
      </label>`;
  }

  function renderToday(ctx, cache, selection, programs) {
    const { program, days, day, exercises } = selection;
    const programChips = programs.length > 1 ? `
      <div class="sv-chips" role="group" aria-label="Programa">
        ${programs.map((row) => `<button type="button" class="sv-chip${row.assignment_id === program.assignment_id ? ' is-active' : ''}" data-sv-program="${escapeHtml(row.assignment_id || '')}" aria-pressed="${row.assignment_id === program.assignment_id}">${escapeHtml(row.title || row.data?.programName || 'Programa')}</button>`).join('')}
      </div>` : '';
    const dayButtons = days.length ? `
      <div class="sv-chips sv-days" role="group" aria-label="Día del programa">
        ${days.map((item, index) => `<button type="button" class="sv-chip${item.id === day?.id ? ' is-active' : ''}" data-sv-day="${escapeHtml(item.id || '')}" aria-pressed="${item.id === day?.id}">${escapeHtml(item.name || `Día ${index + 1}`)}</button>`).join('')}
      </div>` : '<p class="sv-meta">Este programa aún no tiene días.</p>';
    const cards = exercises.map((exercise) => {
      const can = ctx.canLog && loggable(exercise);
      const progress = can ? exerciseProgress(ctx, day.id, exercise) : null;
      const complete = progress && progress.done === progress.planned;
      return `
        <li class="sv-exercise${complete ? ' is-complete' : ''}">
          <button type="button" class="sv-ex-card" data-sv-open="${escapeHtml(exercise.id || '')}">
            <span class="sv-ex-card-text">
              <strong>${escapeHtml(exercise.name || 'Ejercicio')}</strong>
              <span class="sv-meta">${escapeHtml(exerciseScheme(exercise))}</span>
            </span>
            ${progress ? `<span class="sv-ex-progress${complete ? ' is-complete' : ''}" data-sv-progress>${complete ? '<span class="sv-check" aria-label="Completo">✓</span>' : `${progress.done}/${progress.planned}`}</span>` : ''}
          </button>
        </li>`;
    }).join('');
    let next = '';
    if (exercises.length) {
      if (!ctx.canLog) {
        next = `<button type="button" class="sv-next" data-sv-open="${escapeHtml(exercises[0].id || '')}">Ver: ${escapeHtml(exercises[0].name || 'Ejercicio')}</button>`;
      } else if (dayComplete(ctx, day)) {
        next = '<button type="button" class="sv-next" data-sv-summary>Ver resumen ✓</button>';
      } else {
        const pending = exercises.find((exercise) => loggable(exercise) && exerciseProgress(ctx, day.id, exercise).done < selfLog.plannedEffectiveSets(exercise));
        next = pending ? `<button type="button" class="sv-next" data-sv-open="${escapeHtml(pending.id || '')}" data-sv-next>Seguir: ${escapeHtml(pending.name || 'Ejercicio')}</button>` : '';
      }
    }
    return `
      <section class="sv-screen sv-today" data-student-program data-sv-screen="today" data-assignment-id="${escapeHtml(program.assignment_id || '')}">
        ${renderWeek(ctx, cache)}
        <p class="sv-program-title"><span class="sv-meta">Tu programa</span> ${escapeHtml(program.title || program.data?.programName || 'Programa')}</p>
        ${programChips}
        ${ctx.canLog ? renderDatePicker(ctx) : ''}
        ${dayButtons}
        ${exercises.length ? `<ul class="sv-exercises sv-ex-list">${cards}</ul>` : (day ? '<p class="sv-meta">Este día aún no tiene ejercicios.</p>' : '')}
        ${next}
        ${renderHistory(cache.progress || [])}
      </section>`;
  }

  // ---------------------------------------------------------------------------
  // Pantalla de un ejercicio
  // ---------------------------------------------------------------------------

  function renderLogRow(ctx, dayId, exercise, setType, setNumber, last, isLastEffective) {
    const key = rowKey(ctx, dayId, exercise.id, setType, setNumber);
    const state = setState(ctx, key);
    const locked = state.status === 'coach';
    const stored = Boolean(state.status);
    const values = stored ? { weight: state.weight, reps: state.reps } : prefillValues(exercise, setType, setNumber, last);
    const done = DONE.has(state.status);
    const label = `${setType === 'A' ? 'Aproximación' : 'Serie'} ${setNumber}`;
    const stepper = (field, unit, step, value, mode) => `
      <div class="sv-stepper" data-stepper="${field}">
        ${locked ? '' : `<button type="button" class="sv-step-btn" data-sv-adjust="${field}" data-sv-delta="-${step}" aria-label="Menos ${unit}">−</button>`}
        <input type="text" inputmode="${mode}" autocomplete="off" data-field="${field}" aria-label="${label}: ${unit}" value="${escapeHtml(formatNumber(value))}"${locked ? ' disabled' : ''}>
        ${locked ? '' : `<button type="button" class="sv-step-btn" data-sv-adjust="${field}" data-sv-delta="${step}" aria-label="Más ${unit}">+</button>`}
      </div>`;
    const feel = isLastEffective && done ? feelFromRir(state.rir) : '';
    return `
      <div class="sv-log-row${done ? ' is-saved' : ''}${state.status === 'rejected' ? ' is-rejected' : ''}" data-set-type="${setType}" data-set-number="${setNumber}" data-key="${escapeHtml(key)}"${locked ? ' data-locked' : ''}${isLastEffective ? ' data-last-effective' : ''}
        data-saved-weight="${escapeHtml(stored ? formatNumber(state.weight) : '')}" data-saved-reps="${escapeHtml(stored ? formatNumber(state.reps) : '')}" data-saved-rir="${escapeHtml(state.rir ?? '')}" data-status="${state.status}">
        <span class="sv-set-label">${setType}${setNumber}</span>
        ${stepper('weight', 'kg', 2.5, values.weight, 'decimal')}
        ${stepper('reps', 'repeticiones', 1, values.reps, 'numeric')}
        <button type="button" class="sv-check-btn" data-sv-check aria-label="Guardar ${label.toLowerCase()}"${locked ? ' disabled' : ''}>✓</button>
        <div class="sv-row-foot">
          <span class="sv-log-status" data-status="${state.status}">${escapeHtml(STATUS_TEXT[state.status] || '')}</span>
          ${feel ? `<span class="sv-feel-tag" data-sv-feel-tag>Se sintió: ${feel}</span>` : ''}
          <span class="sv-record hidden" data-sv-record></span>
        </div>
        <p class="sv-log-row-error${state.status === 'rejected' && state.error ? '' : ' hidden'}" role="alert">${escapeHtml(state.status === 'rejected' ? state.error || '' : '')}</p>
      </div>`;
  }

  // Solo lectura: lo planificado por el entrenador, sin botones ni campos.
  function renderPlanRow(exercise, setType, setNumber) {
    const values = prefillValues(exercise, setType, setNumber, null);
    const planned = setType === 'S' ? (exercise.effectiveSets || [])[setNumber - 1] : null;
    const line = studentSetLine({ weight: values.weight, reps: values.reps, rir: planned?.rir });
    return `
      <div class="sv-plan-row">
        <span class="sv-set-label">${setType}${setNumber}</span>
        <span>${escapeHtml(line)}</span>
      </div>`;
  }

  function renderFeelPanel(rowKeyValue) {
    return `
      <div class="sv-feel" data-sv-feel-panel data-for-key="${escapeHtml(rowKeyValue)}" role="group" aria-label="¿Cómo se sintió?">
        <p class="sv-feel-question">¿Cómo se sintió?</p>
        <div class="sv-feel-options">
          ${FEEL_OPTIONS.map((option) => `<button type="button" class="sv-feel-btn" data-sv-feel="${option.rir}"><strong>${option.label}</strong><span>${option.hint}</span></button>`).join('')}
        </div>
      </div>`;
  }

  function renderExerciseScreen(ctx, selection) {
    const { program, day, exercises, exerciseIndex, exercise } = selection;
    if (!exercise) {
      logState.screen = 'today';
      return '';
    }
    const reference = exerciseReference(ctx, exercise, ctx.date);
    const note = noteForStudent(exercise.techniqueNotes);
    const effective = selfLog ? selfLog.plannedEffectiveSets(exercise) : (hasValue(exercise.sets) ? Math.floor(Number(exercise.sets)) : 0);
    const approximations = Array.isArray(exercise.approximations) ? exercise.approximations.length : 0;
    const lastText = reference.last
      ? reference.last.sets.filter(setHasData).map((set) => `${hasValue(set.weight) ? `${formatNumber(Number(set.weight))}` : '—'}×${hasValue(set.reps) ? Number(set.reps) : '—'}`).join(', ')
      : '';
    const refBox = `
      <div class="sv-ref" data-sv-ref>
        <div class="sv-ref-cell"><span class="sv-ref-label">Récord</span><strong data-sv-record-value>${reference.record ? `${formatNumber(reference.record)} kg` : '—'}</strong></div>
        <div class="sv-ref-cell"><span class="sv-ref-label">Última vez</span><strong>${reference.last ? escapeHtml(formatDate(reference.last.date)) : '—'}</strong>${lastText ? `<span class="sv-meta">${escapeHtml(lastText)}</span>` : ''}</div>
      </div>`;
    let body;
    if (!effective) {
      body = '<p class="sv-log-undefined" data-sv-log-undefined>Tu entrenador aún no definió las series de este ejercicio</p>';
    } else if (!ctx.canLog) {
      const approxRows = (exercise.approximations || []).map((set, index) => (setHasData(set) ? renderPlanRow(exercise, 'A', index + 1) : '')).join('');
      body = `
        <div class="sv-plan" data-sv-plan>
          <div class="sv-plan-head"><span>Serie</span><span>Plan</span></div>
          ${Array.from({ length: effective }, (_, index) => renderPlanRow(exercise, 'S', index + 1)).join('')}
          ${approxRows ? `<details class="sv-approx"><summary>Aproximaciones (opcional)</summary>${approxRows}</details>` : ''}
        </div>`;
    } else {
      const feelRow = logState.feelKey;
      const rows = Array.from({ length: effective }, (_, index) => {
        const html = renderLogRow(ctx, day.id, exercise, 'S', index + 1, reference.last, index + 1 === effective);
        const key = rowKey(ctx, day.id, exercise.id, 'S', index + 1);
        return html + (feelRow === key ? renderFeelPanel(key) : '');
      }).join('');
      const approxRows = Array.from({ length: approximations }, (_, index) => renderLogRow(ctx, day.id, exercise, 'A', index + 1, null, false)).join('');
      body = `
        <div class="sv-log" data-sv-log data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-prior-record="${reference.record || 0}">
          <div class="sv-log-head" aria-hidden="true"><span></span><span>kg</span><span>reps</span><span></span></div>
          ${rows}
          ${approxRows ? `<details class="sv-approx"><summary>Aproximaciones (opcional)</summary><div class="sv-approx-rows">${approxRows}</div></details>` : ''}
          <p class="sv-log-msg hidden" role="alert" data-sv-log-msg></p>
        </div>`;
    }
    const total = exercises.length;
    return `
      <section class="sv-screen sv-exercise-screen" data-student-program data-sv-screen="exercise" data-assignment-id="${escapeHtml(program.assignment_id || '')}">
        <div class="sv-ex-top">
          <button type="button" class="sv-ghost" data-sv-home>◀ Hoy</button>
          <span class="sv-meta">${escapeHtml(day.name || '')}${ctx.canLog && ctx.date !== ctx.dates[0] ? ` · ${escapeHtml(formatDate(ctx.date))}` : ''}</span>
        </div>
        <nav class="sv-ex-steps" aria-label="Ejercicios del día">
          <button type="button" class="sv-ghost" data-sv-step="-1"${exerciseIndex === 0 ? ' disabled' : ''}>◀ Anterior</button>
          <span class="sv-ex-count" data-sv-ex-count>${exerciseIndex + 1} de ${total}</span>
          <button type="button" class="sv-ghost" data-sv-step="1"${exerciseIndex >= total - 1 ? ' disabled' : ''}>Siguiente ▶</button>
        </nav>
        <h2 class="sv-ex-name">${escapeHtml(exercise.name || 'Ejercicio')}</h2>
        <p class="sv-meta sv-ex-scheme">${escapeHtml(exerciseScheme(exercise))}${hasValue(exercise.targetWeight) ? ` · objetivo ${escapeHtml(formatNumber(Number(exercise.targetWeight)))} kg` : ''}</p>
        ${note ? `<p class="sv-note">${escapeHtml(note)}</p>` : ''}
        ${refBox}
        ${body}
      </section>`;
  }

  // ---------------------------------------------------------------------------
  // Resumen del día
  // ---------------------------------------------------------------------------

  function daySummary(ctx, day) {
    let exercises = 0;
    let sets = 0;
    let kg = 0;
    (day?.exercises || []).filter(loggable).forEach((exercise) => {
      const done = exerciseProgress(ctx, day.id, exercise).states.filter((state) => DONE.has(state.status));
      if (done.length) exercises += 1;
      sets += done.length;
      done.forEach((state) => {
        kg += (hasValue(state.weight) ? Number(state.weight) : 0) * (hasValue(state.reps) ? Number(state.reps) : 0);
      });
    });
    return { exercises, sets, kg };
  }

  function renderSummary(ctx, selection) {
    const { program, day } = selection;
    const stats = daySummary(ctx, day);
    const allExercises = (program.data?.days || []).flatMap((item) => item.exercises || []);
    const week = new Set(weekDates(ctx.date));
    const records = findRecords(ctx, allExercises, week);
    const today = records.filter((record) => record.date === ctx.date);
    const rest = records.filter((record) => record.date !== ctx.date);
    const recordList = (items) => `<ul class="sv-records">${items.map((record) => `<li><span class="sv-check" aria-hidden="true">✓</span> ${escapeHtml(record.name)} <strong>${escapeHtml(formatNumber(record.weight))} kg</strong>${record.date !== ctx.date ? ` <span class="sv-meta">${escapeHtml(formatDate(record.date))}</span>` : ''}</li>`).join('')}</ul>`;
    return `
      <section class="sv-screen sv-summary" data-student-program data-sv-screen="summary" data-assignment-id="${escapeHtml(program.assignment_id || '')}">
        <p class="sv-summary-kicker">¡Hazaña cumplida!</p>
        <h2 class="sv-summary-title">${escapeHtml(day?.name || 'Día')} terminado</h2>
        <div class="sv-stats">
          <div class="sv-stat"><strong data-sv-stat="exercises">${stats.exercises}</strong><span>${stats.exercises === 1 ? 'ejercicio' : 'ejercicios'}</span></div>
          <div class="sv-stat"><strong data-sv-stat="sets">${stats.sets}</strong><span>series</span></div>
          <div class="sv-stat"><strong data-sv-stat="kg">${formatKg(stats.kg)}</strong><span>kg movidos</span></div>
        </div>
        <div class="sv-summary-records" data-sv-records>
          <h3>Récords nuevos del día</h3>
          ${today.length ? recordList(today) : '<p class="sv-meta">Hoy no hubo récords nuevos. ¡La próxima!</p>'}
          ${rest.length ? `<h3>Récords de la semana</h3>${recordList(rest)}` : ''}
        </div>
        <button type="button" class="sv-next" data-sv-share>Compartir</button>
        <p class="sv-share-msg hidden" role="status" data-sv-share-msg></p>
        <button type="button" class="sv-ghost sv-wide" data-sv-home>Volver a hoy</button>
        <p class="sv-signature">by Vikingos Radical</p>
      </section>`;
  }

  function shareText(ctx, selection) {
    const stats = daySummary(ctx, selection.day);
    const records = findRecords(ctx, (selection.program.data?.days || []).flatMap((item) => item.exercises || []), new Set([ctx.date]));
    return [
      `¡Hazaña cumplida! ${selection.day?.name || 'Día'} terminado.`,
      `${plural(stats.exercises, 'ejercicio', 'ejercicios')} · ${plural(stats.sets, 'serie', 'series')} · ${formatKg(stats.kg)} kg movidos.`,
      records.length ? `Récords: ${records.map((record) => `${record.name} ${formatNumber(record.weight)} kg`).join(', ')}.` : '',
      'by Vikingos Radical'
    ].filter(Boolean).join('\n');
  }

  async function shareSummary(button) {
    const message = logState.container?.querySelector('[data-sv-share-msg]');
    const show = (text) => {
      if (!message) return;
      message.textContent = text;
      message.classList.toggle('hidden', !text);
    };
    const cache = logState.cache;
    const ctx = buildContext(cache);
    const text = shareText(ctx, resolveSelection(ctx, cache.programs || []));
    if (navigator.share) {
      try {
        await navigator.share({ text });
        show('');
      } catch (error) {
        // El alumno cerró el menú de compartir: no es un error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      show('Texto copiado: pégalo donde quieras compartirlo.');
    } catch (error) {
      show(text);
    }
    button.blur();
  }

  // ---------------------------------------------------------------------------
  // Armado de la vista
  // ---------------------------------------------------------------------------

  function shell(container, { name, userId, onSignOut }) {
    container.innerHTML = `
      <div class="student-view">
        <header class="sv-header">
          <div class="brand">
            <div class="brand-mark">
              <img class="brand-logo" src="./assets/images/logo-vikingos.png" alt="Vikingos Radical" onerror="this.style.display='none'; this.parentElement.classList.add('brand-mark--fallback');">
              <span class="brand-fallback">VR</span>
            </div>
            <span class="sv-title">VALHALLA</span>
          </div>
          <button class="sv-ghost" type="button" data-auth-logout>Cerrar sesión</button>
        </header>
        <div class="sv-hello">
          <h1 class="sv-hello-name">${name ? `Hola, ${escapeHtml(name)}` : 'Hola'}</h1>
          <span class="sv-streak hidden" data-sv-streak></span>
        </div>
        <div data-sv-logout-confirm class="hidden"></div>
        <div data-student-banner></div>
        <main data-student-content><p class="sv-meta sv-loading">Cargando tu programa…</p></main>
      </div>`;
    container.querySelector('[data-auth-logout]').addEventListener('click', () => confirmSignOut(container, userId, onSignOut));
  }

  // Antes de cerrar sesión: si hay series de esta cuenta sin subir, se avisa.
  function confirmSignOut(container, userId, onSignOut) {
    const pending = selfLog && userId
      ? selfLog.readOutbox(localStorage, userId).filter((item) => item.status === 'pending').length
      : 0;
    const panel = container.querySelector('[data-sv-logout-confirm]');
    if (!pending || !panel) {
      onSignOut();
      return;
    }
    panel.className = 'sv-card sv-logout-confirm';
    panel.setAttribute('role', 'alertdialog');
    panel.innerHTML = `
      <p data-sv-logout-text>Tienes ${plural(pending, 'serie', 'series')} sin subir. Se subirán cuando vuelvas a entrar con conexión en este teléfono.</p>
      <div class="inline-actions">
        <button class="sv-ghost" type="button" data-sv-logout-anyway>Cerrar sesión igual</button>
        <button class="sv-primary" type="button" data-sv-logout-stay>Quedarme</button>
      </div>`;
    panel.querySelector('[data-sv-logout-anyway]').addEventListener('click', onSignOut);
    panel.querySelector('[data-sv-logout-stay]').addEventListener('click', () => {
      panel.className = 'hidden';
      panel.innerHTML = '';
    });
    panel.querySelector('[data-sv-logout-stay]').focus();
  }

  function renderStreak(container, cache, ctx) {
    const pill = container.querySelector('[data-sv-streak]');
    if (!pill) return;
    if (!cache?.linked) {
      pill.classList.add('hidden');
      return;
    }
    const weeks = weekStreak(activityDates(cache, ctx.outbox), localToday());
    pill.textContent = weeks ? `${plural(weeks, 'semana seguida', 'semanas seguidas')}` : 'Empieza tu racha';
    pill.setAttribute('data-weeks', String(weeks));
    pill.classList.remove('hidden');
  }

  function showContent(container, cache, { offline }) {
    const content = container.querySelector('[data-student-content]');
    const banner = container.querySelector('[data-student-banner]');
    banner.innerHTML = offline
      ? `<p class="notice auth-offline-banner" role="status">Sin conexión: estás viendo lo último que se cargó${cache?.fetchedAt ? ` (${escapeHtml(formatDate(cache.fetchedAt, true))})` : ''}.</p>`
      : '';
    if (!cache) {
      content.innerHTML = '<section class="sv-card"><p>No hay conexión y este teléfono aún no tiene tu programa guardado. Conéctate a internet para verlo.</p></section>';
      return;
    }
    if (!cache.linked) {
      content.innerHTML = '<section class="sv-card" data-student-unlinked><h2>Tu cuenta aún no está vinculada</h2><p>Avísale a tu entrenador para que la vincule con tu ficha.</p></section>';
      return;
    }
    const programs = cache.programs || [];
    const ctx = buildContext(cache);
    attachView(container, cache);
    renderStreak(container, cache, ctx);
    if (!programs.length) {
      content.innerHTML = `<section class="sv-card" data-student-empty><h2>Aún no tienes un programa publicado</h2><p>Tu entrenador te avisará cuando lo publique.</p></section>${renderHistory(cache.progress || [])}`;
      return;
    }
    const selection = resolveSelection(ctx, programs);
    if (logState.screen === 'summary' && !dayComplete(ctx, selection.day)) {
      logState.screen = 'today';
    }
    let html = '';
    if (logState.screen === 'exercise') {
      html = renderExerciseScreen(ctx, selection);
    } else if (logState.screen === 'summary') {
      html = renderSummary(ctx, selection);
    }
    content.innerHTML = html || renderToday(ctx, cache, selection, programs);
    // El día o programa elegido siempre a la vista en su fila (sin mover la página).
    content.querySelectorAll('.sv-chips').forEach((row) => {
      const active = row.querySelector('.is-active');
      if (active && active.offsetLeft + active.offsetWidth > row.clientWidth) {
        row.scrollLeft = active.offsetLeft - 12;
      }
    });
    if (ctx.canLog) {
      content.querySelectorAll('.sv-log-row[data-key]').forEach(updateRowUi);
      refreshStatuses();
    }
  }

  // ---------------------------------------------------------------------------
  // B3.2: guardado en el teléfono y subida a student_sets (mismo camino de siempre)
  // ---------------------------------------------------------------------------

  function rerenderLog({ scrollTop = false } = {}) {
    if (logState.container && logState.cache) {
      showContent(logState.container, logState.cache, { offline: logState.offline });
      if (scrollTop) {
        logState.container.querySelector('.student-view')?.scrollIntoView({ block: 'start' });
      }
    }
  }

  function findPublishedExercise(cache, assignmentId, dayId, exerciseId) {
    const program = (cache.programs || []).find((row) => row.assignment_id === assignmentId);
    const day = (program?.data?.days || []).find((item) => item.id === dayId);
    return (day?.exercises || []).find((item) => item.id === exerciseId) || null;
  }

  function showFormMessage(form, text, tone) {
    const message = form?.querySelector('[data-sv-log-msg]');
    if (!message) return;
    message.textContent = text;
    message.className = `sv-log-msg${tone === 'bad' ? ' sv-log-msg--bad' : ' sv-log-msg--ok'}`;
  }

  function rowValues(row) {
    return {
      weightText: row.querySelector('[data-field="weight"]')?.value || '',
      repsText: row.querySelector('[data-field="reps"]')?.value || ''
    };
  }

  // Botón ✓ verde solo si lo que se ve es lo guardado; ¡Récord! si el peso supera al anterior.
  function updateRowUi(row) {
    const { weightText, repsText } = rowValues(row);
    const status = row.getAttribute('data-status') || '';
    const same = (text, saved) => {
      const a = selfLog.parseDecimal(text);
      const b = selfLog.parseDecimal(saved);
      return (a ?? null) === (b ?? null);
    };
    const matches = same(weightText, row.getAttribute('data-saved-weight')) && same(repsText, row.getAttribute('data-saved-reps'));
    row.classList.toggle('is-saved', DONE.has(status) && matches);
    row.classList.toggle('is-edited', DONE.has(status) && !matches);
    const log = row.closest('[data-sv-log]');
    const prior = Number(log?.getAttribute('data-prior-record') || 0);
    const weight = selfLog.parseDecimal(weightText);
    const pill = row.querySelector('[data-sv-record]');
    if (pill) {
      const isRecord = row.getAttribute('data-set-type') === 'S' && prior > 0 && Number.isFinite(weight) && weight > prior;
      pill.textContent = isRecord ? `¡Récord! ${formatNumber(weight)} kg` : '';
      pill.classList.toggle('hidden', !isRecord);
    }
  }

  // − / +: kg de a 2,5 y reps de a 1 (nunca bajo 0). Solo cambia lo que se ve.
  function adjustValue(row, field, delta) {
    const input = row.querySelector(`[data-field="${field}"]`);
    if (!input || input.disabled) return;
    const current = selfLog.parseDecimal(input.value);
    const base = Number.isFinite(current) && current !== null ? current : 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    input.value = formatNumber(field === 'reps' ? Math.round(next) : next);
    updateRowUi(row);
  }

  function closeFeelPanel() {
    logState.feelKey = '';
    logState.container?.querySelectorAll('[data-sv-feel-panel]').forEach((panel) => panel.remove());
  }

  // ✓ de una serie. En la última serie efectiva primero se pregunta "¿Cómo se sintió?".
  function handleCheck(row) {
    if (row.hasAttribute('data-locked')) return;
    if (row.hasAttribute('data-last-effective')) {
      const key = row.getAttribute('data-key');
      if (logState.feelKey === key) {
        closeFeelPanel();
        return;
      }
      closeFeelPanel();
      logState.feelKey = key;
      row.insertAdjacentHTML('afterend', renderFeelPanel(key));
      row.nextElementSibling?.querySelector('[data-sv-feel]')?.focus();
      return;
    }
    closeFeelPanel();
    const savedRir = row.getAttribute('data-saved-rir');
    saveRow(row, row.getAttribute('data-set-type') === 'S' && savedRir !== '' ? Number(savedRir) : null);
  }

  function saveRow(row, rir) {
    const cache = logState.cache;
    const form = row.closest('[data-sv-log]');
    const program = row.closest('[data-student-program]');
    const assignmentId = program?.getAttribute('data-assignment-id') || '';
    const dayId = form.getAttribute('data-day-id');
    const exerciseId = form.getAttribute('data-exercise-id');
    const exercise = findPublishedExercise(cache, assignmentId, dayId, exerciseId);
    if (!exercise) {
      showFormMessage(form, 'Este ejercicio ya no está en tu rutina publicada.', 'bad');
      return;
    }
    // La fecha se revisa al guardar: la página pudo quedar abierta de un día para otro.
    if (!selfLog.isDateAllowed(logState.date, new Date())) {
      showFormMessage(form, 'La fecha debe ser de hoy o de hasta 3 días atrás (hora de Chile). Elige otra fecha en "Hoy".', 'bad');
      return;
    }
    const { weightText, repsText } = rowValues(row);
    const { errors, entries } = selfLog.validateExercise(exercise, [{
      setType: row.getAttribute('data-set-type'),
      setNumber: Number(row.getAttribute('data-set-number')),
      weightText,
      repsText,
      rirText: rir === null || rir === undefined ? '' : String(rir)
    }]);
    if (errors.length) {
      showFormMessage(form, errors.join(' · '), 'bad');
      return;
    }
    if (!entries.length) {
      showFormMessage(form, 'Escribe el peso o las repeticiones de esta serie.', 'bad');
      return;
    }
    const base = { ownerId: cache.ownerId, clientId: cache.clientId, assignmentId, sessionDate: logState.date, dayId, exerciseId };
    const ctxBefore = buildContext(cache);
    const day = (resolveSelection(ctxBefore, cache.programs || [])).day;
    const wasComplete = dayComplete(ctxBefore, day);
    // Solo se manda lo que cambió: una serie ya guardada con los mismos valores no se reenvía.
    const current = selfLog.readOutbox(localStorage, logState.userId);
    const localByKey = new Map(current.map((item) => [item.key, item]));
    const serverByKey = new Map((cache.setRows || []).map((item) => [serverRowKey(item), item]));
    const same = (a, b) => (a ?? null) === (b === null || b === undefined ? null : Number(b));
    const entry = entries[0];
    const key = selfLog.setKey({ ...base, setType: entry.setType, setNumber: entry.setNumber });
    const known = localByKey.get(key) || serverByKey.get(key);
    if (known && known.status !== 'rejected' && known.status !== 'pending'
      && same(entry.weight, known.weight) && same(entry.reps, known.reps) && same(entry.rir, known.rir)) {
      closeFeelPanel();
      showFormMessage(form, 'No hay cambios para guardar.', 'ok');
      return;
    }
    const outbox = selfLog.queueEntries(current, base, entries);
    if (!selfLog.writeOutbox(localStorage, logState.userId, outbox)) {
      showFormMessage(form, 'No se pudo guardar en el teléfono (sin espacio). No cierres esta pantalla y avísale a tu entrenador.', 'bad');
      return;
    }
    closeFeelPanel();
    // La fila queda como guardada con estos valores (verde).
    row.setAttribute('data-saved-weight', formatNumber(entry.weight));
    row.setAttribute('data-saved-reps', formatNumber(entry.reps));
    row.setAttribute('data-saved-rir', entry.rir ?? '');
    row.setAttribute('data-status', 'pending');
    const feelTag = row.querySelector('[data-sv-feel-tag]');
    if (row.hasAttribute('data-last-effective')) {
      const text = `Se sintió: ${feelFromRir(entry.rir)}`;
      if (feelTag) feelTag.textContent = text;
      else row.querySelector('.sv-row-foot')?.insertAdjacentHTML('beforeend', `<span class="sv-feel-tag" data-sv-feel-tag>${text}</span>`);
    }
    refreshStatuses();
    updateRowUi(row);
    showFormMessage(form, 'Guardado en el teléfono. Se sube solo cuando hay conexión.', 'ok');
    flushOutbox();
    // Al completar todo el día se muestra el resumen.
    const ctxAfter = buildContext(cache);
    if (!wasComplete && dayComplete(ctxAfter, resolveSelection(ctxAfter, cache.programs || []).day)) {
      logState.screen = 'summary';
      rerenderLog({ scrollTop: true });
    }
  }

  // Actualiza solo los estados (sin tocar lo que el alumno está escribiendo).
  function refreshStatuses() {
    const container = logState.container;
    if (!container || !logState.userId || !selfLog) return;
    const outbox = selfLog.readOutbox(localStorage, logState.userId);
    const byKey = new Map(outbox.map((item) => [item.key, item]));
    container.querySelectorAll('.sv-log-row[data-key]').forEach((row) => {
      if (row.hasAttribute('data-locked')) return;
      const item = byKey.get(row.getAttribute('data-key'));
      if (!item) return;
      row.setAttribute('data-status', item.status);
      row.classList.toggle('is-rejected', item.status === 'rejected');
      const status = row.querySelector('.sv-log-status');
      status.setAttribute('data-status', item.status);
      status.textContent = STATUS_TEXT[item.status] || '';
      const error = row.querySelector('.sv-log-row-error');
      error.textContent = item.status === 'rejected' ? item.error || '' : '';
      error.classList.toggle('hidden', !(item.status === 'rejected' && item.error));
      updateRowUi(row);
    });
    // El mensaje del ejercicio no puede quedar diciendo "guardado" si algo se rechazó.
    container.querySelectorAll('[data-sv-log]').forEach((form) => {
      if (form.querySelector('.sv-log-status[data-status="rejected"]')) {
        showFormMessage(form, 'Una o más series no se pudieron subir. Revisa el mensaje de cada una; lo que escribiste sigue aquí.', 'bad');
      }
    });
  }

  function isRetryable(result) {
    const status = Number(result?.status ?? 0);
    return Boolean(result?.error?.timedOut) || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
      || Boolean(authApi?.isUnavailableError?.(result?.error, result?.status));
  }

  // Sube lo pendiente de la cuenta conectada, de a una serie (un rechazo no frena al resto).
  async function flushOutbox() {
    const userId = logState.userId;
    if (logState.flushing || !userId || !authApi?.getClient || !selfLog) return;
    logState.flushing = true;
    try {
      const client = authApi.getClient();
      let outbox = selfLog.readOutbox(localStorage, userId);
      for (const item of outbox.filter((entry) => entry.status === 'pending')) {
        if (logState.userId !== userId) break; // Cambió la cuenta: no se sube nada ajeno.
        let result;
        try {
          result = await withTimeout(
            client.from('student_sets').upsert(selfLog.toRow(item), { onConflict: selfLog.CONFLICT_COLUMNS }),
            TIMED_OUT
          );
        } catch (error) {
          result = { error, status: 0 };
        }
        outbox = selfLog.readOutbox(localStorage, userId);
        const current = outbox.find((entry) => entry.key === item.key);
        if (!current || current.updatedAt !== item.updatedAt) continue; // Se volvió a editar mientras subía.
        if (!result.error) {
          outbox = selfLog.markItem(outbox, item.key, { status: 'saved', error: '', savedAt: new Date().toISOString() });
        } else if (isRetryable(result)) {
          break; // Sin conexión o la base no responde: queda pendiente y se reintenta solo.
        } else {
          outbox = selfLog.markItem(outbox, item.key, { status: 'rejected', error: selfLog.describeUploadError(result.error) });
        }
        selfLog.writeOutbox(localStorage, userId, outbox);
        refreshStatuses();
      }
    } finally {
      logState.flushing = false;
      scheduleRetry();
    }
  }

  function scheduleRetry() {
    clearTimeout(logState.timer);
    logState.timer = null;
    if (!logState.userId || !selfLog) return;
    if (selfLog.readOutbox(localStorage, logState.userId).some((item) => item.status === 'pending')) {
      logState.timer = setTimeout(flushOutbox, RETRY_MS);
    }
  }

  function handleClick(event) {
    const target = event.target;
    const pick = (selector) => target.closest(selector);
    let button;
    if ((button = pick('[data-sv-adjust]'))) {
      adjustValue(button.closest('.sv-log-row'), button.getAttribute('data-sv-adjust'), Number(button.getAttribute('data-sv-delta')));
    } else if ((button = pick('[data-sv-check]'))) {
      handleCheck(button.closest('.sv-log-row'));
    } else if ((button = pick('[data-sv-feel]'))) {
      const panel = button.closest('[data-sv-feel-panel]');
      const row = logState.container.querySelector(`.sv-log-row[data-key="${CSS.escape(panel.getAttribute('data-for-key'))}"]`);
      if (row) saveRow(row, Number(button.getAttribute('data-sv-feel')));
    } else if ((button = pick('[data-sv-open]'))) {
      logState.exerciseId = button.getAttribute('data-sv-open');
      logState.screen = 'exercise';
      logState.feelKey = '';
      rerenderLog({ scrollTop: true });
    } else if ((button = pick('[data-sv-step]'))) {
      const ctx = buildContext(logState.cache);
      const { exercises, exerciseIndex } = resolveSelection(ctx, logState.cache.programs || []);
      const next = exercises[exerciseIndex + Number(button.getAttribute('data-sv-step'))];
      if (next) {
        logState.exerciseId = next.id;
        logState.feelKey = '';
        rerenderLog({ scrollTop: true });
      }
    } else if ((button = pick('[data-sv-home]'))) {
      logState.screen = 'today';
      logState.feelKey = '';
      rerenderLog({ scrollTop: true });
    } else if ((button = pick('[data-sv-summary]'))) {
      logState.screen = 'summary';
      rerenderLog({ scrollTop: true });
    } else if ((button = pick('[data-sv-day]'))) {
      logState.dayId = button.getAttribute('data-sv-day');
      logState.exerciseId = '';
      rerenderLog();
    } else if ((button = pick('[data-sv-program]'))) {
      logState.assignmentId = button.getAttribute('data-sv-program');
      logState.dayId = '';
      logState.exerciseId = '';
      rerenderLog();
    } else if ((button = pick('[data-sv-share]'))) {
      shareSummary(button);
    }
  }

  function attachView(container, cache) {
    if (container.__svLogAttached !== true) {
      container.__svLogAttached = true;
      container.addEventListener('click', handleClick);
      container.addEventListener('input', (event) => {
        const row = event.target.closest('.sv-log-row');
        if (row && event.target.matches('[data-field]')) updateRowUi(row);
      });
      container.addEventListener('change', (event) => {
        if (event.target.matches('[data-sv-log-date]')) {
          logState.date = event.target.value;
          logState.dayId = '';
          rerenderLog();
        }
      });
    }
    if (!logState.listening) {
      logState.listening = true;
      window.addEventListener('online', () => flushOutbox());
    }
    logState.container = container;
    logState.cache = cache;
  }

  // Al cerrar sesión: se deja de subir y de mostrar. Lo pendiente queda guardado en el
  // teléfono bajo esa cuenta y se sube cuando vuelva a entrar la misma persona.
  function stopLog() {
    clearTimeout(logState.timer);
    Object.assign(logState, {
      container: null, cache: null, userId: '', date: '', timer: null,
      screen: 'today', assignmentId: '', dayId: '', exerciseId: '', feelKey: ''
    });
  }

  // Abre la vista. `offline`: Supabase no responde; se muestra lo último cargado.
  async function render(container, { user, profile, offline = false, onSignOut }) {
    stopLog();
    logState.offline = offline;
    shell(container, { name: profile?.full_name || '', userId: user.id, onSignOut });
    const cached = readCache(user.id);
    if (offline) {
      logState.offline = true;
      showContent(container, cached, { offline: true });
      if (cached?.canSelfLog) scheduleRetry();
      return;
    }
    const result = await fetchData(user.id);
    if (result.error) {
      if (result.unavailable) {
        logState.offline = true;
        showContent(container, cached, { offline: true });
        if (cached?.canSelfLog) scheduleRetry();
      } else {
        container.querySelector('[data-student-content]').innerHTML = '<section class="sv-card"><p>No se pudo cargar tu programa. Intenta de nuevo más tarde.</p></section>';
      }
      return;
    }
    if (!result.linked) {
      clearCache();
      showContent(container, { linked: false }, { offline: false });
      return;
    }
    const cache = {
      userId: user.id, linked: true, ownerId: result.ownerId, clientId: result.clientId, canSelfLog: result.canSelfLog,
      programs: result.programs, progress: result.progress, setRows: result.setRows, fetchedAt: new Date().toISOString()
    };
    writeCache(cache);
    showContent(container, cache, { offline: false });
    if (cache.canSelfLog) {
      flushOutbox();
    }
  }

  window.VALHALLA.studentView = {
    render,
    clearCache,
    format: {
      setLine, studentSetLine, setHasData, repsRange, exerciseScheme, noteForStudent, renderProgram,
      feelFromRir, FEEL_OPTIONS, weekStart, weekDates, weekStreak, localToday, addDays, renderExerciseScreen
    }
  };
})();
