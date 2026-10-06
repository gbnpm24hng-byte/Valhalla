(function () {
  // Fase B2: vista del alumno, solo lectura. Lee únicamente student_programs y
  // student_progress con la sesión del alumno (RLS: solo lo suyo y solo lo publicado).
  // No muestra finanzas, lista de clientes ni nada de otros alumnos.
  window.VALHALLA = window.VALHALLA || {};

  const authApi = window.VALHALLA.auth;
  const CACHE_KEY = 'valhalla_student_cache';
  const TIMEOUT_MS = 15000;

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

  function clearCache() {
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
      client.from('client_links').select('client_id, owner_id').eq('auth_user_id', userId).eq('active', true).maybeSingle(),
      TIMED_OUT
    );
    if (link.error) {
      return { error: true, unavailable: unavailable(link) };
    }
    if (!link.data) {
      return { linked: false };
    }
    const { client_id: clientId, owner_id: ownerId } = link.data;
    const [programs, progress] = await Promise.all([
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
      )
    ]);
    if (programs.error || progress.error) {
      return { error: true, unavailable: unavailable(programs.error ? programs : progress) };
    }
    return { linked: true, programs: programs.data || [], progress: progress.data || [] };
  }

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------

  function setLine(set) {
    const parts = [];
    parts.push(set.weight === null || set.weight === undefined ? 'peso libre' : `${Number(set.weight)} kg`);
    if (set.reps !== null && set.reps !== undefined) parts.push(`${Number(set.reps)} reps`);
    if (set.rir !== null && set.rir !== undefined) parts.push(`RIR ${Number(set.rir)}`);
    return parts.join(' × ').replace(' × RIR', ' · RIR');
  }

  function repsRange(exercise) {
    if (exercise.repMin === null || exercise.repMin === undefined) return '';
    return exercise.repMax && exercise.repMax !== exercise.repMin ? `${exercise.repMin}–${exercise.repMax} reps` : `${exercise.repMin} reps`;
  }

  function renderExercise(exercise) {
    const summary = [
      exercise.sets ? `${Number(exercise.sets)} series` : '',
      repsRange(exercise),
      exercise.targetWeight !== null && exercise.targetWeight !== undefined ? `${Number(exercise.targetWeight)} kg objetivo` : ''
    ].filter(Boolean).join(' · ');
    const rows = [
      ...(exercise.approximations || []).map((set) => `<li><span class="sv-set-label">${escapeHtml(set.label || 'A')}</span> ${escapeHtml(setLine(set))}</li>`),
      ...(exercise.effectiveSets || []).map((set) => `<li class="sv-effective"><span class="sv-set-label">${escapeHtml(set.label || 'S')}</span> ${escapeHtml(setLine(set))}</li>`)
    ].join('');
    return `
      <li class="sv-exercise">
        <strong>${escapeHtml(exercise.name || 'Ejercicio')}</strong>
        ${summary ? `<div class="sv-meta">${escapeHtml(summary)}</div>` : ''}
        ${rows ? `<ul class="sv-sets">${rows}</ul>` : ''}
        ${exercise.techniqueNotes ? `<div class="sv-note">${escapeHtml(exercise.techniqueNotes)}</div>` : ''}
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
            <ul class="sv-exercises">${(day.exercises || []).map(renderExercise).join('')}</ul>
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
                  <ul class="sv-sets">${(exercise.sets || []).map((set) => `<li${set.type === 'S' ? ' class="sv-effective"' : ''}><span class="sv-set-label">${escapeHtml(`${set.type || 'S'}${set.setNumber || ''}`)}</span> ${escapeHtml(setLine(set))}</li>`).join('')}</ul>
                </li>`).join('')}</ul>
            </details>`;
        }).join('')}
      </section>`;
  }

  function shell(container, { name, onSignOut }) {
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
        <div data-student-banner></div>
        <main data-student-content><p class="sv-meta sv-loading">Cargando tu programa…</p></main>
      </div>`;
    container.querySelector('[data-auth-logout]').addEventListener('click', onSignOut);
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
    content.innerHTML = `
      ${programs.length ? programs.map(renderProgram).join('') : '<section class="card sv-card" data-student-empty><h2>Aún no tienes un programa publicado</h2><p>Tu entrenador te avisará cuando lo publique.</p></section>'}
      ${renderHistory(cache.progress || [])}`;
  }

  // Abre la vista. `offline`: Supabase no responde; se muestra lo último cargado.
  async function render(container, { user, profile, offline = false, onSignOut }) {
    shell(container, { name: profile?.full_name || '', onSignOut });
    const cached = readCache(user.id);
    if (offline) {
      showContent(container, cached, { offline: true });
      return;
    }
    const result = await fetchData(user.id);
    if (result.error) {
      if (result.unavailable) {
        showContent(container, cached, { offline: true });
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
    const cache = { userId: user.id, linked: true, programs: result.programs, progress: result.progress, fetchedAt: new Date().toISOString() };
    writeCache(cache);
    showContent(container, cache, { offline: false });
  }

  window.VALHALLA.studentView = { render, clearCache };
})();
