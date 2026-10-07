(function () {
  // Fase B2: vista del alumno. Lee únicamente student_programs y student_progress con la
  // sesión del alumno (RLS: solo lo suyo y solo lo publicado). No muestra finanzas, lista
  // de clientes ni nada de otros alumnos.
  // Fase B3.2: si el vínculo tiene can_self_log, el alumno registra sus series. Se guardan
  // primero en el teléfono (por cuenta) y se suben a student_sets cuando hay conexión.
  // Sin can_self_log la vista queda igual que en B2.
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
  // Dibujo
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

  function setHasData(set) {
    return hasValue(set?.weight) || hasValue(set?.reps);
  }

  function repsRange(exercise) {
    if (!hasValue(exercise.repMin)) return 'reps por definir';
    return hasValue(exercise.repMax) && Number(exercise.repMax) !== Number(exercise.repMin)
      ? `${Number(exercise.repMin)}–${Number(exercise.repMax)} reps`
      : `${Number(exercise.repMin)} reps`;
  }

  // Nota para el alumno: sin frases internas (también en lo que se publicó antes del filtro).
  function noteForStudent(value) {
    return window.VALHALLA.publishCore?.studentNote ? window.VALHALLA.publishCore.studentNote(value) : String(value || '');
  }

  // ---------------------------------------------------------------------------
  // B3.2: registro de series por el alumno
  // ---------------------------------------------------------------------------

  const STATUS_TEXT = {
    saved: '✓ Guardada',
    pending: '⏳ Pendiente de subir',
    rejected: '✕ Rechazada',
    coach: '✓ Corregida por tu entrenador'
  };

  function formatNumber(value) {
    return value === null || value === undefined || value === '' ? '' : String(value).replace('.', ',');
  }

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

  // Lo último que registró en el ejercicio antes de la fecha elegida (base o teléfono).
  function lastRecord(ctx, exerciseId) {
    const byDate = new Map();
    const add = (date, setType, setNumber, weight, reps) => {
      if (setType !== 'S' || date >= ctx.date) return;
      if (!byDate.has(date)) byDate.set(date, new Map());
      byDate.get(date).set(setNumber, { setNumber, weight, reps });
    };
    ctx.setRows.filter((row) => row.exercise_id === exerciseId)
      .forEach((row) => add(row.session_date, row.set_type, Number(row.set_number), row.weight, row.reps));
    ctx.outbox.filter((item) => item.exerciseId === exerciseId)
      .forEach((item) => add(item.sessionDate, item.setType, item.setNumber, item.weight, item.reps));
    const dates = [...byDate.keys()].sort();
    if (!dates.length) return null;
    const date = dates[dates.length - 1];
    const sets = [...byDate.get(date).values()].sort((a, b) => a.setNumber - b.setNumber);
    return { date, line: sets.map((set) => setLine(set).replace(/(\d)\.(\d)/g, '$1,$2')).join(' · ') };
  }

  function renderLogRow(ctx, dayId, exercise, setType, setNumber, isLastEffective) {
    const key = rowKey(ctx, dayId, exercise.id, setType, setNumber);
    const state = setState(ctx, key);
    const locked = state.status === 'coach';
    const field = (name, label, mode, value) => `
      <label class="sv-log-field">${label}<input type="text" inputmode="${mode}" autocomplete="off" data-field="${name}" value="${escapeHtml(formatNumber(value))}"${locked ? ' disabled' : ''}></label>`;
    return `
      <div class="sv-log-row" data-set-type="${setType}" data-set-number="${setNumber}" data-key="${escapeHtml(key)}"${locked ? ' data-locked' : ''}>
        <span class="sv-set-label">${setType}${setNumber}</span>
        ${field('weight', 'Peso (kg)', 'decimal', state.weight)}
        ${field('reps', 'Reps', 'numeric', state.reps)}
        ${setType === 'S' ? field('rir', isLastEffective ? 'RIR *' : 'RIR', 'numeric', state.rir) : '<span></span>'}
        <span class="sv-log-status" data-status="${state.status}">${escapeHtml(STATUS_TEXT[state.status] || '')}</span>
        <p class="sv-log-row-error${state.status === 'rejected' && state.error ? '' : ' hidden'}" role="alert">${escapeHtml(state.status === 'rejected' ? state.error || '' : '')}</p>
      </div>`;
  }

  function renderLogForm(ctx, day, exercise) {
    if (!day?.id || !exercise?.id) {
      return '';
    }
    const effective = selfLog.plannedEffectiveSets(exercise);
    if (!effective) {
      return '<p class="sv-log-undefined" data-sv-log-undefined>Tu entrenador aún no definió las series de este ejercicio</p>';
    }
    const approximations = selfLog.plannedApproximations(exercise);
    const last = lastRecord(ctx, exercise.id);
    const reference = [
      hasValue(exercise.targetWeight) ? `Planificado: ${formatNumber(Number(exercise.targetWeight))} kg` : '',
      last ? `Último registro (${formatDate(last.date)}): ${last.line}` : ''
    ].filter(Boolean).join(' · ');
    const rows = [
      ...Array.from({ length: approximations }, (_, index) => renderLogRow(ctx, day.id, exercise, 'A', index + 1, false)),
      ...Array.from({ length: effective }, (_, index) => renderLogRow(ctx, day.id, exercise, 'S', index + 1, index + 1 === effective))
    ].join('');
    return `
      <form class="sv-log" data-sv-log data-day-id="${escapeHtml(day.id)}" data-exercise-id="${escapeHtml(exercise.id)}" novalidate>
        ${reference ? `<p class="sv-log-ref" data-sv-log-ref>${escapeHtml(reference)}</p>` : ''}
        ${rows}
        <p class="sv-meta">* El RIR es obligatorio en la última serie.${approximations ? ' Las aproximaciones son opcionales.' : ''}</p>
        <button class="primary sv-log-save" type="submit">Guardar series</button>
        <p class="sv-log-msg hidden" role="alert" data-sv-log-msg></p>
      </form>`;
  }

  function renderDatePicker(ctx) {
    const today = ctx.dates[0];
    const label = (date) => (date === today ? `Hoy (${formatDate(date)})` : formatDate(date));
    return `
      <label class="sv-log-date">Fecha del entrenamiento
        <select data-sv-log-date>${ctx.dates.map((date) => `<option value="${date}"${date === ctx.date ? ' selected' : ''}>${escapeHtml(label(date))}</option>`).join('')}</select>
      </label>`;
  }

  function renderExercise(exercise, ctx = null, day = null) {
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
        ${ctx ? renderLogForm(ctx, day, exercise) : ''}
      </li>`;
  }

  // ctx (opcional): datos del registro del alumno. Sin ctx, solo lectura (como en B2).
  function renderProgram(row, ctx = null) {
    const data = row.data || {};
    const days = Array.isArray(data.days) ? data.days : [];
    const logCtx = ctx ? Object.assign({}, ctx, { assignmentId: row.assignment_id }) : null;
    return `
      <section class="card sv-card" data-student-program${logCtx ? ` data-assignment-id="${escapeHtml(row.assignment_id || '')}"` : ''}>
        <p class="eyebrow">Tu programa</p>
        <h2>${escapeHtml(row.title || data.programName || 'Programa')}</h2>
        <p class="sv-meta">Publicado ${escapeHtml(formatDate(row.published_at, true))}</p>
        ${logCtx ? renderDatePicker(logCtx) : ''}
        ${days.map((day, index) => `
          <details class="sv-day"${index === 0 ? ' open' : ''}>
            <summary>${escapeHtml(day.name || `Día ${index + 1}`)} <span class="sv-meta">${plural((day.exercises || []).length, 'ejercicio', 'ejercicios')}</span></summary>
            <ul class="sv-exercises">${(day.exercises || []).map((exercise) => renderExercise(exercise, logCtx, day)).join('')}</ul>
          </details>`).join('') || '<p class="sv-meta">Este programa aún no tiene días.</p>'}
      </section>`;
  }

  function renderHistory(progress) {
    if (!progress.length) {
      return '<section class="card sv-card"><p class="eyebrow">Tu historial</p><p class="sv-meta">Aún no hay sesiones registradas.</p></section>';
    }
    return `
      <section class="card sv-card" data-student-history>
        <p class="eyebrow">Tu historial</p>
        ${progress.map((row) => {
          const data = row.data || {};
          return `
            <details class="sv-day">
              <summary>${escapeHtml(formatDate(row.session_date || data.date) || 'Sesión')} <span class="sv-meta">${escapeHtml(data.dayName || row.title || '')}</span></summary>
              <ul class="sv-exercises">${(data.exercises || []).map((exercise) => `
                <li class="sv-exercise">
                  <strong>${escapeHtml(exercise.name || 'Ejercicio')}</strong>
                  <ul class="sv-sets">${(exercise.sets || []).filter(setHasData).map((set) => `<li${set.type === 'S' ? ' class="sv-effective"' : ''}><span class="sv-set-label">${escapeHtml(`${set.type || 'S'}${set.setNumber || ''}`)}</span> ${escapeHtml(setLine(set))}</li>`).join('')}</ul>
                </li>`).join('')}</ul>
            </details>`;
        }).join('')}
      </section>`;
  }

  function shell(container, { name, userId, onSignOut }) {
    container.innerHTML = `
      <div class="student-view">
        <header class="sv-header card">
          <div class="brand">
            <div class="brand-mark">
              <img class="brand-logo" src="./assets/images/logo-vikingos.png" alt="Vikingos Radical" onerror="this.style.display='none'; this.parentElement.classList.add('brand-mark--fallback');">
              <span class="brand-fallback">VR</span>
            </div>
            <div>
              <h1 class="sv-title">VALHALLA</h1>
              <p class="sv-meta">${name ? `Hola, ${escapeHtml(name)}` : 'Vista de alumno'}</p>
            </div>
          </div>
          <button class="secondary small" type="button" data-auth-logout>Cerrar sesión</button>
        </header>
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
    panel.className = 'card sv-card sv-logout-confirm';
    panel.setAttribute('role', 'alertdialog');
    panel.innerHTML = `
      <p data-sv-logout-text>Tienes ${plural(pending, 'serie', 'series')} sin subir. Se subirán cuando vuelvas a entrar con conexión en este teléfono.</p>
      <div class="inline-actions">
        <button class="danger" type="button" data-sv-logout-anyway>Cerrar sesión igual</button>
        <button class="primary" type="button" data-sv-logout-stay>Quedarme</button>
      </div>`;
    panel.querySelector('[data-sv-logout-anyway]').addEventListener('click', onSignOut);
    panel.querySelector('[data-sv-logout-stay]').addEventListener('click', () => {
      panel.className = 'hidden';
      panel.innerHTML = '';
    });
    panel.querySelector('[data-sv-logout-stay]').focus();
  }

  function showContent(container, cache, { offline }) {
    const content = container.querySelector('[data-student-content]');
    const banner = container.querySelector('[data-student-banner]');
    banner.innerHTML = offline
      ? `<p class="notice auth-offline-banner" role="status">Sin conexión: estás viendo lo último que se cargó${cache?.fetchedAt ? ` (${escapeHtml(formatDate(cache.fetchedAt, true))})` : ''}.</p>`
      : '';
    if (!cache) {
      content.innerHTML = '<section class="card sv-card"><p>No hay conexión y este teléfono aún no tiene tu programa guardado. Conéctate a internet para verlo.</p></section>';
      return;
    }
    if (!cache.linked) {
      content.innerHTML = '<section class="card sv-card" data-student-unlinked><h2>Tu cuenta aún no está vinculada</h2><p>Avísale a tu entrenador para que la vincule con tu ficha.</p></section>';
      return;
    }
    const programs = cache.programs || [];
    const ctx = cache.canSelfLog && selfLog ? buildLogContext(cache) : null;
    content.innerHTML = `
      ${programs.length ? programs.map((row) => renderProgram(row, ctx)).join('') : '<section class="card sv-card" data-student-empty><h2>Aún no tienes un programa publicado</h2><p>Tu entrenador te avisará cuando lo publique.</p></section>'}
      ${renderHistory(cache.progress || [])}`;
    if (ctx) {
      attachLog(container, cache);
      refreshStatuses();
    }
  }

  // ---------------------------------------------------------------------------
  // B3.2: estado del registro, guardado en el teléfono y subida a student_sets
  // ---------------------------------------------------------------------------

  // Una sola vista de alumno abierta a la vez (la del usuario conectado).
  const logState = { container: null, cache: null, userId: '', date: '', timer: null, flushing: false, listening: false };

  function buildLogContext(cache) {
    const userId = cache.userId;
    const dates = selfLog.allowedDates(new Date());
    if (!dates.includes(logState.date) || logState.userId !== userId) {
      logState.date = dates[0];
    }
    logState.userId = userId;
    const outbox = selfLog.readOutbox(localStorage, userId);
    return {
      userId,
      date: logState.date,
      dates,
      setRows: cache.setRows || [],
      outbox,
      serverByKey: new Map((cache.setRows || []).map((row) => [serverRowKey(row), row])),
      localByKey: new Map(outbox.map((item) => [item.key, item]))
    };
  }

  function rerenderLog() {
    if (logState.container && logState.cache) {
      showContent(logState.container, logState.cache, { offline: logState.offline });
    }
  }

  function findPublishedExercise(cache, assignmentId, dayId, exerciseId) {
    const program = (cache.programs || []).find((row) => row.assignment_id === assignmentId);
    const day = (program?.data?.days || []).find((item) => item.id === dayId);
    return (day?.exercises || []).find((item) => item.id === exerciseId) || null;
  }

  function showFormMessage(form, text, tone) {
    const message = form.querySelector('[data-sv-log-msg]');
    if (!message) return;
    message.textContent = text;
    message.className = `sv-log-msg notice${tone === 'bad' ? ' sv-log-msg--bad' : ' ok'}`;
  }

  // Actualiza solo los estados (sin tocar lo que el alumno está escribiendo).
  function refreshStatuses() {
    const container = logState.container;
    if (!container || !logState.userId) return;
    const outbox = selfLog.readOutbox(localStorage, logState.userId);
    const byKey = new Map(outbox.map((item) => [item.key, item]));
    container.querySelectorAll('.sv-log-row[data-key]').forEach((row) => {
      if (row.hasAttribute('data-locked')) return;
      const item = byKey.get(row.getAttribute('data-key'));
      if (!item) return;
      const status = row.querySelector('.sv-log-status');
      status.setAttribute('data-status', item.status);
      status.textContent = STATUS_TEXT[item.status] || '';
      const error = row.querySelector('.sv-log-row-error');
      error.textContent = item.status === 'rejected' ? item.error || '' : '';
      error.classList.toggle('hidden', !(item.status === 'rejected' && item.error));
    });
    // El mensaje del ejercicio no puede quedar diciendo "guardado" si algo se rechazó.
    container.querySelectorAll('[data-sv-log]').forEach((form) => {
      if (form.querySelector('.sv-log-status[data-status="rejected"]')) {
        showFormMessage(form, 'Una o más series no se pudieron subir. Revisa el mensaje de cada una; lo que escribiste sigue aquí.', 'bad');
      }
    });
  }

  function saveExercise(form) {
    const cache = logState.cache;
    const program = form.closest('[data-student-program]');
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
      showFormMessage(form, 'La fecha debe ser de hoy o de hasta 3 días atrás (hora de Chile). Elige otra fecha arriba.', 'bad');
      return;
    }
    const rows = [...form.querySelectorAll('.sv-log-row:not([data-locked])')].map((row) => ({
      setType: row.getAttribute('data-set-type'),
      setNumber: Number(row.getAttribute('data-set-number')),
      weightText: row.querySelector('[data-field="weight"]')?.value || '',
      repsText: row.querySelector('[data-field="reps"]')?.value || '',
      rirText: row.querySelector('[data-field="rir"]')?.value || ''
    }));
    const { errors, entries } = selfLog.validateExercise(exercise, rows);
    if (errors.length) {
      showFormMessage(form, errors.join(' · '), 'bad');
      return;
    }
    if (!entries.length) {
      showFormMessage(form, 'Escribe al menos una serie.', 'bad');
      return;
    }
    const base = { ownerId: cache.ownerId, clientId: cache.clientId, assignmentId, sessionDate: logState.date, dayId, exerciseId };
    // Solo se manda lo que cambió: una serie ya guardada con los mismos valores no se reenvía.
    const current = selfLog.readOutbox(localStorage, logState.userId);
    const localByKey = new Map(current.map((item) => [item.key, item]));
    const serverByKey = new Map((cache.setRows || []).map((row) => [serverRowKey(row), row]));
    const same = (a, b) => (a ?? null) === (b === null || b === undefined ? null : Number(b));
    const changed = entries.filter((entry) => {
      const key = selfLog.setKey({ ...base, setType: entry.setType, setNumber: entry.setNumber });
      const known = localByKey.get(key) || serverByKey.get(key);
      if (!known || known.status === 'rejected' || known.status === 'pending') return true;
      return !(same(entry.weight, known.weight) && same(entry.reps, known.reps) && same(entry.rir, known.rir));
    });
    if (!changed.length) {
      showFormMessage(form, 'No hay cambios para guardar.', 'ok');
      return;
    }
    const outbox = selfLog.queueEntries(current, base, changed);
    if (!selfLog.writeOutbox(localStorage, logState.userId, outbox)) {
      showFormMessage(form, 'No se pudo guardar en el teléfono (sin espacio). No cierres esta pantalla y avísale a tu entrenador.', 'bad');
      return;
    }
    refreshStatuses();
    showFormMessage(form, 'Guardado en el teléfono. Se sube solo cuando hay conexión.', 'ok');
    flushOutbox();
  }

  function isRetryable(result) {
    const status = Number(result?.status ?? 0);
    return Boolean(result?.error?.timedOut) || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
      || Boolean(authApi?.isUnavailableError?.(result?.error, result?.status));
  }

  // Sube lo pendiente de la cuenta conectada, de a una serie (un rechazo no frena al resto).
  async function flushOutbox() {
    const userId = logState.userId;
    if (logState.flushing || !userId || !authApi?.getClient) return;
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
    if (!logState.userId) return;
    if (selfLog.readOutbox(localStorage, logState.userId).some((item) => item.status === 'pending')) {
      logState.timer = setTimeout(flushOutbox, RETRY_MS);
    }
  }

  function attachLog(container, cache) {
    if (container.__svLogAttached !== true) {
      container.__svLogAttached = true;
      container.addEventListener('change', (event) => {
        if (event.target.matches('[data-sv-log-date]')) {
          logState.date = event.target.value;
          rerenderLog();
        }
      });
      container.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-sv-log]');
        if (form) {
          event.preventDefault();
          saveExercise(form);
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
    Object.assign(logState, { container: null, cache: null, userId: '', date: '', timer: null });
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
        container.querySelector('[data-student-content]').innerHTML = '<section class="card sv-card"><p>No se pudo cargar tu programa. Intenta de nuevo más tarde.</p></section>';
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

  window.VALHALLA.studentView = { render, clearCache, format: { setLine, setHasData, repsRange, noteForStudent, renderProgram } };
})();
