(function () {
  // Sincronización con coach_state.
  // A2: subida inicial y carga al iniciar sesión.
  // A3: guardado automático con control de versión ("where version = la que leí").
  // Reglas:
  // - Siempre se guarda primero en el equipo; después en la nube.
  // - Nunca combina datos: ante un conflicto se elige un lado, y antes de reemplazar
  //   se descarga un respaldo del lado que se pierde. Por defecto no se cambia nada.
  // - Un fallo de red nunca pierde cambios: quedan en el equipo y se suben después.
  // - Las finanzas, el perfil y la sesión nunca suben (ver sync-core.js).
  window.VALHALLA = window.VALHALLA || {};

  const authApi = window.VALHALLA.auth;
  const dataApi = window.VALHALLA.data;
  const syncCore = window.VALHALLA.syncCore;
  const supabaseApi = window.VALHALLA.supabase;
  const cloudConfigured = Boolean(supabaseApi && typeof supabaseApi.isCloudEnabled === 'function' && supabaseApi.isCloudEnabled());

  if (!cloudConfigured || !authApi || !dataApi || !syncCore || window.VALHALLA.onboarding?.active) {
    return;
  }

  const SYNC_META_KEY = 'valhalla_sync_meta';
  const READ_TIMEOUT_MS = 15000;
  const WRITE_TIMEOUT_MS = 30000;
  // Espera para agrupar cambios seguidos en un solo guardado.
  const AUTOSAVE_DELAY_MS = 1500;
  // Reintentos cuando Supabase no responde (además de reintentar al volver la conexión).
  const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
  const COUNT_LABELS = [
    ['clientes', 'Clientes'],
    ['programas', 'Programas'],
    ['asignaciones', 'Asignaciones'],
    ['ejercicios', 'Ejercicios de la galería'],
    ['sesiones', 'Sesiones'],
    ['asistencias', 'Registros de asistencia']
  ];

  let runSequence = 0;
  // Estado del guardado automático para la sesión actual.
  const ctx = {
    ownerId: '',
    ready: false,        // hay una versión conocida en la nube y el equipo la sigue
    status: '',
    timer: null,
    runRetryTimer: null,
    runRetryIndex: 0,
    saving: false,
    dirty: false,
    retryIndex: 0,
    conflictRow: null,
    guardPromptedHash: ''
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) {
      return 'sin fecha';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'sin fecha' : date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function withTimeout(promise, ms, fallback) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
  }

  function readMeta() {
    try {
      return JSON.parse(localStorage.getItem(SYNC_META_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function saveMeta(meta) {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  }

  // Marca que este equipo sigue la versión `row` de la nube.
  function writeMeta(ownerId, row, { keepSyncedAt = false } = {}) {
    const previous = readMeta();
    saveMeta({
      ownerId,
      version: row.version,
      cloudHash: syncCore.fingerprint(row.data),
      cloudClients: syncCore.summarize(row.data).clientes,
      syncedAt: keepSyncedAt && previous?.syncedAt ? previous.syncedAt : new Date().toISOString(),
      approvedHash: previous?.ownerId === ownerId ? previous.approvedHash || '' : ''
    });
  }

  // Estado en memoria de la app (lo mismo que persist() guarda). Si la app aún no
  // cargó, se lee lo guardado en el equipo.
  function currentLocalState() {
    return window.VALHALLA.appState?.get?.() || dataApi.loadState();
  }

  function localStoredRaw() {
    const keys = [dataApi.STORAGE_KEY, ...(dataApi.LEGACY_STORAGE_KEYS || [])];
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        return { key, value };
      }
    }
    return null;
  }

  function downloadJson(text, filename) {
    const blob = new Blob([text], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }

  function timestampForFile() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  // Respaldo del equipo: estado completo, incluidas las finanzas. Solo se descarga.
  function downloadLocalBackup(label) {
    const name = `valhalla-respaldo-${label}-${timestampForFile()}.json`;
    downloadJson(dataApi.exportState(currentLocalState()), name);
    return name;
  }

  // Respaldo de lo que hay en la nube (solo los datos sincronizados).
  function downloadCloudBackup(row) {
    const name = `valhalla-respaldo-nube-v${row.version}-${timestampForFile()}.json`;
    downloadJson(JSON.stringify(row.data, null, 2), name);
    return name;
  }

  // ---------------------------------------------------------------------------
  // Acceso a coach_state
  // ---------------------------------------------------------------------------

  function client() {
    return authApi.getClient();
  }

  async function fetchCloudRow(ownerId) {
    const timedOut = { data: null, error: { message: 'timeout' }, status: 0, timedOut: true };
    try {
      const result = await withTimeout(
        client().from('coach_state').select('owner_id, data, version, updated_at').eq('owner_id', ownerId).maybeSingle(),
        READ_TIMEOUT_MS,
        timedOut
      );
      if (result.error) {
        return { row: null, error: result.error, unavailable: result.timedOut || authApi.isUnavailableError(result.error, result.status) };
      }
      return { row: result.data || null };
    } catch (error) {
      return { row: null, error, unavailable: true };
    }
  }

  // Guarda con control de versión: solo si la nube sigue en `expectedVersion`.
  async function updateCloudRow(ownerId, expectedVersion, payload) {
    try {
      const result = await withTimeout(
        client().from('coach_state')
          .update({ data: payload, version: expectedVersion + 1 })
          .eq('owner_id', ownerId)
          .eq('version', expectedVersion)
          .select('version, updated_at'),
        WRITE_TIMEOUT_MS,
        { data: null, error: { message: 'timeout', timedOut: true }, status: 0 }
      );
      const unavailable = Boolean(result.error && (result.error.timedOut || authApi.isUnavailableError(result.error, result.status)));
      return { rows: result.data, error: result.error, status: result.status, unavailable };
    } catch (error) {
      return { rows: null, error, status: 0, unavailable: true };
    }
  }

  function describeWriteError(error, status) {
    const code = String(error?.code || '');
    if (error?.timedOut || authApi.isUnavailableError(error, status)) {
      return 'El servidor no respondió.';
    }
    if (code === '23505' || status === 409) {
      return 'La nube ya tiene datos de este entrenador (quizás subidos desde otro equipo).';
    }
    if (code === '23514') {
      return 'La nube rechazó los datos porque incluyen información que no debe subir.';
    }
    if (code === '42501' || status === 401 || status === 403) {
      return 'La nube rechazó el guardado: tu cuenta no tiene permiso.';
    }
    return 'La nube rechazó el guardado.';
  }

  // ---------------------------------------------------------------------------
  // Interfaz: indicador, panel y diálogo
  // ---------------------------------------------------------------------------

  const STATUS = {
    checking: ['Nube: verificando…', 'neutral'],
    synced: ['Nube: sincronizado', 'ok'],
    saving: ['Nube: guardando…', 'neutral'],
    pending: ['Nube: pendiente de sincronizar', 'warn'],
    blocked: ['Nube: requiere confirmación', 'warn'],
    conflict: ['Nube: conflicto', 'bad'],
    notUploaded: ['Nube: sin subir', 'warn'],
    offline: ['Nube: sin conexión', 'warn'],
    unavailable: ['Nube: no disponible', 'warn'],
    loading: ['Nube: cargando…', 'neutral'],
    error: ['Nube: error', 'bad']
  };

  function setStatus(kind, detail = '') {
    ctx.status = kind;
    const [text, tone] = STATUS[kind] || [kind, 'neutral'];
    const actions = document.querySelector('.app-header .header-actions');
    if (!actions) {
      return;
    }
    document.getElementById('cloudModeBadge')?.classList.add('hidden');
    let badge = document.getElementById('syncStatusBadge');
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.id = 'syncStatusBadge';
      badge.className = 'badge sync-badge';
      badge.addEventListener('click', onBadgeClick);
      actions.insertBefore(badge, document.getElementById('authHeaderLogout'));
    }
    badge.textContent = detail ? `${text} (${detail})` : text;
    window.dispatchEvent(new CustomEvent('valhalla:sync-status', { detail: { status: kind } }));
    badge.dataset.tone = tone;
    badge.dataset.status = kind;
    badge.title = ({
      pending: 'Los cambios están guardados en este equipo y se subirán a la nube. Toca para reintentar ahora.',
      conflict: 'Otra copia guardó cambios en la nube. Toca para elegir qué datos usar.',
      blocked: 'El guardado automático se detuvo por seguridad. Toca para revisar.'
    })[kind] || '';
  }

  function onBadgeClick() {
    if (ctx.status === 'conflict' && ctx.conflictRow) {
      showConflict(ctx.ownerId, ctx.conflictRow);
    } else if (ctx.status === 'blocked') {
      ctx.guardPromptedHash = '';
      saveToCloud();
    } else if (ctx.status === 'pending' && ctx.ready) {
      ctx.retryIndex = 0;
      saveToCloud();
    }
  }

  function panelHost() {
    let panel = document.getElementById('syncPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'syncPanel';
      panel.className = 'card sync-panel';
      panel.setAttribute('aria-live', 'polite');
      const app = document.getElementById('app');
      const anchor = document.getElementById('authOfflineBanner') || app.querySelector('.app-header');
      app.insertBefore(panel, anchor?.nextSibling || app.firstChild);
    }
    return panel;
  }

  function showPanel(html, tone) {
    const panel = panelHost();
    panel.innerHTML = html;
    panel.dataset.tone = tone || 'neutral';
    panel.classList.remove('hidden');
    return panel;
  }

  function showClosablePanel(title, message, tone) {
    showPanel(`<h3>${title}</h3><p class="muted">${message}</p><div class="inline-actions"><button class="secondary" type="button" data-sync-close>Cerrar</button></div>`, tone)
      .querySelector('[data-sync-close]').addEventListener('click', hidePanel);
  }

  function hidePanel() {
    document.getElementById('syncPanel')?.remove();
  }

  function closeModal() {
    document.getElementById('syncModal')?.remove();
  }

  function openModal(html) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'syncModal';
    overlay.className = 'sync-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="sync-modal-card card">${html}</div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function stopAutosave() {
    clearTimeout(ctx.runRetryTimer);
    ctx.runRetryTimer = null;
    clearTimeout(ctx.timer);
    ctx.timer = null;
    ctx.ready = false;
    ctx.dirty = false;
    ctx.retryIndex = 0;
  }

  function clearUi() {
    runSequence += 1;
    stopAutosave();
    ctx.ownerId = '';
    ctx.conflictRow = null;
    ctx.status = '';
    closeModal();
    hidePanel();
    document.getElementById('syncStatusBadge')?.remove();
    updateRestoreLabel();
  }

  function summaryTable(columns) {
    // columns: [{ title, summary, extra: [[label, value]] }]
    const header = columns.map((column) => `<th scope="col">${escapeHtml(column.title)}</th>`).join('');
    const rows = COUNT_LABELS.map(([field, label]) => {
      const cells = columns.map((column) => `<td>${Number(column.summary[field] || 0)}</td>`).join('');
      const differs = columns.length > 1 && columns.some((column) => column.summary[field] !== columns[0].summary[field]);
      return `<tr${differs ? ' class="sync-diff"' : ''}><th scope="row">${label}</th>${cells}</tr>`;
    }).join('');
    const extraLabels = columns[0].extra ? columns[0].extra.map(([label]) => label) : [];
    const extraRows = extraLabels.map((label, index) => `<tr><th scope="row">${escapeHtml(label)}</th>${columns.map((column) => `<td>${escapeHtml(column.extra[index][1])}</td>`).join('')}</tr>`).join('');
    return `<table class="sync-table">${columns.length > 1 ? `<thead><tr><th></th>${header}</tr></thead>` : ''}<tbody>${rows}${extraRows}</tbody></table>`;
  }

  // Confirmación en dos pasos con respaldo previo. `download` descarga el respaldo y
  // devuelve su nombre; `onConfirm` hace el reemplazo. Nada cambia sin el segundo paso.
  function confirmWithBackup({ title, backupDescription, confirmLabel, warning, download, onConfirm, onCancel }) {
    let backupName = '';
    try {
      backupName = download();
    } catch (error) {
      backupName = '';
    }
    if (!backupName) {
      openModal(`
        <h2>No se pudo descargar el respaldo</h2>
        <p>Por seguridad no se cambió nada.</p>
        <div class="inline-actions"><button class="primary" type="button" data-sync-close>Entendido</button></div>`)
        .querySelector('[data-sync-close]').addEventListener('click', () => { closeModal(); onCancel?.(); });
      return;
    }
    const modal = openModal(`
      <h2>${title}</h2>
      <p>Se inició la descarga de <strong>${escapeHtml(backupName)}</strong> ${backupDescription}</p>
      <p>Revisa que aparezca en tus descargas antes de continuar.</p>
      ${warning ? `<p class="notice auth-message auth-message--bad">${warning}</p>` : ''}
      <p class="notice auth-message hidden" data-sync-message role="alert"></p>
      <div class="sync-choice-actions">
        <button class="primary" type="button" data-sync-cancel>Cancelar (no cambiar nada)</button>
        <button class="secondary" type="button" data-sync-again>Descargar el respaldo de nuevo</button>
        <button class="danger" type="button" data-sync-confirm-replace>${confirmLabel}</button>
      </div>`);
    const message = modal.querySelector('[data-sync-message]');
    modal.querySelector('[data-sync-cancel]').focus();
    modal.querySelector('[data-sync-cancel]').addEventListener('click', () => { closeModal(); onCancel?.(); });
    modal.querySelector('[data-sync-again]').addEventListener('click', () => download());
    modal.querySelector('[data-sync-confirm-replace]').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      const result = await onConfirm();
      if (result && !result.ok) {
        event.currentTarget.disabled = false;
        message.textContent = result.message;
        message.classList.remove('hidden');
        message.classList.add('auth-message--bad');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Subida inicial (no hay fila en la nube)
  // ---------------------------------------------------------------------------

  function offerUpload(ownerId) {
    stopAutosave();
    setStatus('notUploaded');
    const summary = syncCore.summarize(syncCore.buildCloudPayload(currentLocalState()));
    const panel = showPanel(`
      <h3>Tus datos aún no están en la nube</h3>
      <p class="muted">Puedes subir los datos de este equipo para tenerlos respaldados y usarlos en otros dispositivos. Las finanzas se quedan solo aquí.</p>
      ${summaryTable([{ title: 'Este equipo', summary }])}
      <div class="inline-actions">
        <button class="primary" type="button" data-sync-upload>Subir mis datos a la nube</button>
        <button class="secondary" type="button" data-sync-dismiss>Ahora no</button>
      </div>`, 'warn');
    panel.querySelector('[data-sync-upload]').addEventListener('click', () => confirmUpload(ownerId));
    panel.querySelector('[data-sync-dismiss]').addEventListener('click', hidePanel);
  }

  function confirmUpload(ownerId) {
    let payload;
    try {
      payload = syncCore.buildCloudPayload(currentLocalState());
    } catch (error) {
      showPanel(`<h3>No se pudo preparar la subida</h3><p>${escapeHtml(error.message)}</p>`, 'bad');
      return;
    }
    const summary = syncCore.summarize(payload);
    const modal = openModal(`
      <h2>Subir mis datos a la nube</h2>
      <p>Se subirá esta información de este equipo:</p>
      ${summaryTable([{ title: 'Este equipo', summary }])}
      <p class="muted">Se suben: clientes, entrenamientos, galería de ejercicios, ficha deportiva, nutrición y el WhatsApp del entrenador.</p>
      <p class="muted"><strong>No se suben</strong> (se quedan solo en este equipo): cuentas, categorías, movimientos, gastos recurrentes, metas, deudas, perfil financiero y presupuestos.</p>
      <label class="sync-confirm"><input type="checkbox" data-sync-ack> Revisé el resumen y quiero subir estos datos</label>
      <div class="inline-actions">
        <button class="secondary" type="button" data-sync-cancel>Cancelar</button>
        <button class="primary" type="button" data-sync-confirm disabled>Subir</button>
      </div>`);
    const ack = modal.querySelector('[data-sync-ack]');
    const confirmButton = modal.querySelector('[data-sync-confirm]');
    ack.addEventListener('change', () => { confirmButton.disabled = !ack.checked; });
    modal.querySelector('[data-sync-cancel]').addEventListener('click', closeModal);
    modal.querySelector('[data-sync-cancel]').focus();
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      ack.disabled = true;
      confirmButton.textContent = 'Subiendo…';
      let result;
      try {
        // Se guarda en el equipo exactamente lo que se sube (memoria = equipo = nube).
        window.VALHALLA.appState?.saveNow?.();
        payload = syncCore.buildCloudPayload(currentLocalState());
        result = await uploadInitial(ownerId, payload);
      } catch (error) {
        result = { ok: false, message: 'No se pudo preparar la subida en este equipo. No se subió nada.' };
      }
      closeModal();
      if (result.ok) {
        startAutosave(ownerId);
        setStatus('synced');
        showClosablePanel('✓ Datos subidos y verificados', `La nube tiene una copia idéntica a este equipo (versión ${result.version}). Desde ahora los cambios se guardan solos.`, 'ok');
      } else {
        setStatus('notUploaded');
        showPanel(`<h3>No se completó la subida</h3><p>${escapeHtml(result.message)}</p><p class="muted">Tus datos locales no cambiaron.</p><div class="inline-actions"><button class="secondary" type="button" data-sync-retry>Volver a revisar</button></div>`, 'bad')
          .querySelector('[data-sync-retry]').addEventListener('click', () => run(ownerId));
      }
    });
  }

  // Inserta con versión 1, vuelve a leer y compara. Si no coincide, deshace la fila
  // que se acaba de crear y no marca el equipo como sincronizado.
  async function uploadInitial(ownerId, payload) {
    let insertError = null;
    let insertOk = false;
    try {
      const result = await withTimeout(
        client().from('coach_state').insert({ owner_id: ownerId, data: payload, version: 1 }),
        WRITE_TIMEOUT_MS,
        { error: { message: 'timeout', timedOut: true }, status: 0 }
      );
      insertError = result.error ? { error: result.error, status: result.status } : null;
      insertOk = !result.error;
    } catch (error) {
      insertError = { error, status: 0 };
    }

    const definitiveRejection = insertError && !insertError.error.timedOut && !authApi.isUnavailableError(insertError.error, insertError.status);
    if (definitiveRejection) {
      return { ok: false, message: `${describeWriteError(insertError.error, insertError.status)} No se subió nada.` };
    }

    // Si la respuesta se perdió, la fila pudo quedar guardada: siempre se verifica leyendo.
    const read = await fetchCloudRow(ownerId);
    if (read.error) {
      return { ok: false, message: 'No se pudo confirmar la subida porque el servidor no responde. Este equipo no se marcó como sincronizado; la próxima vez que entres se revisará de nuevo.' };
    }
    if (!read.row) {
      return { ok: false, message: insertError ? `${describeWriteError(insertError.error, insertError.status)} No se subió nada.` : 'La subida no quedó guardada en la nube.' };
    }

    const comparison = syncCore.compare(payload, read.row.data);
    if (comparison.identical && read.row.version === 1) {
      writeMeta(ownerId, read.row);
      return { ok: true, version: read.row.version };
    }

    const details = [
      comparison.missingInCloud.length ? `faltan ${comparison.missingInCloud.join(', ')}` : '',
      comparison.extraInCloud.length ? `sobran ${comparison.extraInCloud.join(', ')}` : '',
      comparison.countDifferences.length ? `conteos distintos en ${comparison.countDifferences.join(', ')}` : '',
      comparison.keysMatch && comparison.countsMatch ? 'el contenido no es idéntico' : ''
    ].filter(Boolean).join('; ');

    if (!insertOk) {
      return { ok: false, message: `La nube tiene datos distintos a los de este equipo (${details}). No se marcó como sincronizado.` };
    }
    try {
      const undo = await withTimeout(
        client().from('coach_state').delete().eq('owner_id', ownerId).eq('version', read.row.version),
        WRITE_TIMEOUT_MS,
        { error: { message: 'timeout' } }
      );
      if (undo.error) {
        throw undo.error;
      }
      return { ok: false, message: `La verificación falló: lo guardado en la nube no coincide con este equipo (${details}). Se deshizo la subida.` };
    } catch (error) {
      return { ok: false, message: `La verificación falló (${details}) y no se pudo deshacer la copia en la nube. No vuelvas a subir hasta revisarlo.` };
    }
  }

  // ---------------------------------------------------------------------------
  // Carga desde la nube
  // ---------------------------------------------------------------------------

  // Escribe lo de la nube en este equipo, verifica y recarga. Si la verificación
  // falla, restaura exactamente lo que había antes.
  function replaceLocalWithCloud(ownerId, row) {
    stopAutosave();
    const previous = localStoredRaw();
    const nextState = syncCore.applyCloudData(currentLocalState(), row.data);
    try {
      dataApi.saveState(nextState);
      // Se compara contra lo mismo normalizado por la app: así se detecta un guardado
      // fallido sin bloquear por diferencias de forma (p. ej. datos de otra versión).
      const expected = syncCore.buildCloudPayload(dataApi.importState(JSON.stringify(nextState)));
      const check = syncCore.compare(syncCore.buildCloudPayload(dataApi.loadState()), expected);
      if (!check.identical) {
        throw new Error('Los datos cargados no coinciden con la nube.');
      }
      writeMeta(ownerId, row);
    } catch (error) {
      if (previous) {
        localStorage.setItem(previous.key, previous.value);
      } else {
        localStorage.removeItem(dataApi.STORAGE_KEY);
      }
      return { ok: false, message: `${error.message || 'No se pudo cargar la nube.'} Se restauraron los datos que tenía este equipo.` };
    }
    window.location.reload();
    return { ok: true };
  }

  function loadIntoEmptyDevice(ownerId, row) {
    setStatus('loading');
    showPanel('<h3>Cargando tus datos desde la nube…</h3>', 'neutral');
    const result = replaceLocalWithCloud(ownerId, row);
    if (!result.ok) {
      setStatus('error');
      showPanel(`<h3>No se pudieron cargar los datos de la nube</h3><p>${escapeHtml(result.message)}</p>`, 'bad');
    }
  }

  // ---------------------------------------------------------------------------
  // Conflicto: elegir un lado (nunca se combinan)
  // ---------------------------------------------------------------------------

  function showConflict(ownerId, row) {
    stopAutosave();
    ctx.conflictRow = row;
    setStatus('conflict');
    const localPayload = syncCore.buildCloudPayload(currentLocalState());
    const localSummary = syncCore.summarize(localPayload);
    const cloudSummary = syncCore.summarize(row.data);
    const meta = readMeta();
    const lastSync = meta && meta.ownerId === ownerId ? `${formatDate(meta.syncedAt)} (versión ${meta.version})` : 'nunca';
    const diff = syncCore.clientDifferences(localPayload, row.data);
    const list = (names) => escapeHtml(names.slice(0, 5).join(', ') + (names.length > 5 ? ` y ${names.length - 5} más` : ''));
    const diffHtml = [
      diff.onlyLocal.length ? `<li>Solo en este equipo: ${list(diff.onlyLocal)}</li>` : '',
      diff.onlyCloud.length ? `<li>Solo en la nube: ${list(diff.onlyCloud)}</li>` : '',
      diff.changed.length ? `<li>Con cambios distintos: ${list(diff.changed)}</li>` : ''
    ].join('');

    const modal = openModal(`
      <h2>Los datos de este equipo y los de la nube son distintos</h2>
      <p>Otra copia guardó cambios en la nube o este equipo no está al día. No se combinan: elige qué datos conservar. Si no estás seguro, no cambies nada.</p>
      ${summaryTable([
        { title: 'Este equipo', summary: localSummary, extra: [['Último cambio registrado', formatDate(localSummary.ultimoCambio)], ['Sincronizado / guardado en la nube', `Última sincronización: ${lastSync}`]] },
        { title: 'Nube', summary: cloudSummary, extra: [['Último cambio registrado', formatDate(cloudSummary.ultimoCambio)], ['Sincronizado / guardado en la nube', `Guardado: ${formatDate(row.updated_at)} (versión ${row.version})`]] }
      ])}
      ${diffHtml ? `<div class="sync-diff-list"><strong>Clientes que cambian</strong><ul>${diffHtml}</ul></div>` : ''}
      <div class="sync-choice-actions">
        <button class="primary" type="button" data-sync-later>No cambiar nada por ahora</button>
        <button class="danger" type="button" data-sync-take-cloud>Quedarme con la nube…</button>
        <button class="danger" type="button" data-sync-take-local>Quedarme con este equipo…</button>
      </div>
      <p class="muted">Mientras no elijas, los cambios se siguen guardando en este equipo pero no se suben. Las finanzas de este equipo no se tocan en ningún caso.</p>`);
    modal.querySelector('[data-sync-later]').focus();
    modal.querySelector('[data-sync-later]').addEventListener('click', () => {
      closeModal();
      showClosablePanel('Conflicto sin resolver', 'No se cambió nada. Toca el indicador "Nube: conflicto" cuando quieras elegir.', 'warn');
    });
    modal.querySelector('[data-sync-take-cloud]').addEventListener('click', () => confirmWithBackup({
      title: 'Respaldo de este equipo descargado',
      backupDescription: 'con todos los datos de este equipo, incluidas las finanzas.',
      confirmLabel: 'Ya tengo el respaldo: reemplazar este equipo con la nube',
      download: () => downloadLocalBackup('equipo-antes-de-nube'),
      onConfirm: () => replaceLocalWithCloud(ownerId, row),
      onCancel: () => showConflict(ownerId, row)
    }));
    modal.querySelector('[data-sync-take-local]').addEventListener('click', () => {
      const guard = syncCore.evaluateUploadGuard(localSummary.clientes, cloudSummary.clientes);
      confirmWithBackup({
        title: 'Respaldo de la nube descargado',
        backupDescription: `con los datos que hoy tiene la nube (versión ${row.version}).`,
        confirmLabel: 'Ya tengo el respaldo: reemplazar la nube con este equipo',
        warning: guard.blocked ? `Atención: este equipo tiene ${guard.local} clientes y la nube ${guard.cloud}.` : '',
        download: () => downloadCloudBackup(row),
        onConfirm: () => keepLocal(ownerId, row),
        onCancel: () => showConflict(ownerId, row)
      });
    });
  }

  // Sube este equipo sobre la versión de la nube que se acaba de ver.
  async function keepLocal(ownerId, row) {
    window.VALHALLA.appState?.saveNow?.();
    const payload = syncCore.buildCloudPayload(currentLocalState());
    const result = await updateCloudRow(ownerId, row.version, payload);
    const outcome = syncCore.classifySaveResult(result);
    if (outcome === 'saved') {
      writeMeta(ownerId, { version: result.rows[0].version, data: payload });
      closeModal();
      ctx.conflictRow = null;
      startAutosave(ownerId);
      setStatus('synced');
      showClosablePanel('✓ La nube quedó igual a este equipo', `Versión ${result.rows[0].version}.`, 'ok');
      return { ok: true };
    }
    if (outcome === 'conflict') {
      const fetched = await fetchCloudRow(ownerId);
      if (fetched.row) {
        showConflict(ownerId, fetched.row);
        return { ok: true };
      }
    }
    return { ok: false, message: outcome === 'retry' ? 'El servidor no respondió. No se cambió nada; inténtalo de nuevo.' : `${describeWriteError(result.error, result.status)} No se cambió nada.` };
  }

  // ---------------------------------------------------------------------------
  // Guardado automático (A3)
  // ---------------------------------------------------------------------------

  function startAutosave(ownerId) {
    ctx.ownerId = ownerId;
    ctx.ready = true;
    ctx.conflictRow = null;
    ctx.retryIndex = 0;
    updateRestoreLabel();
  }

  function scheduleSave(delay = AUTOSAVE_DELAY_MS) {
    if (!ctx.ready) {
      return;
    }
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(saveToCloud, delay);
  }

  function onStateSaved() {
    if (!ctx.ready) {
      return;
    }
    // Ya está guardado en el equipo. Se agrupan los cambios seguidos en un guardado.
    setStatus('saving');
    scheduleSave();
  }

  function scheduleRetry() {
    const delay = RETRY_DELAYS_MS[Math.min(ctx.retryIndex, RETRY_DELAYS_MS.length - 1)];
    ctx.retryIndex += 1;
    scheduleSave(delay);
  }

  async function saveToCloud() {
    clearTimeout(ctx.timer);
    ctx.timer = null;
    if (!ctx.ready) {
      return;
    }
    if (ctx.saving) {
      ctx.dirty = true;
      return;
    }
    const meta = readMeta();
    if (!meta || meta.ownerId !== ctx.ownerId) {
      stopAutosave();
      return;
    }

    let payload;
    try {
      payload = syncCore.buildCloudPayload(currentLocalState());
    } catch (error) {
      setStatus('error');
      showClosablePanel('No se pudo guardar en la nube', escapeHtml(error.message), 'bad');
      return;
    }
    const payloadHash = syncCore.fingerprint(payload);
    const summary = syncCore.summarize(payload);
    const decision = syncCore.decideAutosave({ payloadHash, localClients: summary.clientes, meta });
    if (decision === 'skip') {
      setStatus('synced');
      return;
    }
    if (decision === 'confirm') {
      setStatus('blocked');
      if (ctx.guardPromptedHash !== payloadHash) {
        ctx.guardPromptedHash = payloadHash;
        showGuard(payloadHash, summary.clientes, meta);
      }
      return;
    }

    ctx.saving = true;
    ctx.dirty = false;
    setStatus('saving');
    const ownerId = ctx.ownerId;
    const result = await updateCloudRow(ownerId, meta.version, payload);
    ctx.saving = false;
    if (!ctx.ready || ctx.ownerId !== ownerId) {
      return;
    }
    const outcome = syncCore.classifySaveResult(result);

    if (outcome === 'saved') {
      writeMeta(ownerId, { version: result.rows[0].version, data: payload });
      ctx.retryIndex = 0;
      if (ctx.dirty || syncCore.fingerprint(syncCore.buildCloudPayload(currentLocalState())) !== payloadHash) {
        ctx.dirty = false;
        scheduleSave(0);
        return;
      }
      setStatus('synced');
      return;
    }

    if (outcome === 'retry') {
      // El cambio sigue guardado en el equipo; se reintenta.
      setStatus('pending', 'sin conexión');
      scheduleRetry();
      return;
    }

    if (outcome === 'conflict') {
      const fetched = await fetchCloudRow(ownerId);
      if (fetched.error) {
        setStatus('pending', 'sin conexión');
        scheduleRetry();
        return;
      }
      if (!fetched.row) {
        offerUpload(ownerId);
        return;
      }
      // Si la nube ya tiene exactamente esto (respuesta perdida de un guardado propio),
      // no hay conflicto: se adopta esa versión.
      if (syncCore.fingerprint(fetched.row.data) === payloadHash) {
        writeMeta(ownerId, fetched.row);
        setStatus('synced');
        return;
      }
      showConflict(ownerId, fetched.row);
      return;
    }

    setStatus('pending', 'error');
    showClosablePanel('No se pudo guardar en la nube', `${describeWriteError(result.error, result.status)} Tus cambios siguen guardados en este equipo.`, 'bad');
  }

  // Protección: subir 0 clientes o muchos menos de los que hay en la nube.
  function showGuard(payloadHash, localClients, meta) {
    const empty = localClients === 0;
    const modal = openModal(`
      <h2>Guardado automático detenido por seguridad</h2>
      <p>${empty
        ? `Este equipo tiene <strong>0 clientes</strong> y la nube tiene <strong>${meta.cloudClients}</strong>.`
        : `Este equipo tiene <strong>${localClients} cliente${localClients === 1 ? '' : 's'}</strong> y la nube tiene <strong>${meta.cloudClients}</strong> (menos de la mitad).`}</p>
      <p>Si guardas, la nube quedará así. Si no fue intencional, no guardes: tus datos en la nube siguen intactos.</p>
      <label class="sync-confirm"><input type="checkbox" data-sync-ack> Entiendo y quiero guardar esto en la nube</label>
      <div class="sync-choice-actions">
        <button class="primary" type="button" data-sync-cancel>No guardar en la nube</button>
        <button class="danger" type="button" data-sync-confirm disabled>Guardar igualmente</button>
      </div>`);
    const ack = modal.querySelector('[data-sync-ack]');
    const confirmButton = modal.querySelector('[data-sync-confirm]');
    ack.addEventListener('change', () => { confirmButton.disabled = !ack.checked; });
    modal.querySelector('[data-sync-cancel]').focus();
    modal.querySelector('[data-sync-cancel]').addEventListener('click', () => {
      closeModal();
      showClosablePanel('No se guardó en la nube', 'Los cambios quedan solo en este equipo. Toca el indicador "Nube: requiere confirmación" para revisarlo de nuevo.', 'warn');
    });
    confirmButton.addEventListener('click', () => {
      const current = readMeta();
      saveMeta({ ...current, approvedHash: payloadHash });
      closeModal();
      saveToCloud();
    });
  }

  // ---------------------------------------------------------------------------
  // Restaurar un respaldo en la nube (reemplaza a "Importar respaldo")
  // ---------------------------------------------------------------------------

  function updateRestoreLabel() {
    const label = document.querySelector('label[for="fileInput"]');
    if (label) {
      label.textContent = ctx.ready ? 'Restaurar en la nube (desde un respaldo)' : 'Importar respaldo';
    }
  }

  // `imported`: estado ya validado del archivo. `apply`: reemplaza el estado de la app
  // y lo guarda en el equipo (nunca combina listas).
  function restoreFromBackup(imported, apply) {
    const backupPayload = syncCore.buildCloudPayload(imported);
    const backupSummary = syncCore.summarize(backupPayload);
    const currentSummary = syncCore.summarize(syncCore.buildCloudPayload(currentLocalState()));
    const meta = readMeta();
    const modal = openModal(`
      <h2>Restaurar en la nube</h2>
      <p>El respaldo reemplazará por completo los datos de este equipo y, después, los de la nube. No se combinan.</p>
      ${summaryTable([
        { title: 'Ahora', summary: currentSummary },
        { title: 'Respaldo', summary: backupSummary }
      ])}
      <p class="muted">Antes de restaurar se descargará un respaldo de los datos actuales.</p>
      <label class="sync-confirm"><input type="checkbox" data-sync-ack> Quiero reemplazar mis datos por este respaldo</label>
      <div class="sync-choice-actions">
        <button class="primary" type="button" data-sync-cancel>Cancelar</button>
        <button class="danger" type="button" data-sync-confirm disabled>Continuar</button>
      </div>`);
    const ack = modal.querySelector('[data-sync-ack]');
    const confirmButton = modal.querySelector('[data-sync-confirm]');
    ack.addEventListener('change', () => { confirmButton.disabled = !ack.checked; });
    modal.querySelector('[data-sync-cancel]').focus();
    modal.querySelector('[data-sync-cancel]').addEventListener('click', closeModal);
    confirmButton.addEventListener('click', () => confirmWithBackup({
      title: 'Respaldo de los datos actuales descargado',
      backupDescription: 'con todos los datos de este equipo antes de restaurar, incluidas las finanzas.',
      confirmLabel: 'Ya tengo el respaldo: restaurar',
      download: () => downloadLocalBackup('antes-de-restaurar'),
      onConfirm: async () => {
        // La confirmación explícita aprueba subir este contenido aunque reduzca datos.
        const approvedHash = syncCore.fingerprint(backupPayload);
        if (ctx.ready && meta) {
          saveMeta({ ...readMeta(), approvedHash });
        }
        apply();
        closeModal();
        if (ctx.ready) {
          await saveToCloud();
          if (ctx.status === 'synced') {
            showClosablePanel('✓ Respaldo restaurado en la nube', `Versión ${readMeta()?.version}.`, 'ok');
          } else if (ctx.status === 'pending') {
            showClosablePanel('Respaldo restaurado en este equipo', 'Se subirá a la nube cuando vuelva la conexión.', 'warn');
          }
        } else {
          showClosablePanel('Respaldo restaurado en este equipo', 'La nube no se actualizó porque este equipo no está sincronizado.', 'warn');
        }
        return { ok: true };
      }
    }));
  }

  // ---------------------------------------------------------------------------
  // Flujo al iniciar sesión
  // ---------------------------------------------------------------------------

  async function run(ownerId) {
    const sequence = ++runSequence;
    stopAutosave();
    ctx.ownerId = ownerId;
    closeModal();
    hidePanel();
    setStatus('checking');

    const fetched = await fetchCloudRow(ownerId);
    if (sequence !== runSequence) {
      return;
    }
    if (fetched.error) {
      // Igual que A1: se sigue con los datos locales, sin tocar nada.
      setStatus('unavailable');
      // Se vuelve a intentar solo (y de inmediato si vuelve la conexión).
      const delay = RETRY_DELAYS_MS[Math.min(ctx.runRetryIndex, RETRY_DELAYS_MS.length - 1)];
      ctx.runRetryIndex += 1;
      ctx.runRetryTimer = setTimeout(() => run(ownerId), delay);
      showPanel(`<h3>No se pudo consultar la nube</h3><p class="muted">${fetched.unavailable ? 'El servidor no responde.' : 'La nube rechazó la consulta.'} Sigues trabajando con los datos de este equipo; no se cambió nada.</p><div class="inline-actions"><button class="secondary" type="button" data-sync-retry>Reintentar</button></div>`, 'warn')
        .querySelector('[data-sync-retry]').addEventListener('click', () => run(ownerId));
      return;
    }

    ctx.runRetryIndex = 0;
    const row = fetched.row;
    const stored = Boolean(localStoredRaw());
    let localPayload;
    try {
      localPayload = syncCore.buildCloudPayload(currentLocalState());
    } catch (error) {
      setStatus('error');
      showPanel(`<h3>No se pudieron revisar los datos</h3><p>${escapeHtml(error.message)}</p>`, 'bad');
      return;
    }
    // Un equipo con solo el contenido de fábrica (sin clientes, ejercicios por defecto)
    // cuenta como vacío: se carga la nube sin pantalla de conflicto.
    const localIsFactory = syncCore.isFactoryDefault(localPayload, syncCore.buildCloudPayload(dataApi.createInitialState()));
    const action = syncCore.decideSyncAction({ cloudRow: row, localStored: stored, localIsFactory, localPayload, meta: readMeta(), ownerId });
    window.VALHALLA.cloudSync.lastAction = action;

    if (action === 'offer-upload') {
      offerUpload(ownerId);
    } else if (action === 'load-cloud') {
      loadIntoEmptyDevice(ownerId, row);
    } else if (action === 'in-sync') {
      writeMeta(ownerId, row, { keepSyncedAt: readMeta()?.version === row.version });
      startAutosave(ownerId);
      setStatus('synced');
    } else if (action === 'pending-local') {
      // Cambios hechos en este equipo después de la última sincronización: se suben ya.
      writeMeta(ownerId, row, { keepSyncedAt: true });
      startAutosave(ownerId);
      setStatus('pending');
      scheduleSave(0);
    } else {
      showConflict(ownerId, row);
    }
  }

  window.addEventListener('valhalla:auth-changed', (event) => {
    const detail = event.detail || {};
    if (detail.role !== 'coach' || !detail.user?.id) {
      return;
    }
    if (detail.offline) {
      clearUi();
      ctx.ownerId = detail.user.id;
      setStatus('offline');
      return;
    }
    run(detail.user.id);
  });

  window.addEventListener('valhalla:auth-locked', clearUi);
  window.addEventListener('valhalla:state-saved', onStateSaved);
  window.addEventListener('online', () => {
    if (ctx.ready && ctx.status === 'pending') {
      ctx.retryIndex = 0;
      saveToCloud();
    } else if (ctx.status === 'unavailable' && ctx.ownerId) {
      ctx.runRetryIndex = 0;
      run(ctx.ownerId);
    }
  });

  window.VALHALLA.cloudSync = {
    run,
    lastAction: '',
    isActive: () => ctx.ready,
    statusText: () => {
      const badge = document.getElementById('syncStatusBadge');
      return badge ? badge.textContent.replace(/^Nube: /, '') : '';
    },
    restoreFromBackup,
    status: () => ctx.status
  };
})();
