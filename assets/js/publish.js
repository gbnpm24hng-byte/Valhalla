(function () {
  // Fase B1: "Publicar al alumno". Solo el entrenador publica, y solo al tocar el botón:
  // nada se publica solo. Escribe el programa activo del cliente en student_programs y
  // su historial de series en student_progress (armados con publish-core.js).
  window.VALHALLA = window.VALHALLA || {};

  const authApi = window.VALHALLA.auth;
  const syncCore = window.VALHALLA.syncCore;
  const publishCore = window.VALHALLA.publishCore;
  const supabaseApi = window.VALHALLA.supabase;
  const cloudConfigured = Boolean(supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled());

  if (!cloudConfigured || !authApi || !syncCore || !publishCore || window.VALHALLA.onboarding?.active) {
    return;
  }

  const TIMEOUT_MS = 20000;
  const ctx = {
    ownerId: '',
    online: false,
    loaded: false,
    loadError: '',
    published: new Map(), // client_id -> { assignmentId, publishedAt, contentHash }
    busyClientId: ''
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function withTimeout(promise, fallback) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))]);
  }

  function client() {
    return authApi.getClient();
  }

  function appState() {
    return window.VALHALLA.appState?.get?.() || null;
  }

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) {
      return 'sin fecha';
    }
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) return 'hace un momento';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'hace 1 día' : `hace ${days} días`;
  }

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent('valhalla:publish-changed'));
  }

  // Lo que se publicaría hoy para un cliente (programa activo + historial).
  function currentPublication(clientId, assignmentId) {
    const state = appState();
    const v08 = state?.trainingsV08 || {};
    const assignment = (v08.assignments || []).find((item) => item.id === assignmentId && item.clientId === clientId);
    if (!assignment) {
      return null;
    }
    const sessions = (v08.sessions || []).filter((session) => session.clientId === clientId);
    const publication = publishCore.buildPublication(assignment, sessions);
    return { assignment, ...publication, contentHash: syncCore.fingerprint({ program: publication.program, progress: publication.progress }) };
  }

  async function loadPublished(ownerId) {
    ctx.loaded = false;
    ctx.loadError = '';
    const result = await withTimeout(
      client().from('student_programs').select('client_id, assignment_id, published_at, data').eq('owner_id', ownerId).eq('active', true),
      { data: null, error: { message: 'timeout', timedOut: true }, status: 0 }
    );
    if (ownerId !== ctx.ownerId) {
      return;
    }
    if (result.error) {
      ctx.loadError = result.error.timedOut || authApi.isUnavailableError(result.error, result.status) ? 'sin conexión' : 'error';
    } else {
      ctx.published = new Map((result.data || []).map((row) => [row.client_id, {
        assignmentId: row.assignment_id,
        publishedAt: row.published_at,
        contentHash: row.data?.contentHash || ''
      }]));
      ctx.loaded = true;
    }
    notifyChanged();
  }

  // HTML del indicador y del botón para la tarjeta del cliente (lo usa app.js).
  function renderStatus(clientId, assignment) {
    if (!assignment) {
      return '';
    }
    let status;
    let tone = 'muted';
    if (!ctx.online) {
      status = 'Para publicar, inicia sesión con conexión.';
    } else if (!ctx.loaded) {
      status = ctx.loadError ? `No se pudo consultar lo publicado (${ctx.loadError}).` : 'Consultando lo publicado…';
    } else {
      const published = ctx.published.get(clientId);
      const current = currentPublication(clientId, assignment.id);
      if (!published) {
        status = 'Aún no publicado al alumno.';
        tone = 'warn';
      } else if (!current || published.assignmentId !== assignment.id || published.contentHash !== current.contentHash) {
        status = `Tiene cambios sin publicar (última publicación ${relativeTime(published.publishedAt)}).`;
        tone = 'warn';
      } else {
        status = `Publicado ${relativeTime(published.publishedAt)}.`;
        tone = 'ok';
      }
    }
    const busy = ctx.busyClientId === clientId;
    const disabled = !ctx.online || !ctx.loaded || busy;
    return `
      <div class="client-publish" data-publish-status="${escapeHtml(clientId)}">
        <span class="${tone}">${escapeHtml(status)}</span>
        <button class="secondary" type="button" data-publish-client="${escapeHtml(clientId)}" data-publish-assignment="${escapeHtml(assignment.id)}" ${disabled ? 'disabled' : ''}>${busy ? 'Publicando…' : 'Publicar al alumno'}</button>
      </div>`;
  }

  function closeModal() {
    document.getElementById('publishModal')?.remove();
  }

  function openModal(html) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'publishModal';
    overlay.className = 'sync-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="sync-modal-card card">${html}</div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function clientName(clientId) {
    const found = (appState()?.clients || []).find((item) => item.id === clientId);
    return found?.full_name || found?.name || 'este cliente';
  }

  function confirmPublish(clientId, assignmentId) {
    const current = currentPublication(clientId, assignmentId);
    if (!current) {
      return;
    }
    const exercises = current.program.days.reduce((total, day) => total + day.exercises.length, 0);
    const modal = openModal(`
      <h2>Publicar al alumno</h2>
      <p>Se publicará para <strong>${escapeHtml(clientName(clientId))}</strong>:</p>
      <ul>
        <li>Programa "${escapeHtml(current.program.programName)}": ${plural(current.program.days.length, 'día', 'días')}, ${plural(exercises, 'ejercicio', 'ejercicios')}.</li>
        <li>Historial: ${plural(current.progress.length, 'sesión', 'sesiones')} con series.</li>
      </ul>
      <p class="muted">Solo se publican días, ejercicios, series, repeticiones, cargas objetivo y notas de técnica. Nunca pagos, valores, teléfono, correo, lesiones ni observaciones.</p>
      ${current.omittedSets ? `<p class="notice">${plural(current.omittedSets, 'serie', 'series')} de tipo "T" no se publicarán (el alumno solo ve aproximaciones y series efectivas).</p>` : ''}
      <p class="notice auth-message hidden" data-publish-message role="alert"></p>
      <div class="inline-actions">
        <button class="secondary" type="button" data-publish-cancel>Cancelar</button>
        <button class="primary" type="button" data-publish-confirm>Publicar</button>
      </div>`);
    modal.querySelector('[data-publish-cancel]').focus();
    modal.querySelector('[data-publish-cancel]').addEventListener('click', closeModal);
    modal.querySelector('[data-publish-confirm]').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Publicando…';
      const result = await publish(clientId, assignmentId);
      if (result.ok) {
        closeModal();
        return;
      }
      const message = modal.querySelector('[data-publish-message]');
      message.textContent = result.message;
      message.classList.remove('hidden');
      message.classList.add('auth-message--bad');
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = 'Reintentar';
    });
  }

  function describeError(error, status) {
    if (error?.timedOut || authApi.isUnavailableError(error, status)) {
      return 'El servidor no respondió. No se publicó; inténtalo de nuevo.';
    }
    if (String(error?.code || '') === '23514') {
      return 'La nube rechazó la publicación porque incluía datos no permitidos. No se publicó.';
    }
    if (String(error?.code || '') === '42501' || status === 401 || status === 403) {
      return 'La nube rechazó la publicación: tu cuenta no tiene permiso.';
    }
    return 'La nube rechazó la publicación.';
  }

  async function publish(clientId, assignmentId) {
    const ownerId = ctx.ownerId;
    const current = currentPublication(clientId, assignmentId);
    if (!ownerId || !current) {
      return { ok: false, message: 'No se encontró el programa asignado.' };
    }
    // Red de seguridad antes de escribir: ningún campo prohibido a ningún nivel.
    const leaked = publishCore.findForbiddenKeys({ program: current.program, progress: current.progress });
    if (leaked.length) {
      return { ok: false, message: 'Se detectaron datos no permitidos en la publicación; se canceló.' };
    }

    ctx.busyClientId = clientId;
    notifyChanged();
    const publishedAt = new Date().toISOString();
    try {
      // 1) Historial (una fila por sesión).
      if (current.progress.length) {
        const progressRows = current.progress.map((record) => ({
          owner_id: ownerId,
          client_id: clientId,
          session_id: record.sessionId,
          session_date: record.date || null,
          title: record.title || null,
          data: record,
          published_at: publishedAt
        }));
        const progressResult = await withTimeout(
          client().from('student_progress').upsert(progressRows, { onConflict: 'owner_id,client_id,session_id' }),
          { error: { message: 'timeout', timedOut: true }, status: 0 }
        );
        if (progressResult.error) {
          return { ok: false, message: describeError(progressResult.error, progressResult.status) };
        }
      }
      // 2) Programa (lleva la huella de lo publicado para el indicador).
      const data = {
        schema: current.program.schema,
        assignmentId: current.program.assignmentId,
        programName: current.program.programName,
        days: current.program.days,
        sessionsPublished: current.progress.length,
        contentHash: current.contentHash
      };
      const programResult = await withTimeout(
        client().from('student_programs').upsert({
          owner_id: ownerId,
          client_id: clientId,
          assignment_id: assignmentId,
          program_id: current.assignment.programId || null,
          title: current.program.programName,
          data,
          active: true,
          published_at: publishedAt
        }, { onConflict: 'owner_id,client_id,assignment_id' }),
        { error: { message: 'timeout', timedOut: true }, status: 0 }
      );
      if (programResult.error) {
        return { ok: false, message: describeError(programResult.error, programResult.status) };
      }
      // 3) Solo un programa activo por alumno: los anteriores quedan inactivos.
      const deactivate = await withTimeout(
        client().from('student_programs').update({ active: false }).eq('owner_id', ownerId).eq('client_id', clientId).neq('assignment_id', assignmentId),
        { error: { message: 'timeout', timedOut: true }, status: 0 }
      );
      if (deactivate.error) {
        return { ok: false, message: `${describeError(deactivate.error, deactivate.status)} El programa nuevo quedó publicado, pero el anterior podría seguir visible.` };
      }
      ctx.published.set(clientId, { assignmentId, publishedAt, contentHash: current.contentHash });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: 'No se pudo publicar. Inténtalo de nuevo.' };
    } finally {
      ctx.busyClientId = '';
      notifyChanged();
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-publish-client]');
    if (!button || button.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    confirmPublish(button.getAttribute('data-publish-client'), button.getAttribute('data-publish-assignment'));
  }, true);

  window.addEventListener('valhalla:auth-changed', (event) => {
    const detail = event.detail || {};
    if (detail.role !== 'coach' || !detail.user?.id) {
      return;
    }
    ctx.ownerId = detail.user.id;
    ctx.online = !detail.offline;
    ctx.published = new Map();
    if (ctx.online) {
      loadPublished(ctx.ownerId);
    } else {
      notifyChanged();
    }
  });

  window.addEventListener('valhalla:auth-locked', () => {
    ctx.ownerId = '';
    ctx.online = false;
    ctx.loaded = false;
    ctx.published = new Map();
    closeModal();
  });

  // Al cambiar datos locales, el indicador se recalcula ("tiene cambios sin publicar").
  window.addEventListener('valhalla:state-saved', () => {
    if (ctx.loaded) {
      notifyChanged();
    }
  });

  window.VALHALLA.publish = { renderStatus, publish };
})();
