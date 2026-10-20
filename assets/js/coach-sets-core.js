(function () {
  // Fase B3.4: el entrenador y el alumno registran el mismo día sin pisarse (sin pantalla;
  // app.js lo usa en Modo Grupo).
  //
  //   * Lo que registró el alumno prellena las casillas de Modo Grupo. Las casillas que el
  //     entrenador toca mandan; las que no toca muestran lo del alumno.
  //   * Al confirmar, cada serie se compara con la del alumno (la n-ésima de su tipo, como en
  //     B3.3). Las iguales quedan como estaban (del alumno, ya revisadas). Las que el
  //     entrenador cambió, las que el alumno no registró y las que el entrenador quitó se
  //     escriben en student_sets a nombre del entrenador y con coach_validated = true.
  //   * Lo que falta subir queda en ESTE teléfono, en su propia clave por cuenta
  //     (valhalla_coach_sets:<cuenta>): no es parte del estado, no sube en coach_state y no
  //     sale en los respaldos. Al subir, solo se escribe para alumnos con vínculo activo y
  //     can_self_log; lo de los demás se descarta sin escribir nada.
  window.VALHALLA = window.VALHALLA || {};

  const KEY_PREFIX = 'valhalla_coach_sets:';
  const SCHEMA = 1;
  // La clave única de student_sets (la misma que usa el alumno al subir).
  const CONFLICT_COLUMNS = 'owner_id,client_id,assignment_id,session_date,day_id,exercise_id,set_type,set_number';
  const STUDENT = 'student';
  const COACH = 'coach';

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function setType(entry) {
    const raw = String(entry?.setType || entry?.set_type || 'S').trim().toUpperCase();
    return raw === 'A' || raw === 'T' || raw === 'S' ? raw : 'S';
  }

  // Series de un tipo, en orden: la n-ésima es la "serie n" de ese tipo en student_sets.
  function byType(sets, type) {
    return (Array.isArray(sets) ? sets : [])
      .filter((entry) => setType(entry) === type)
      .sort((a, b) => Number(a.setNumber || 0) - Number(b.setNumber || 0));
  }

  function isStudentSet(entry) {
    return entry?.loggedBy === STUDENT;
  }

  // ¿Tiene series del alumno que el entrenador todavía no revisó? (en Modo Grupo, ese
  // ejercicio aún no está confirmado).
  function hasUnreviewedStudentSets(exercise) {
    return (exercise?.sets || []).some((entry) => isStudentSet(entry) && entry.coachValidated !== true);
  }

  // ---------------------------------------------------------------------------
  // Prellenado de Modo Grupo
  // ---------------------------------------------------------------------------

  // En el estado un peso vacío es 0: no se muestra.
  function weightText(value) {
    const number = numberOrNull(value);
    return number !== null && number > 0 ? String(number) : '';
  }

  function repsText(value) {
    const number = numberOrNull(value);
    return number === null ? '' : String(number);
  }

  // Casillas de Modo Grupo con lo que ya está en el ejercicio de la sesión (lo del alumno).
  // studentRir: el RIR de la última serie efectiva que registró el alumno (su sensación).
  function prefillValues(exercise) {
    const values = {};
    const effective = byType(exercise?.sets, 'S');
    effective.forEach((entry, index) => {
      values[`s${index + 1}Weight`] = weightText(entry.weight);
      values[`s${index + 1}Reps`] = repsText(entry.reps);
    });
    const warmups = byType(exercise?.sets, 'A').map((entry) => weightText(entry.weight)).filter(Boolean);
    if (warmups.length) {
      values.warmups = `${warmups.join('/')} kg`;
    }
    const withRir = effective.slice().reverse().find((entry) => numberOrNull(entry.rir) !== null);
    if (withRir) {
      values.rir = String(Number(withRir.rir));
    }
    const studentWithRir = effective.slice().reverse().find((entry) => isStudentSet(entry) && numberOrNull(entry.rir) !== null);
    return { values, studentRir: studentWithRir ? Number(studentWithRir.rir) : null };
  }

  // Lo escrito por el entrenador encima de lo prellenado: una casilla que el entrenador ya
  // tocó (aunque la haya dejado vacía) manda. Las series a la vista llegan hasta la última
  // con datos. Devuelve una copia; el borrador no cambia.
  function resolveDraft(draft, values, maxSets = 10) {
    const next = { ...(draft || {}) };
    Object.keys(values || {}).forEach((key) => {
      if (!(key in (draft || {})) && values[key] !== '') {
        next[key] = values[key];
      }
    });
    let count = Math.max(1, Math.round(Number(next.setCount)) || 1);
    Object.keys(next).forEach((key) => {
      const match = /^s(\d+)(Weight|Reps)$/.exec(key);
      if (match && String(next[key] ?? '').trim() !== '') {
        count = Math.max(count, Number(match[1]));
      }
    });
    next.setCount = Math.min(count, maxSets);
    return next;
  }

  // ---------------------------------------------------------------------------
  // Confirmar: qué queda en la sesión y qué se escribe en student_sets
  // ---------------------------------------------------------------------------

  function sameNumber(a, b) {
    return numberOrNull(a) === numberOrNull(b);
  }

  function sameValues(type, before, after) {
    return Number(before.weight || 0) === Number(after.weight || 0)
      && sameNumber(before.reps, after.reps)
      && (type === 'A' || sameNumber(before.rir, after.rir));
  }

  // previous: series del ejercicio en la sesión (lo del alumno y lo que ya confirmó el
  // entrenador). confirmed: las series que arma Modo Grupo (aproximaciones y efectivas).
  // write: ¿se escribe en student_sets? mark: ¿se sabe que el alumno registra (vínculo con
  // can_self_log)? Solo entonces las series escritas quedan marcadas como del entrenador.
  // Devuelve las series de la sesión y los cambios a escribir.
  function planConfirm({ previous, confirmed, write = false, mark = false }) {
    const sets = [];
    const changes = [];
    ['A', 'S'].forEach((type) => {
      const before = byType(previous, type);
      const after = (Array.isArray(confirmed) ? confirmed : []).filter((entry) => setType(entry) === type);
      for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
        const prev = before[index] || null;
        const setNumber = index + 1;
        if (!after[index]) {
          // El entrenador la quitó: en la base queda vacía y a su nombre (si no, al volver
          // a traer volvería a aparecer).
          if (write && prev && (isStudentSet(prev) || prev.loggedBy === COACH)) {
            changes.push({ setType: type, setNumber, weight: null, reps: null, rir: null });
          }
          continue;
        }
        const next = { ...after[index] };
        if (prev) {
          // Lo que Modo Grupo no pide se conserva del alumno: el RIR de las series que no son
          // la última y las repeticiones de una aproximación con el mismo peso.
          if (type === 'S' && numberOrNull(next.rir) === null && index < after.length - 1) {
            next.rir = numberOrNull(prev.rir);
          }
          if (type === 'A' && numberOrNull(next.reps) === null && Number(next.weight || 0) === Number(prev.weight || 0)) {
            next.reps = numberOrNull(prev.reps);
          }
        }
        if (prev && (isStudentSet(prev) || prev.loggedBy === COACH) && sameValues(type, prev, next)) {
          // Igual a lo registrado: no se escribe. La del alumno queda suya, ya revisada.
          sets.push(isStudentSet(prev) ? { ...prev, coachValidated: true } : { ...prev });
          continue;
        }
        if (prev && isStudentSet(prev)) {
          // B3.3: la serie del alumno que el entrenador corrige pasa a ser del entrenador.
          next.loggedBy = COACH;
          next.coachValidated = true;
          if (prev.studentSetId) next.studentSetId = prev.studentSetId;
        } else if (write && mark) {
          next.loggedBy = COACH;
          next.coachValidated = true;
        }
        sets.push(next);
        if (write) {
          changes.push({ setType: type, setNumber, weight: numberOrNull(next.weight), reps: numberOrNull(next.reps), rir: type === 'S' ? numberOrNull(next.rir) : null });
        }
      }
    });
    sets.forEach((entry, index) => {
      entry.setNumber = index + 1;
    });
    return { sets, changes };
  }

  // Lo que acepta la base (los mismos límites de student_sets).
  function validChange(change) {
    const weightOk = change.weight === null || (change.weight >= 0 && change.weight < 1000);
    const repsOk = change.reps === null || (Number.isInteger(change.reps) && change.reps >= 0 && change.reps <= 1000);
    const rirOk = change.rir === null || (change.rir >= 0 && change.rir <= 10);
    return weightOk && repsOk && rirOk && change.setNumber >= 1 && change.setNumber <= 50;
  }

  // Filas para student_sets (lista cerrada de campos), a nombre del entrenador.
  // base: { ownerId, clientId, assignmentId, sessionDate, dayId, exerciseId }.
  function buildRows(base, changes) {
    const rows = [];
    let skipped = 0;
    (changes || []).forEach((change) => {
      if (!validChange(change)) {
        skipped += 1;
        return;
      }
      rows.push({
        owner_id: base.ownerId,
        client_id: base.clientId,
        auth_user_id: base.ownerId,
        assignment_id: base.assignmentId,
        session_date: base.sessionDate,
        day_id: base.dayId,
        exercise_id: base.exerciseId,
        set_type: change.setType,
        set_number: change.setNumber,
        weight: change.weight,
        reps: change.reps,
        rir: change.rir,
        completed: true,
        coach_validated: true
      });
    });
    return { rows, skipped };
  }

  function conflictKey(row) {
    return [row.owner_id, row.client_id, row.assignment_id, row.session_date, row.day_id, row.exercise_id, row.set_type, Number(row.set_number)].join('|');
  }

  // ---------------------------------------------------------------------------
  // Pendiente de subir (solo en este teléfono)
  // ---------------------------------------------------------------------------

  function storageKey(ownerId) {
    return `${KEY_PREFIX}${ownerId}`;
  }

  function readOutbox(raw, ownerId) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return [];
      }
    }
    if (!parsed || parsed.schema !== SCHEMA || !ownerId || parsed.ownerId !== ownerId || !Array.isArray(parsed.items)) {
      return [];
    }
    return parsed.items.filter((item) => item && item.row && item.row.owner_id === ownerId && item.key === conflictKey(item.row));
  }

  function serializeOutbox(ownerId, items) {
    return JSON.stringify({ schema: SCHEMA, ownerId, items });
  }

  // Agrega filas (la última de cada serie reemplaza a la anterior).
  function queueRows(items, rows, now = new Date()) {
    const next = (items || []).slice();
    (rows || []).forEach((row) => {
      const item = { key: conflictKey(row), row, queuedAt: now.toISOString() };
      const index = next.findIndex((existing) => existing.key === item.key);
      if (index >= 0) {
        next[index] = item;
      } else {
        next.push(item);
      }
    });
    return next;
  }

  // Quita lo que ya se resolvió (subido o descartado), salvo que se haya vuelto a encolar
  // mientras tanto.
  function removeDone(items, done) {
    const doneAt = new Map((done || []).map((item) => [item.key, item.queuedAt]));
    return (items || []).filter((item) => doneAt.get(item.key) !== item.queuedAt);
  }

  // links: Map client_id -> { canSelfLog }. Solo se sube lo de alumnos que registran.
  function splitByLinks(items, links) {
    const send = [];
    const drop = [];
    (items || []).forEach((item) => {
      (links?.get(item.row.client_id)?.canSelfLog === true ? send : drop).push(item);
    });
    return { send, drop };
  }

  window.VALHALLA.coachSetsCore = {
    KEY_PREFIX,
    CONFLICT_COLUMNS,
    isStudentSet,
    hasUnreviewedStudentSets,
    prefillValues,
    resolveDraft,
    planConfirm,
    buildRows,
    conflictKey,
    storageKey,
    readOutbox,
    serializeOutbox,
    queueRows,
    removeDone,
    splitByLinks
  };
})();
