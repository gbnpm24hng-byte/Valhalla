(function () {
  // Fase A2: subida inicial a coach_state y carga al iniciar sesión. Sin guardado
  // automático (eso es A3). Reglas:
  // - Nunca combina datos: o se mantiene este equipo, o se reemplaza por la nube.
  // - Nunca borra datos locales salvo el reemplazo confirmado, y antes descarga un respaldo.
  // - Las finanzas y el perfil se quedan solo en el equipo (ver sync-core.js).
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
  const COUNT_LABELS = [
    ['clientes', 'Clientes'],
    ['programas', 'Programas'],
    ['asignaciones', 'Asignaciones'],
    ['ejercicios', 'Ejercicios de la galería'],
    ['sesiones', 'Sesiones'],
    ['asistencias', 'Registros de asistencia']
  ];

  let runSequence = 0;

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

  function writeMeta(ownerId, row) {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
      ownerId,
      version: row.version,
      cloudHash: syncCore.fingerprint(row.data),
      syncedAt: new Date().toISOString()
    }));
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
      return 'La nube rechazó la subida: tu cuenta no tiene permiso.';
    }
    return 'La nube rechazó la subida.';
  }

  // ---------------------------------------------------------------------------
  // Interfaz: indicador, panel y diálogo
  // ---------------------------------------------------------------------------

  function setBadge(text, tone) {
    const actions = document.querySelector('.app-header .header-actions');
    if (!actions) {
      return;
    }
    document.getElementById('cloudModeBadge')?.classList.add('hidden');
    let badge = document.getElementById('syncStatusBadge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'syncStatusBadge';
      badge.className = 'badge sync-badge';
      actions.insertBefore(badge, document.getElementById('authHeaderLogout'));
    }
    badge.textContent = text;
    badge.dataset.tone = tone || 'neutral';
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

  function clearUi() {
    runSequence += 1;
    closeModal();
    hidePanel();
    document.getElementById('syncStatusBadge')?.remove();
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

  // ---------------------------------------------------------------------------
  // Subida inicial (no hay fila en la nube)
  // ---------------------------------------------------------------------------

  function offerUpload(ownerId) {
    setBadge('Nube: sin subir', 'warn');
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
      <p class="notice auth-message hidden" data-sync-message role="alert"></p>
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
        setBadge('Nube: sincronizado', 'ok');
        showPanel(`<h3>✓ Datos subidos y verificados</h3><p class="muted">La nube tiene una copia idéntica a este equipo (versión ${result.version}).</p><div class="inline-actions"><button class="secondary" type="button" data-sync-close>Cerrar</button></div>`, 'ok')
          .querySelector('[data-sync-close]').addEventListener('click', hidePanel);
      } else {
        setBadge('Nube: sin subir', 'bad');
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
    const previous = localStoredRaw();
    const nextState = syncCore.applyCloudData(currentLocalState(), row.data);
    try {
      dataApi.saveState(nextState);
      const check = syncCore.compare(syncCore.buildCloudPayload(dataApi.loadState()), row.data);
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
    setBadge('Nube: cargando…', 'neutral');
    showPanel('<h3>Cargando tus datos desde la nube…</h3>', 'neutral');
    const result = replaceLocalWithCloud(ownerId, row);
    if (!result.ok) {
      setBadge('Nube: error', 'bad');
      showPanel(`<h3>No se pudieron cargar los datos de la nube</h3><p>${escapeHtml(result.message)}</p>`, 'bad');
    }
  }

  function showChoice(ownerId, row) {
    setBadge('Nube: distinta de este equipo', 'warn');
    const localPayload = syncCore.buildCloudPayload(currentLocalState());
    const localSummary = syncCore.summarize(localPayload);
    const cloudSummary = syncCore.summarize(row.data);
    const meta = readMeta();
    const lastSync = meta && meta.ownerId === ownerId ? formatDate(meta.syncedAt) : 'nunca';

    const modal = openModal(`
      <h2>Los datos de este equipo y los de la nube son distintos</h2>
      <p>No se combinan. Elige qué datos usar. Si no estás seguro, no cambies nada.</p>
      ${summaryTable([
        { title: 'Este equipo', summary: localSummary, extra: [['Último cambio registrado', formatDate(localSummary.ultimoCambio)], ['Sincronizado / guardado en la nube', `Última sincronización: ${lastSync}`]] },
        { title: 'Nube', summary: cloudSummary, extra: [['Último cambio registrado', formatDate(cloudSummary.ultimoCambio)], ['Sincronizado / guardado en la nube', `Guardado: ${formatDate(row.updated_at)} (versión ${row.version})`]] }
      ])}
      <div class="sync-choice-actions">
        <button class="primary" type="button" data-sync-keep>No cambiar nada (seguir con este equipo)</button>
        <button class="danger" type="button" data-sync-replace>Reemplazar este equipo con la nube…</button>
      </div>
      <p class="muted">Las finanzas de este equipo no se tocan en ningún caso.</p>`);
    modal.querySelector('[data-sync-keep]').focus();
    modal.querySelector('[data-sync-keep]').addEventListener('click', () => {
      closeModal();
      showPanel('<h3>Seguiste con los datos de este equipo</h3><p class="muted">No se cambió nada. La nube tiene datos distintos; podrás elegir de nuevo la próxima vez que entres.</p><div class="inline-actions"><button class="secondary" type="button" data-sync-close>Cerrar</button></div>', 'warn')
        .querySelector('[data-sync-close]').addEventListener('click', hidePanel);
    });
    modal.querySelector('[data-sync-replace]').addEventListener('click', () => confirmReplace(ownerId, row));
  }

  // Paso 1: descarga automática del respaldo local. Paso 2: confirmar el reemplazo.
  function confirmReplace(ownerId, row) {
    const backupName = `valhalla-respaldo-antes-de-nube-${timestampForFile()}.json`;
    let backupStarted = false;
    try {
      downloadJson(dataApi.exportState(currentLocalState()), backupName);
      backupStarted = true;
    } catch (error) {
      backupStarted = false;
    }

    if (!backupStarted) {
      openModal(`
        <h2>No se pudo descargar el respaldo</h2>
        <p>Por seguridad no se reemplazó nada.</p>
        <div class="inline-actions"><button class="primary" type="button" data-sync-close>Entendido</button></div>`)
        .querySelector('[data-sync-close]').addEventListener('click', closeModal);
      return;
    }

    const modal = openModal(`
      <h2>Respaldo descargado</h2>
      <p>Se inició la descarga de <strong>${escapeHtml(backupName)}</strong> con todos los datos de este equipo, incluidas las finanzas.</p>
      <p>Revisa que aparezca en tus descargas antes de continuar.</p>
      <p class="notice auth-message hidden" data-sync-message role="alert"></p>
      <div class="sync-choice-actions">
        <button class="primary" type="button" data-sync-cancel>Cancelar (no cambiar nada)</button>
        <button class="secondary" type="button" data-sync-again>Descargar el respaldo de nuevo</button>
        <button class="danger" type="button" data-sync-confirm-replace>Ya tengo el respaldo: reemplazar con la nube</button>
      </div>`);
    modal.querySelector('[data-sync-cancel]').focus();
    modal.querySelector('[data-sync-cancel]').addEventListener('click', () => showChoice(ownerId, row));
    modal.querySelector('[data-sync-again]').addEventListener('click', () => downloadJson(dataApi.exportState(currentLocalState()), backupName));
    modal.querySelector('[data-sync-confirm-replace]').addEventListener('click', () => {
      if (!backupStarted) {
        return;
      }
      const result = replaceLocalWithCloud(ownerId, row);
      if (!result.ok) {
        const message = modal.querySelector('[data-sync-message]');
        message.textContent = result.message;
        message.classList.remove('hidden');
        message.classList.add('auth-message--bad');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Flujo al iniciar sesión
  // ---------------------------------------------------------------------------

  async function run(ownerId) {
    const sequence = ++runSequence;
    closeModal();
    hidePanel();
    setBadge('Nube: verificando…', 'neutral');

    const fetched = await fetchCloudRow(ownerId);
    if (sequence !== runSequence) {
      return;
    }
    if (fetched.error) {
      // Igual que A1: se sigue con los datos locales, sin tocar nada.
      setBadge('Nube: no disponible', 'warn');
      showPanel(`<h3>No se pudo consultar la nube</h3><p class="muted">${fetched.unavailable ? 'El servidor no responde.' : 'La nube rechazó la consulta.'} Sigues trabajando con los datos de este equipo; no se cambió nada.</p><div class="inline-actions"><button class="secondary" type="button" data-sync-retry>Reintentar</button></div>`, 'warn')
        .querySelector('[data-sync-retry]').addEventListener('click', () => run(ownerId));
      return;
    }

    const row = fetched.row;
    const stored = Boolean(localStoredRaw());
    let localPayload;
    try {
      localPayload = syncCore.buildCloudPayload(currentLocalState());
    } catch (error) {
      setBadge('Nube: error', 'bad');
      showPanel(`<h3>No se pudieron revisar los datos</h3><p>${escapeHtml(error.message)}</p>`, 'bad');
      return;
    }
    const action = syncCore.decideSyncAction({ cloudRow: row, localStored: stored, localPayload, meta: readMeta(), ownerId });
    window.VALHALLA.cloudSync.lastAction = action;

    if (action === 'offer-upload') {
      offerUpload(ownerId);
    } else if (action === 'load-cloud') {
      loadIntoEmptyDevice(ownerId, row);
    } else if (action === 'in-sync') {
      const meta = readMeta();
      if (!meta || meta.ownerId !== ownerId || meta.version !== row.version) {
        writeMeta(ownerId, row);
      }
      setBadge('Nube: sincronizado', 'ok');
    } else if (action === 'pending-local') {
      setBadge('Nube: pendiente de sincronizar', 'warn');
    } else {
      showChoice(ownerId, row);
    }
  }

  window.addEventListener('valhalla:auth-changed', (event) => {
    const detail = event.detail || {};
    if (detail.role !== 'coach' || !detail.user?.id) {
      return;
    }
    if (detail.offline) {
      clearUi();
      setBadge('Nube: sin conexión', 'warn');
      return;
    }
    run(detail.user.id);
  });

  window.addEventListener('valhalla:auth-locked', clearUi);

  window.VALHALLA.cloudSync = { run, lastAction: '' };
})();
