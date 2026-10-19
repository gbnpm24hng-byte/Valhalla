(function () {
  // Borrador de Modo Grupo: lo escrito y aún sin confirmar (series, pesos, reps, RIR,
  // decisión, comentarios, galería abierta). Vive SOLO en este teléfono, en su propia
  // clave de localStorage por cuenta; no es parte del estado, así que no sube a la nube,
  // no sale en los respaldos y no cuenta como sesión guardada. Sin pantalla: app.js lo usa.

  const KEY_PREFIX = 'valhalla_group_draft:';
  const SCHEMA = 1;
  const DRAFT_FIELDS = /^(warmups|rir|decision|proposedWeight|s\d{1,2}(Weight|Reps))$/;

  function storageKey(ownerId) {
    return `${KEY_PREFIX}${ownerId || 'local'}`;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanText(value, max = 300) {
    return value === null || value === undefined ? '' : String(value).slice(0, max);
  }

  function cleanComment(comment) {
    if (!isPlainObject(comment) || !String(comment.text || '').trim()) {
      return null;
    }
    return { text: cleanText(comment.text), visibleToStudent: comment.visibleToStudent === true, ...(comment.updatedAt ? { updatedAt: String(comment.updatedAt) } : {}) };
  }

  // Lo escrito de un ejercicio: solo campos conocidos y como texto.
  function cleanEntry(entry) {
    if (!isPlainObject(entry)) {
      return null;
    }
    const clean = { setCount: Math.min(10, Math.max(1, Math.round(Number(entry.setCount)) || 3)), error: '' };
    Object.keys(entry).forEach((key) => {
      if (DRAFT_FIELDS.test(key)) {
        clean[key] = cleanText(entry[key], 40);
      }
    });
    const comment = cleanComment(entry.comment);
    if (comment) {
      clean.comment = comment;
    }
    return clean;
  }

  // ¿Hay algo escrito sin confirmar en este ejercicio? Cuentan series, pesos, reps, RIR,
  // aproximaciones y comentarios. La decisión o la propuesta de peso por sí solas no
  // (se guardan igual junto con lo demás).
  function entryHasData(entry) {
    if (!entry) {
      return false;
    }
    if (entry.comment || String(entry.warmups || '').trim() || String(entry.rir ?? '').trim()) {
      return true;
    }
    return Object.keys(entry).some((key) => /^s\d+(Weight|Reps)$/.test(key) && String(entry[key] ?? '').trim() !== '');
  }

  function hasUnconfirmedData(snapshot) {
    if (!snapshot) {
      return false;
    }
    const drafts = snapshot.drafts || {};
    return Object.keys(drafts).some((key) => entryHasData(drafts[key]))
      || Boolean(snapshot.picker && snapshot.picker.exerciseId)
      || Boolean(snapshot.commentEditor && String(snapshot.commentEditor.text || '').trim());
  }

  // Alumnos con algo escrito sin confirmar.
  function clientsWithData(snapshot) {
    const ids = new Set();
    Object.keys(snapshot?.drafts || {}).forEach((key) => {
      if (entryHasData(snapshot.drafts[key])) {
        ids.add(key.split('::')[0]);
      }
    });
    if (snapshot?.picker?.exerciseId) ids.add(snapshot.picker.clientId);
    if (String(snapshot?.commentEditor?.text || '').trim()) ids.add(snapshot.commentEditor.clientId);
    return [...ids].filter(Boolean);
  }

  // Foto de lo que hay en pantalla. ui: el groupSessionUi de app.js.
  function buildSnapshot({ ownerId, ui, now = new Date(), today }) {
    const drafts = {};
    Object.keys(ui.drafts || {}).forEach((key) => {
      const entry = cleanEntry(ui.drafts[key]);
      if (entry && /^[^:]+::.+$/.test(key)) {
        drafts[key] = entry;
      }
    });
    return {
      schema: SCHEMA,
      ownerId: ownerId || 'local',
      savedAt: now.toISOString(),
      savedDay: today,
      sessionDate: String(ui.sessionDate || today),
      dateIsManual: Boolean(ui.dateIsManual),
      selectedClientIds: (ui.selectedClientIds || []).map(String).slice(0, 4),
      dayChoices: isPlainObject(ui.dayChoices) ? { ...ui.dayChoices } : {},
      drafts,
      picker: isPlainObject(ui.picker) ? { ...ui.picker } : null,
      commentEditor: isPlainObject(ui.commentEditor) ? { ...ui.commentEditor, text: cleanText(ui.commentEditor.text) } : null
    };
  }

  // Valida lo leído del teléfono; null si no sirve o es de otra cuenta.
  function readSnapshot(raw, ownerId) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return null;
      }
    }
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (!isPlainObject(parsed) || parsed.schema !== SCHEMA || parsed.ownerId !== (ownerId || 'local')
      || !date.test(String(parsed.savedDay || '')) || !date.test(String(parsed.sessionDate || ''))) {
      return null;
    }
    const drafts = {};
    Object.keys(isPlainObject(parsed.drafts) ? parsed.drafts : {}).forEach((key) => {
      const entry = cleanEntry(parsed.drafts[key]);
      if (entry && /^[^:]+::.+$/.test(key)) {
        drafts[key] = entry;
      }
    });
    return {
      ...parsed,
      selectedClientIds: Array.isArray(parsed.selectedClientIds) ? parsed.selectedClientIds.map(String).slice(0, 4) : [],
      dayChoices: isPlainObject(parsed.dayChoices) ? parsed.dayChoices : {},
      drafts,
      picker: isPlainObject(parsed.picker) ? parsed.picker : null,
      commentEditor: isPlainObject(parsed.commentEditor) ? parsed.commentEditor : null
    };
  }

  // 'none' (nada que retomar), 'same-day' (se retoma solo) u 'other-day' (preguntar).
  // Solo hay borrador si queda algo escrito sin confirmar; elegir alumnos no basta.
  function classify(snapshot, today) {
    if (!snapshot || !hasUnconfirmedData(snapshot)) {
      return 'none';
    }
    return snapshot.savedDay === today ? 'same-day' : 'other-day';
  }

  // ¿Vale la pena guardarlo? Sin nada escrito sin confirmar, se borra.
  // "Última vez" (al estilo Hevy): series efectivas hechas la última vez, como texto para
  // las casillas. Peso o repeticiones sin dato quedan ''.
  function lastSetValues(effectiveSets) {
    const text = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '' : String(Number(value)));
    return (Array.isArray(effectiveSets) ? effectiveSets : []).map((setEntry) => ({ weight: text(setEntry?.weight), reps: text(setEntry?.reps) }));
  }

  // "Repetir última vez": copia los valores de la última vez solo a las casillas vacías de
  // peso y repeticiones (nunca pisa lo escrito) y sube la cantidad de series hasta las de la
  // última vez (máximo maxSets; nunca la baja). No toca RIR, aproximaciones, comentario ni
  // decisión. Devuelve una copia del borrador y cuántas casillas llenó.
  function fillFromLast(draft, lastSets, maxSets = 10) {
    const next = { ...(isPlainObject(draft) ? draft : {}) };
    const values = (Array.isArray(lastSets) ? lastSets : []).slice(0, maxSets);
    const currentCount = Math.max(1, Math.round(Number(next.setCount)) || 1);
    next.setCount = Math.min(maxSets, Math.max(currentCount, values.length));
    let filled = 0;
    values.forEach((value, index) => {
      ['weight', 'reps'].forEach((part) => {
        const key = `s${index + 1}${part === 'weight' ? 'Weight' : 'Reps'}`;
        if (String(next[key] ?? '').trim() === '' && value?.[part]) {
          next[key] = value[part];
          filled += 1;
        }
      });
    });
    return { draft: next, filled };
  }

  function isWorthSaving(snapshot) {
    return Boolean(snapshot) && hasUnconfirmedData(snapshot);
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.groupDraftCore = {
    KEY_PREFIX,
    storageKey,
    entryHasData,
    hasUnconfirmedData,
    clientsWithData,
    buildSnapshot,
    readSnapshot,
    classify,
    isWorthSaving,
    lastSetValues,
    fillFromLast
  };
})();
