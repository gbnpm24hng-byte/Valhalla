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
  // v0.9.49: qué hacer con una cuenta sin vínculo ("Tengo un código"); lo pasa auth-gate.js.
  let inviteOpts = { onHaveCode: null, inviteCode: '' };
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
    if (hasValue(set.seconds)) parts.push(`${Number(set.seconds)} s`);
    if (hasValue(set.weight)) parts.push(`${Number(set.weight)} kg`);
    if (hasValue(set.reps)) parts.push(`${Number(set.reps)} reps`);
    let line = parts.join(' × ') || 'por definir';
    if (set.rir !== null && set.rir !== undefined && set.rir !== '') line += ` · RIR ${Number(set.rir)}`;
    return line;
  }

  // Lo mismo para las pantallas del alumno: sin la palabra RIR (se muestra cómo se sintió).
  // v0.9.44: una serie por tiempo se ve en segundos ("40 s"), nunca con kilos.
  function studentSetLine(set) {
    const parts = [];
    if (hasValue(set.seconds)) {
      parts.push(`${Number(set.seconds)} s`);
    } else {
      if (hasValue(set.weight)) parts.push(`${formatNumber(Number(set.weight))} kg`);
      if (hasValue(set.reps)) parts.push(`${Number(set.reps)} reps`);
    }
    const feel = feelFromRir(set.rir);
    return `${parts.join(' × ') || 'por definir'}${feel ? ` · ${feel}` : ''}`;
  }

  function setHasData(set) {
    return hasValue(set?.weight) || hasValue(set?.reps) || hasValue(set?.seconds);
  }

  // v0.9.44 · Bloques: ejercicio por tiempo (measure: 'time'). En student_sets los segundos van
  // en la columna reps; en esta pantalla, la casilla "reps" de un ejercicio por tiempo son segundos.
  function isTimed(exercise) {
    return exercise?.measure === 'time';
  }

  // v0.9.45 · Circuito publicado: una entrada de day.exercises con circuit (formato y estaciones).
  // No tiene series ni récords; el alumno anota un resultado (S1 y S2 en student_sets, ver
  // circuits-core.js).
  function circuitsApi() {
    return window.VALHALLA.circuitsCore || null;
  }

  function isCircuit(exercise) {
    return Boolean(exercise?.circuit) && typeof exercise.circuit === 'object' && Boolean(circuitsApi());
  }

  // El circuito publicado con su id (el de la entrada del día).
  function circuitOf(exercise) {
    return { ...exercise.circuit, id: exercise.id, type: 'circuit' };
  }

  // Superserie publicada: day.blocks y blockId en cada ejercicio (seguidos). Letra por orden de
  // aparición en el día (A, B…) y posición dentro del bloque (A1, A2…).
  function dayBlockMap(day) {
    const blocks = new Map((Array.isArray(day?.blocks) ? day.blocks : []).filter((block) => block && block.id && block.type === 'superset').map((block) => [block.id, block]));
    const letters = new Map();
    (day?.exercises || []).forEach((exercise) => {
      if (exercise?.blockId && blocks.has(exercise.blockId) && !letters.has(exercise.blockId)) {
        letters.set(exercise.blockId, String.fromCharCode(65 + letters.size));
      }
    });
    return { blocks, letters };
  }

  // { label: 'A1', rounds, next: 'A2' | '' } o null si el ejercicio no está en una superserie.
  function memberInfo(day, exercise) {
    const { blocks, letters } = dayBlockMap(day);
    const block = exercise?.blockId ? blocks.get(exercise.blockId) : null;
    if (!block) return null;
    const members = (day.exercises || []).filter((item) => item.blockId === block.id);
    const position = members.findIndex((item) => item.id === exercise.id) + 1;
    const letter = letters.get(block.id);
    return {
      label: `${letter}${position}`,
      rounds: Number(block.rounds) || Number(exercise.sets) || 0,
      next: position < members.length ? `${letter}${position + 1}` : ''
    };
  }

  // Tramos del día: [{ exercise }] suelto o [{ block, letter, items: [exercise…] }].
  function daySegments(day, exercises) {
    const { blocks, letters } = dayBlockMap(day);
    const out = [];
    (exercises || []).forEach((exercise) => {
      if (isCircuit(exercise)) {
        out.push({ circuit: exercise });
        return;
      }
      const block = exercise?.blockId ? blocks.get(exercise.blockId) : null;
      const last = out[out.length - 1];
      if (block && last?.block && last.block.id === block.id) {
        last.items.push(exercise);
      } else if (block) {
        out.push({ block, letter: letters.get(block.id), items: [exercise] });
      } else {
        out.push({ exercise });
      }
    });
    return out;
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
    if (isTimed(exercise)) return `${sets} × ${hasValue(exercise.durationSeconds) ? `${Number(exercise.durationSeconds)} s` : 'tiempo por definir'}`;
    if (!hasValue(exercise.repMin)) return `${sets} × reps por definir`;
    const reps = hasValue(exercise.repMax) && Number(exercise.repMax) !== Number(exercise.repMin)
      ? `${Number(exercise.repMin)}-${Number(exercise.repMax)}`
      : `${Number(exercise.repMin)}`;
    return `${sets} × ${reps}`;
  }

  // v0.9.41: esfuerzo objetivo que puso el entrenador (RIR de las series efectivas), dicho como
  // el alumno lo registra: "Fácil", "Bien", "Difícil". Si las series piden distinto, "Bien y Fácil".
  function plannedFeel(exercise) {
    const words = [];
    (Array.isArray(exercise?.effectiveSets) ? exercise.effectiveSets : []).forEach((set) => {
      const feel = feelFromRir(set?.rir);
      if (feel && !words.includes(feel)) words.push(feel);
    });
    return words.join(' y ');
  }

  // Nota para el alumno: sin frases internas (también en lo que se publicó antes del filtro).
  function noteForStudent(value) {
    return window.VALHALLA.publishCore?.studentNote ? window.VALHALLA.publishCore.studentNote(value) : String(value || '');
  }

  // Enlace de video para el alumno: se revisa también aquí, porque viene de lo publicado.
  function videoFor(exercise) {
    return window.VALHALLA.publishCore?.safeVideoUrl ? window.VALHALLA.publishCore.safeVideoUrl(exercise?.videoUrl) : '';
  }

  // v0.9.37: figura con los músculos (muscle-map-core.js). Sin el módulo o sin zonas, nada.
  function muscleMap() {
    return window.VALHALLA.muscleMap || null;
  }

  function exerciseZones(exercise) {
    const map = muscleMap();
    return map ? map.zonesForExercise(exercise) : { main: [], sec: [] };
  }

  // Tarjeta "HOY TRABAJAS …" con la suma de los músculos del día.
  function renderDayMuscles(exercises) {
    const map = muscleMap();
    if (!map) {
      return '';
    }
    const zones = map.dayZones(exercises);
    if (!map.hasZones(zones)) {
      return '';
    }
    const names = map.joinLabels(zones.top);
    return `
      <div class="sv-muscles-card" data-sv-muscles-day>
        <div class="sv-muscles-text">
          <span class="sv-muscles-eyebrow">Hoy trabajas</span>
          ${names ? `<strong class="sv-muscles-names">${escapeHtml(names)}</strong>` : ''}
        </div>
        <div class="sv-muscles-fig">${map.figureHtml(zones, 'md')}</div>
      </div>`;
  }

  // Pantalla Ejercicio: figura grande con "TRABAJA: …" y "AYUDAN: …".
  function renderExerciseMuscles(exercise) {
    const map = muscleMap();
    const zones = exerciseZones(exercise);
    if (!map || !map.hasZones(zones)) {
      return '';
    }
    return `
      <div class="sv-muscles-ex" data-sv-muscles-ex>
        ${map.figureHtml(zones, 'lg')}
        <div class="sv-muscles-lines">
          ${zones.main.length ? `<p><span>Trabaja:</span> ${escapeHtml(map.joinLabels(zones.main))}</p>` : ''}
          ${zones.sec.length ? `<p><span>Ayudan:</span> ${escapeHtml(map.joinLabels(zones.sec))}</p>` : ''}
        </div>
      </div>`;
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

  function renderCircuitInfo(exercise) {
    const api = circuitsApi();
    const circuit = circuitOf(exercise);
    const detail = api.formatDetail(circuit);
    const stations = (circuit.stations || []).map((station) => `<li>${escapeHtml(api.formatStation(station))}${station.videoUrl ? ` <a class="sv-video-mark" data-sv-video href="${escapeHtml(station.videoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Ver cómo se hace">▶</a>` : ''}</li>`).join('');
    return `
        <p class="sv-circuit-title" data-sv-circuit-title>${escapeHtml(api.formatTitle(circuit))}</p>
        ${circuit.name ? `<p class="sv-circuit-name">${escapeHtml(circuit.name)}</p>` : ''}
        ${detail ? `<p class="sv-meta">${escapeHtml(detail)}</p>` : ''}
        ${stations ? `<ol class="sv-stations" data-sv-stations>${stations}</ol>` : '<p class="sv-meta">Sin estaciones todavía.</p>'}`;
  }

  function renderExercise(exercise) {
    if (isCircuit(exercise)) {
      return `<li class="sv-exercise sv-circuit" data-sv-circuit="${escapeHtml(exercise.id || '')}">${renderCircuitInfo(exercise)}</li>`;
    }
    const summary = [
      hasValue(exercise.sets) ? `${Number(exercise.sets)} ${Number(exercise.sets) === 1 ? 'serie' : 'series'}` : '',
      isTimed(exercise) ? (hasValue(exercise.durationSeconds) ? `${Number(exercise.durationSeconds)} s` : 'tiempo por definir') : repsRange(exercise),
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
              ${(data.circuits || []).length ? `<ul class="sv-exercises">${data.circuits.map((entry) => `<li class="sv-history-exercise sv-history-circuit" data-sv-history-circuit><strong>${escapeHtml(entry.label || 'Circuito')}</strong> <span class="sv-meta">${escapeHtml(entry.result || '')}</span></li>`).join('')}</ul>` : ''}
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
    return !isCircuit(exercise) && selfLog.plannedEffectiveSets(exercise) > 0;
  }

  // Resultado del circuito en la fecha elegida: { status, result, text } (lo del entrenador gana).
  function circuitState(ctx, dayId, exercise) {
    const api = circuitsApi();
    const states = [1, 2].map((n) => setState(ctx, rowKey(ctx, dayId, exercise.id, 'S', n)));
    if (!states[0].status) {
      return { status: '', result: {}, text: '' };
    }
    const result = api.studentSetsToResult(circuitOf(exercise), { 1: states[0].reps, 2: states[1].status ? states[1].reps : null });
    const rejected = states.find((state) => state.status === 'rejected');
    const pending = states.find((state) => state.status === 'pending');
    const status = states[0].status === 'coach' ? 'coach' : rejected ? 'rejected' : pending ? 'pending' : states[0].status;
    return { status, result, text: api.formatResult(circuitOf(exercise), result), error: rejected?.error || '' };
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
        // v0.9.44: por tiempo solo cuenta lo hecho por tiempo (y con kilos, lo hecho con kilos);
        // los segundos van como "reps", igual que en student_sets.
        if (isTimed(exercise) !== (item.measure === 'time')) return;
        (item.sets || []).filter((set) => (set.type || set.setType || 'S') === 'S').forEach((set, index) => {
          put(date, Number(set.setNumber) || index + 1, isTimed(exercise) ? null : set.weight, isTimed(exercise) ? set.seconds : set.reps, set.rir);
        });
      });
    });
    return [...byDate.keys()].sort().map((date) => ({ date, sets: [...byDate.get(date).values()].sort((a, b) => a.setNumber - b.setNumber) }));
  }

  function maxWeight(sets) {
    return sets.reduce((max, set) => (hasValue(set.weight) ? Math.max(max, Number(set.weight)) : max), 0);
  }

  // Lo que se compara para el récord: kilos o, por tiempo, segundos (que van en reps).
  function maxValue(exercise, sets) {
    return isTimed(exercise)
      ? sets.reduce((max, set) => (hasValue(set.reps) ? Math.max(max, Number(set.reps)) : max), 0)
      : maxWeight(sets);
  }

  // Récord anterior (máximo de las fechas antes de `date`) y la última vez antes de `date`.
  function exerciseReference(ctx, exercise, date) {
    const before = exerciseHistory(ctx, exercise).filter((entry) => entry.date < date && entry.sets.some(setHasData));
    return {
      record: before.reduce((max, entry) => Math.max(max, maxValue(exercise, entry.sets)), 0),
      last: before.length ? before[before.length - 1] : null
    };
  }

  // Récords nuevos: fechas en que el máximo de un ejercicio superó a todo lo anterior.
  function findRecords(ctx, exercises, dates) {
    const records = [];
    const seen = new Set();
    exercises.forEach((exercise) => {
      if (!exercise?.id || seen.has(exercise.id) || isCircuit(exercise)) return;
      seen.add(exercise.id);
      let best = 0;
      exerciseHistory(ctx, exercise).forEach((entry) => {
        const top = maxValue(exercise, entry.sets);
        if (best > 0 && top > best && dates.has(entry.date)) {
          records.push({ date: entry.date, name: exercise.name || 'Ejercicio', weight: top, unit: isTimed(exercise) ? 's' : 'kg' });
        }
        best = Math.max(best, top);
      });
    });
    return records.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)));
  }

  // Valores que aparecen en una serie sin registrar: la última vez, si no lo planificado
  // por el entrenador para esa serie, si no el objetivo.
  function prefillValues(exercise, setType, setNumber, last) {
    // v0.9.44: por tiempo, solo segundos (en "reps"): la última vez o los del entrenador.
    if (isTimed(exercise)) {
      const previousTime = last?.sets.find((set) => set.setNumber === setNumber);
      return { weight: null, reps: hasValue(previousTime?.reps) ? previousTime.reps : (hasValue(exercise.durationSeconds) ? exercise.durationSeconds : null) };
    }
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
    // La pantalla de un ejercicio recorre solo ejercicios (el circuito se ve y se anota en "Hoy").
    const steps = exercises.filter((item) => !isCircuit(item));
    const exerciseIndex = Math.max(steps.findIndex((item) => item.id === logState.exerciseId), 0);
    return { program, days, day, exercises, steps, exerciseIndex, exercise: steps[exerciseIndex] || null };
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
    const card = (exercise, memberLabel = '') => {
      const can = ctx.canLog && loggable(exercise);
      const progress = can ? exerciseProgress(ctx, day.id, exercise) : null;
      const complete = progress && progress.done === progress.planned;
      const zones = exerciseZones(exercise);
      const figure = muscleMap() ? muscleMap().figureHtml(zones, 'sm') : '';
      const zoneTag = figure ? muscleMap().mainLabel(zones) : '';
      return `
        <li class="sv-exercise${complete ? ' is-complete' : ''}">
          <button type="button" class="sv-ex-card${figure ? ' has-fig' : ''}" data-sv-open="${escapeHtml(exercise.id || '')}">
            ${figure}
            <span class="sv-ex-card-text">
              ${zoneTag ? `<span class="sv-zone-tag" data-sv-zone-tag>${escapeHtml(zoneTag)}</span>` : ''}
              <strong>${memberLabel ? `<span class="sv-member-label" data-sv-member-label>${escapeHtml(memberLabel)}</span> ` : ''}${escapeHtml(exercise.name || 'Ejercicio')}${videoFor(exercise) ? ' <span class="sv-video-mark" data-sv-video-mark role="img" aria-label="Tiene video">▶</span>' : ''}</strong>
              <span class="sv-meta">${escapeHtml(memberLabel && isTimed(exercise) ? `${Number(exercise.durationSeconds) || '—'} s` : memberLabel ? exerciseScheme(exercise).replace(/^\d+ × /, '') : exerciseScheme(exercise))}</span>
            </span>
            ${progress ? `<span class="sv-ex-progress${complete ? ' is-complete' : ''}" data-sv-progress>${complete ? '<span class="sv-check" aria-label="Completo">✓</span>' : `${progress.done}/${progress.planned}`}</span>` : ''}
          </button>
        </li>`;
    };
    // v0.9.44: A1 y A2 juntos bajo "Superserie · 3 vueltas".
    const cards = daySegments(day, exercises).map((segment) => {
      if (segment.circuit) {
        return renderCircuitCard(ctx, day, segment.circuit);
      }
      if (!segment.block) {
        return card(segment.exercise);
      }
      const rest = Number(segment.block.restSeconds);
      return `
        <li class="sv-block" data-sv-block="${escapeHtml(segment.block.id)}">
          <p class="sv-block-title">Superserie · ${escapeHtml(plural(Number(segment.block.rounds) || 0, 'vuelta', 'vueltas'))}${rest > 0 ? ` <span class="sv-meta">· descanso ${rest} s al final</span>` : ''}</p>
          <ul class="sv-exercises sv-block-list">${segment.items.map((exercise, index) => card(exercise, `${segment.letter}${index + 1}`)).join('')}</ul>
        </li>`;
    }).join('');
    let next = '';
    const firstStep = selection.steps?.[0];
    if (exercises.length) {
      if (!ctx.canLog) {
        next = firstStep ? `<button type="button" class="sv-next" data-sv-open="${escapeHtml(firstStep.id || '')}">Ver: ${escapeHtml(firstStep.name || 'Ejercicio')}</button>` : '';
      } else if (dayComplete(ctx, day)) {
        next = '<button type="button" class="sv-next" data-sv-summary>Ver resumen ✓</button>';
      } else {
        const pending = exercises.find((exercise) => loggable(exercise) && exerciseProgress(ctx, day.id, exercise).done < selfLog.plannedEffectiveSets(exercise));
        next = pending ? `<button type="button" class="sv-next" data-sv-open="${escapeHtml(pending.id || '')}" data-sv-next>Seguir: ${escapeHtml(pending.name || 'Ejercicio')}</button>` : '';
      }
    }
    return `
      <section class="sv-screen sv-today" data-student-program data-sv-screen="today" data-assignment-id="${escapeHtml(program.assignment_id || '')}">
        ${renderDayMuscles(exercises)}
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

  // v0.9.45: tarjeta del circuito en "Hoy": formato, estaciones y, si registra, su resultado.
  function renderCircuitCard(ctx, day, exercise) {
    const api = circuitsApi();
    const circuit = circuitOf(exercise);
    const id = escapeHtml(exercise.id || '');
    let form = '';
    if (ctx.canLog) {
      const state = circuitState(ctx, day.id, exercise);
      const locked = state.status === 'coach';
      const r = state.result || {};
      const stepper = (field, label, value) => `
        <label class="sv-circuit-field"><span>${label}</span>
          <span class="sv-stepper">
            ${locked ? '' : `<button type="button" class="sv-step-btn" data-sv-c-adjust="${field}" data-sv-delta="-1" aria-label="Menos ${label.toLowerCase()}">−</button>`}
            <input type="text" inputmode="numeric" autocomplete="off" data-sv-c-field="${field}" aria-label="${label}" value="${escapeHtml(hasValue(value) ? String(value) : '')}"${locked ? ' disabled' : ''}>
            ${locked ? '' : `<button type="button" class="sv-step-btn" data-sv-c-adjust="${field}" data-sv-delta="1" aria-label="Más ${label.toLowerCase()}">+</button>`}
          </span>
        </label>`;
      let fields = '';
      if (circuit.format === 'rounds') {
        fields = stepper('rounds', 'Vueltas', r.rounds);
      } else if (circuit.format === 'amrap') {
        fields = `${stepper('rounds', 'Rondas', r.rounds)}${stepper('reps', 'Reps', r.reps)}`;
      } else if (circuit.format === 'emom' || circuit.format === 'tabata') {
        fields = `
        <button type="button" class="sv-chip sv-circuit-done${r.completed ? ' is-active' : ''}" data-sv-c-completed aria-pressed="${Boolean(r.completed)}"${locked ? ' disabled' : ''}>Completado</button>
        ${stepper('rounds', 'Rondas cumplidas', r.completed ? '' : r.rounds)}`;
      } else if (circuit.format === 'fortime') {
        fields = `<label class="sv-circuit-field"><span>Tiempo (mm:ss)</span><input type="text" inputmode="numeric" autocomplete="off" placeholder="12:34" data-sv-c-field="seconds" aria-label="Tiempo" value="${escapeHtml(hasValue(r.seconds) ? api.formatClock(r.seconds) : '')}"${locked ? ' disabled' : ''}></label>`;
      }
      const statusText = state.status ? `${STATUS_TEXT[state.status] || ''}${state.text ? ` · ${state.text}` : ''}` : '';
      form = `
        <div class="sv-circuit-log" data-sv-circuit-form="${id}" data-day-id="${escapeHtml(day.id || '')}" data-completed="${r.completed ? '1' : ''}">
          <p class="sv-circuit-ask">Tu resultado</p>
          <div class="sv-circuit-fields">${fields}</div>
          ${locked ? '' : '<button type="button" class="sv-next sv-circuit-save" data-sv-c-save>Guardar resultado</button>'}
          <p class="sv-log-status" data-sv-c-status data-status="${state.status}">${escapeHtml(statusText)}</p>
          <p class="sv-log-msg${state.status === 'rejected' && state.error ? ' sv-log-msg--bad' : ' hidden'}" role="alert" data-sv-log-msg>${escapeHtml(state.status === 'rejected' ? state.error : '')}</p>
        </div>`;
    }
    return `
        <li class="sv-circuit${ctx.canLog && circuitState(ctx, day.id, exercise).status ? ' is-complete' : ''}" data-sv-circuit="${id}">
          ${renderCircuitInfo(exercise)}
          ${form}
        </li>`;
  }

  function adjustCircuitValue(form, field, delta) {
    const input = form?.querySelector(`[data-sv-c-field="${field}"]`);
    if (!input || input.disabled) return;
    const current = Number(String(input.value || '0').replace(',', '.'));
    input.value = String(Math.max(0, (Number.isFinite(current) ? Math.round(current) : 0) + delta));
    if (field === 'rounds' && form.getAttribute('data-completed')) {
      form.setAttribute('data-completed', '');
      form.querySelector('[data-sv-c-completed]')?.classList.remove('is-active');
    }
  }

  function saveCircuit(form) {
    const api = circuitsApi();
    const cache = logState.cache;
    const program = form.closest('[data-student-program]');
    const assignmentId = program?.getAttribute('data-assignment-id') || '';
    const dayId = form.getAttribute('data-day-id');
    const circuitId = form.getAttribute('data-sv-circuit-form');
    const exercise = findPublishedExercise(cache, assignmentId, dayId, circuitId);
    if (!exercise || !isCircuit(exercise)) {
      showFormMessage(form, 'Este circuito ya no está en tu rutina publicada.', 'bad');
      return;
    }
    if (!selfLog.isDateAllowed(logState.date, new Date())) {
      showFormMessage(form, 'La fecha debe ser de hoy o de hasta 3 días atrás (hora de Chile). Elige otra fecha en "Hoy".', 'bad');
      return;
    }
    const circuit = circuitOf(exercise);
    const value = (field) => form.querySelector(`[data-sv-c-field="${field}"]`)?.value ?? '';
    const raw = circuit.format === 'fortime'
      ? { seconds: api.parseClock(value('seconds')) }
      : { rounds: value('rounds'), reps: value('reps'), completed: form.getAttribute('data-completed') === '1' };
    if (circuit.format === 'fortime' && String(value('seconds')).trim() && raw.seconds === null) {
      showFormMessage(form, 'Escribe el tiempo como minutos:segundos (por ejemplo 12:34).', 'bad');
      return;
    }
    const sets = api.resultToStudentSets(circuit, raw);
    if (!sets.length) {
      showFormMessage(form, 'Anota tu resultado antes de guardar.', 'bad');
      return;
    }
    const base = { ownerId: cache.ownerId, clientId: cache.clientId, assignmentId, sessionDate: logState.date, dayId, exerciseId: circuitId };
    const entries = sets.map((set) => ({ setType: 'S', setNumber: set.setNumber, weight: null, reps: set.reps, rir: null }));
    const outbox = selfLog.queueEntries(selfLog.readOutbox(localStorage, logState.userId), base, entries);
    if (!selfLog.writeOutbox(localStorage, logState.userId, outbox)) {
      showFormMessage(form, 'No se pudo guardar en el teléfono (sin espacio). No cierres esta pantalla y avísale a tu entrenador.', 'bad');
      return;
    }
    rerenderLog();
    const fresh = logState.container?.querySelector(`[data-sv-circuit-form="${CSS.escape(circuitId)}"]`);
    showFormMessage(fresh, 'Guardado en el teléfono. Se sube solo cuando hay conexión.', 'ok');
    flushOutbox().then(() => {
      const after = logState.container?.querySelector(`[data-sv-circuit-form="${CSS.escape(circuitId)}"]`);
      const status = after?.querySelector('[data-sv-c-status]');
      if (!after || !status || !logState.cache) return;
      const ctx = buildContext(logState.cache);
      const state = circuitState(ctx, dayId, exercise);
      status.setAttribute('data-status', state.status);
      status.textContent = state.status ? `${STATUS_TEXT[state.status] || ''}${state.text ? ` · ${state.text}` : ''}` : '';
      if (state.status === 'rejected') showFormMessage(after, state.error || 'La base no aceptó este resultado.', 'bad');
    });
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
    // v0.9.44: por tiempo una sola casilla de segundos (de a 5 s); viaja como "reps".
    const timed = isTimed(exercise);
    const fields = timed
      ? stepper('reps', 'segundos', 5, values.reps, 'numeric')
      : `${stepper('weight', 'kg', 2.5, values.weight, 'decimal')}
        ${stepper('reps', 'repeticiones', 1, values.reps, 'numeric')}`;
    return `
      <div class="sv-log-row${timed ? ' sv-log-row--time' : ''}${done ? ' is-saved' : ''}${state.status === 'rejected' ? ' is-rejected' : ''}" data-set-type="${setType}"${timed ? ' data-timed' : ''} data-set-number="${setNumber}" data-key="${escapeHtml(key)}"${locked ? ' data-locked' : ''}${isLastEffective ? ' data-last-effective' : ''}
        data-saved-weight="${escapeHtml(stored ? formatNumber(state.weight) : '')}" data-saved-reps="${escapeHtml(stored ? formatNumber(state.reps) : '')}" data-saved-rir="${escapeHtml(state.rir ?? '')}" data-status="${state.status}">
        <span class="sv-set-label">${setType}${setNumber}</span>
        ${fields}
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
    const line = isTimed(exercise)
      ? studentSetLine({ seconds: values.reps, rir: planned?.rir })
      : studentSetLine({ weight: values.weight, reps: values.reps, rir: planned?.rir });
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
    const timed = isTimed(exercise);
    const unit = timed ? 's' : 'kg';
    const lastText = reference.last
      ? (timed
        ? `${reference.last.sets.filter((set) => hasValue(set.reps)).map((set) => Number(set.reps)).join(', ')} s`
        : reference.last.sets.filter(setHasData).map((set) => `${hasValue(set.weight) ? `${formatNumber(Number(set.weight))}` : '—'}×${hasValue(set.reps) ? Number(set.reps) : '—'}`).join(', '))
      : '';
    // v0.9.44: superserie: "A1 · Superserie · 3 vueltas" (lo siguiente es A2, sin descanso).
    const blockInfo = memberInfo(day, exercise);
    const refBox = `
      <div class="sv-ref" data-sv-ref>
        <div class="sv-ref-cell"><span class="sv-ref-label">Récord</span><strong data-sv-record-value>${reference.record ? `${formatNumber(reference.record)} ${unit}` : '—'}</strong></div>
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
        <div class="sv-log" data-sv-log data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" data-prior-record="${reference.record || 0}"${timed ? ' data-timed' : ''}>
          ${timed
            ? '<div class="sv-log-head sv-log-head--time" aria-hidden="true"><span></span><span>segundos</span><span></span></div>'
            : '<div class="sv-log-head" aria-hidden="true"><span></span><span>kg</span><span>reps</span><span></span></div>'}
          ${rows}
          ${approxRows ? `<details class="sv-approx"><summary>Aproximaciones (opcional)</summary><div class="sv-approx-rows">${approxRows}</div></details>` : ''}
          <p class="sv-log-msg hidden" role="alert" data-sv-log-msg></p>
        </div>`;
    }
    const total = (selection.steps || exercises).length;
    const video = videoFor(exercise);
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
        ${blockInfo ? `<p class="sv-block-line" data-sv-block-line>${escapeHtml(`${blockInfo.label} · Superserie · ${plural(blockInfo.rounds, 'vuelta', 'vueltas')}`)}${blockInfo.next ? ` · sigue ${escapeHtml(blockInfo.next)}` : ''}</p>` : ''}
        <h2 class="sv-ex-name">${escapeHtml(exercise.name || 'Ejercicio')}</h2>
        ${renderExerciseMuscles(exercise)}
        ${video ? `<a class="sv-video-btn" data-sv-video href="${escapeHtml(video)}" target="_blank" rel="noopener noreferrer">▶ Ver cómo se hace</a>` : ''}
        <p class="sv-meta sv-ex-scheme">${escapeHtml(exerciseScheme(exercise))}${hasValue(exercise.targetWeight) && !timed ? ` · objetivo ${escapeHtml(formatNumber(Number(exercise.targetWeight)))} kg` : ''}${ctx.canLog && plannedFeel(exercise) ? ` · <span data-sv-planned-feel>objetivo: ${escapeHtml(plannedFeel(exercise))}</span>` : ''}</p>
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
    const recordList = (items) => `<ul class="sv-records">${items.map((record) => `<li><span class="sv-check" aria-hidden="true">✓</span> ${escapeHtml(record.name)} <strong>${escapeHtml(formatNumber(record.weight))} ${record.unit || 'kg'}</strong>${record.date !== ctx.date ? ` <span class="sv-meta">${escapeHtml(formatDate(record.date))}</span>` : ''}</li>`).join('')}</ul>`;
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
      records.length ? `Récords: ${records.map((record) => `${record.name} ${formatNumber(record.weight)} ${record.unit || 'kg'}`).join(', ')}.` : '',
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
              <img class="brand-logo" src="./assets/images/valhalla-logo.svg" alt="Vikingos Radical" onerror="this.style.display='none'; this.parentElement.classList.add('brand-mark--fallback');">
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
      // v0.9.49: con invitaciones, el alumno se vincula solo con el código de su coach.
      const haveCode = typeof inviteOpts.onHaveCode === 'function';
      content.innerHTML = `<section class="sv-card" data-student-unlinked><h2>Tu cuenta aún no está vinculada</h2>${haveCode
        ? '<p>Usa el código que te mandó tu coach por WhatsApp. Si no lo tienes, pídele una invitación.</p><button class="sv-primary" type="button" data-sv-have-code>Tengo un código</button>'
        : '<p>Avísale a tu entrenador para que la vincule con tu ficha.</p>'}</section>`;
      if (haveCode) {
        content.querySelector('[data-sv-have-code]').addEventListener('click', () => inviteOpts.onHaveCode());
        if (inviteOpts.inviteCode && !offline) {
          inviteOpts.onHaveCode();
        }
      }
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
    // v0.9.44: por tiempo el récord compara segundos (que van en "reps").
    const timed = row.hasAttribute('data-timed');
    const weight = selfLog.parseDecimal(timed ? repsText : weightText);
    const pill = row.querySelector('[data-sv-record]');
    if (pill) {
      const isRecord = row.getAttribute('data-set-type') === 'S' && prior > 0 && Number.isFinite(weight) && weight > prior;
      pill.textContent = isRecord ? `¡Récord! ${formatNumber(weight)} ${timed ? 's' : 'kg'}` : '';
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
      showFormMessage(form, row.hasAttribute('data-timed') ? 'Escribe los segundos de esta serie.' : 'Escribe el peso o las repeticiones de esta serie.', 'bad');
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
    if ((button = pick('[data-sv-c-adjust]'))) {
      adjustCircuitValue(button.closest('[data-sv-circuit-form]'), button.getAttribute('data-sv-c-adjust'), Number(button.getAttribute('data-sv-delta')));
    } else if ((button = pick('[data-sv-c-completed]'))) {
      const form = button.closest('[data-sv-circuit-form]');
      const on = form.getAttribute('data-completed') !== '1';
      form.setAttribute('data-completed', on ? '1' : '');
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
      if (on) {
        const rounds = form.querySelector('[data-sv-c-field="rounds"]');
        if (rounds) rounds.value = '';
      }
    } else if ((button = pick('[data-sv-c-save]'))) {
      saveCircuit(button.closest('[data-sv-circuit-form]'));
    } else if ((button = pick('[data-sv-adjust]'))) {
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
      const { steps, exerciseIndex } = resolveSelection(ctx, logState.cache.programs || []);
      const next = steps[exerciseIndex + Number(button.getAttribute('data-sv-step'))];
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
  async function render(container, { user, profile, offline = false, onSignOut, onHaveCode = null, inviteCode = '' }) {
    stopLog();
    inviteOpts = { onHaveCode, inviteCode };
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
      feelFromRir, plannedFeel, FEEL_OPTIONS, weekStart, weekDates, weekStreak, localToday, addDays, renderExerciseScreen, renderToday,
      isCircuit
    }
  };
})();
