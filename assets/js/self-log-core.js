(function () {
  // Fase B3.2: reglas del registro de series que hace el propio alumno (sin pantalla).
  // Las mismas reglas las exige la base (supabase/b3_1_registro_alumno.sql); aquí se
  // revisan antes para dar un mensaje claro y no mandar algo que la base va a rechazar.
  window.VALHALLA = window.VALHALLA || {};

  const TIME_ZONE = 'America/Santiago';
  const MAX_DAYS_BACK = 3;
  // Lo pendiente de subir queda ligado a la cuenta: una clave por usuario.
  const OUTBOX_PREFIX = 'valhalla_student_sets_';
  const OUTBOX_VERSION = 1;
  const SAVED_KEEP_DAYS = 7;

  // "72,5" y "72.5" valen lo mismo. Vacío = null. Texto no numérico = NaN.
  function parseDecimal(text) {
    const value = String(text ?? '').trim().replace(/\s+/g, '');
    if (!value) {
      return null;
    }
    if (!/^\d+([.,]\d+)?$/.test(value)) {
      return Number.NaN;
    }
    return Number(value.replace(',', '.'));
  }

  // Fecha de hoy en Chile (AAAA-MM-DD), sin importar la zona del teléfono.
  function chileToday(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }

  function shiftDate(isoDate, days) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
  }

  // Hoy y hasta 3 días atrás, del más nuevo al más antiguo.
  function allowedDates(now = new Date()) {
    const today = chileToday(now);
    return Array.from({ length: MAX_DAYS_BACK + 1 }, (_, index) => shiftDate(today, -index));
  }

  function isDateAllowed(isoDate, now = new Date()) {
    return allowedDates(now).includes(isoDate);
  }

  // Cuántas series efectivas tiene definidas la rutina publicada (0 = por definir).
  function plannedEffectiveSets(exercise) {
    const sets = Number(exercise?.sets);
    return Number.isFinite(sets) && sets >= 1 ? Math.floor(sets) : 0;
  }

  function plannedApproximations(exercise) {
    return Array.isArray(exercise?.approximations) ? exercise.approximations.length : 0;
  }

  function setKey({ assignmentId, sessionDate, dayId, exerciseId, setType, setNumber }) {
    return [assignmentId, sessionDate, dayId, exerciseId, setType, setNumber].join('|');
  }

  // Revisa lo escrito en un ejercicio. rows: [{ setType, setNumber, weightText, repsText, rirText }].
  // Devuelve los errores (en español) y las series con dato listas para guardar.
  function validateExercise(exercise, rows) {
    const errors = [];
    const effective = plannedEffectiveSets(exercise);
    const approximations = plannedApproximations(exercise);
    if (!effective) {
      return { errors: ['Tu entrenador aún no definió las series de este ejercicio'], entries: [] };
    }
    const entries = [];
    for (const row of rows || []) {
      const label = `${row.setType === 'A' ? 'Aproximación' : 'Serie'} ${row.setNumber}`;
      const limit = row.setType === 'A' ? approximations : effective;
      if ((row.setType !== 'A' && row.setType !== 'S') || !Number.isInteger(row.setNumber) || row.setNumber < 1 || row.setNumber > limit) {
        errors.push(`${label}: no está en tu rutina`);
        continue;
      }
      const weight = parseDecimal(row.weightText);
      const reps = parseDecimal(row.repsText);
      const rir = row.setType === 'A' ? null : parseDecimal(row.rirText);
      if (weight === null && reps === null && rir === null) {
        continue;
      }
      if (Number.isNaN(weight) || (weight !== null && (weight < 0 || weight >= 1000))) {
        errors.push(`${label}: el peso debe ser un número (por ejemplo 72,5)`);
        continue;
      }
      if (Number.isNaN(reps) || (reps !== null && (!Number.isInteger(reps) || reps > 1000))) {
        errors.push(`${label}: las repeticiones deben ser un número entero`);
        continue;
      }
      if (Number.isNaN(rir) || (rir !== null && (!Number.isInteger(rir) || rir > 10))) {
        errors.push(`${label}: el RIR debe ser un número entero de 0 a 10`);
        continue;
      }
      if (weight === null && reps === null) {
        errors.push(`${label}: escribe el peso o las repeticiones`);
        continue;
      }
      entries.push({ setType: row.setType, setNumber: row.setNumber, weight, reps, rir });
    }
    // RIR obligatorio solo en la última serie efectiva de la rutina (S3 si tiene 3), cuando
    // se registra. Así se puede guardar serie por serie sin escribir RIR en las anteriores.
    const lastEffective = entries.find((entry) => entry.setType === 'S' && entry.setNumber === effective);
    if (lastEffective && lastEffective.rir === null && !errors.length) {
      errors.push(`Falta el RIR en la serie ${effective}: es obligatorio en la última serie efectiva`);
    }
    return { errors, entries };
  }

  // Mensaje en español para un error de Supabase al subir una serie.
  function describeUploadError(error) {
    const code = String(error?.code || '');
    const text = String(error?.message || '');
    if (code === '42501' || /row-level security|permission denied|B3_SERIE_BLOQUEADA/i.test(text)) {
      return 'La base no aceptó esta serie: puede que tu entrenador ya la haya corregido, que la fecha sea de hace más de 3 días o que el ejercicio ya no esté en tu rutina. Tus datos siguen aquí.';
    }
    if (code === '23514') {
      return 'La base no aceptó esta serie porque algún valor está fuera de rango. Revisa peso, repeticiones y RIR.';
    }
    return 'La base no aceptó esta serie. Tus datos siguen aquí; avísale a tu entrenador si se repite.';
  }

  // ---------------------------------------------------------------------------
  // Lo guardado en el teléfono (por cuenta)
  // ---------------------------------------------------------------------------

  function outboxKey(userId) {
    return `${OUTBOX_PREFIX}${userId}`;
  }

  function readOutbox(storage, userId) {
    if (!userId) {
      return [];
    }
    try {
      const parsed = JSON.parse(storage.getItem(outboxKey(userId)) || 'null');
      return parsed && parsed.version === OUTBOX_VERSION && parsed.userId === userId && Array.isArray(parsed.items) ? parsed.items : [];
    } catch (error) {
      return [];
    }
  }

  function writeOutbox(storage, userId, items, now = new Date()) {
    // Las ya subidas se olvidan a los 7 días; lo pendiente y lo rechazado nunca se borra solo.
    const limit = now.getTime() - SAVED_KEEP_DAYS * 86400000;
    const kept = items.filter((item) => item.status !== 'saved' || new Date(item.savedAt || item.updatedAt).getTime() >= limit);
    try {
      storage.setItem(outboxKey(userId), JSON.stringify({ version: OUTBOX_VERSION, userId, items: kept }));
      return true;
    } catch (error) {
      return false;
    }
  }

  // Agrega o reemplaza series (por su clave) como pendientes de subir.
  function queueEntries(items, base, entries, now = new Date()) {
    const next = items.slice();
    for (const entry of entries) {
      const item = {
        key: setKey({ ...base, setType: entry.setType, setNumber: entry.setNumber }),
        ownerId: base.ownerId,
        clientId: base.clientId,
        assignmentId: base.assignmentId,
        sessionDate: base.sessionDate,
        dayId: base.dayId,
        exerciseId: base.exerciseId,
        setType: entry.setType,
        setNumber: entry.setNumber,
        weight: entry.weight,
        reps: entry.reps,
        rir: entry.rir,
        status: 'pending',
        error: '',
        updatedAt: now.toISOString()
      };
      const index = next.findIndex((existing) => existing.key === item.key);
      if (index >= 0) {
        next[index] = item;
      } else {
        next.push(item);
      }
    }
    return next;
  }

  function markItem(items, key, changes) {
    return items.map((item) => (item.key === key ? Object.assign({}, item, changes) : item));
  }

  // Fila para student_sets (lista cerrada de campos; auth_user_id lo pone la base).
  function toRow(item) {
    return {
      owner_id: item.ownerId,
      client_id: item.clientId,
      assignment_id: item.assignmentId,
      session_date: item.sessionDate,
      day_id: item.dayId,
      exercise_id: item.exerciseId,
      set_type: item.setType,
      set_number: item.setNumber,
      weight: item.weight,
      reps: item.reps,
      rir: item.rir,
      completed: true
    };
  }

  const CONFLICT_COLUMNS = 'owner_id,client_id,assignment_id,session_date,day_id,exercise_id,set_type,set_number';

  window.VALHALLA.selfLogCore = {
    TIME_ZONE,
    MAX_DAYS_BACK,
    OUTBOX_PREFIX,
    CONFLICT_COLUMNS,
    parseDecimal,
    chileToday,
    shiftDate,
    allowedDates,
    isDateAllowed,
    plannedEffectiveSets,
    plannedApproximations,
    setKey,
    validateExercise,
    describeUploadError,
    outboxKey,
    readOutbox,
    writeOutbox,
    queueEntries,
    markItem,
    toRow
  };
})();
