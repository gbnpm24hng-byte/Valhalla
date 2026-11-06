(function () {
  // Fase B3.3: junta en las sesiones del entrenador las series que registraron los alumnos
  // (tabla student_sets). Sin pantalla; app.js la usa y guarda como siempre.
  //
  // Reglas:
  //   * Solo filas escritas por un alumno (auth_user_id distinto del entrenador) y de
  //     clientes que existen en la app. Tipos A y S (las "T" nunca vienen de la base).
  //   * Sesión: la del mismo alumno, día del programa y fecha; si no hay, se crea una.
  //   * Lo que escribió el entrenador nunca se pisa: lo del alumno solo llena series vacías
  //     o agrega las que faltan.
  //   * Cada serie traída guarda quién la registró (loggedBy: 'student') y de qué fila viene
  //     (studentSetId). Traer dos veces no duplica. Si el entrenador corrige una serie del
  //     alumno, pasa a loggedBy: 'coach' y ya no se toca al volver a traer.
  //   * No toca asistencia, saldo de sesiones, programas ni cargas.
  //   * v0.9.45: las filas de un circuito (exercise_id = id del circuito del día) no son series: S1 y
  //     S2 se juntan en session.circuits (circuits-core.js). Lo que guardó el entrenador gana.
  window.VALHALLA = window.VALHALLA || {};

  const STUDENT = 'student';

  function rowId(row) {
    return String(row.id || [row.owner_id, row.client_id, row.assignment_id, row.session_date, row.day_id, row.exercise_id, row.set_type, row.set_number].join('|'));
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function setType(entry) {
    const raw = String(entry?.setType || entry?.set_type || 'S').trim().toUpperCase();
    return raw === 'A' || raw === 'T' || raw === 'S' ? raw : 'S';
  }

  // Una serie "tiene datos" si tiene peso o repeticiones.
  function setHasData(entry) {
    if (numberOrNull(entry?.seconds) !== null && Number(entry.seconds) > 0) return true;
    return Number(entry?.weight || 0) > 0 || (entry?.reps !== null && entry?.reps !== undefined && Number(entry.reps) > 0);
  }

  // v0.9.44: en un ejercicio por tiempo (measure: 'time' en el programa), student_sets trae los
  // segundos en la columna reps: en la sesión quedan en `seconds` (sin peso ni reps).
  function sameValues(entry, row, timed = false) {
    if (timed) {
      return numberOrNull(entry.seconds) === numberOrNull(row.reps) && numberOrNull(entry.rir) === numberOrNull(row.rir);
    }
    return Number(entry.weight || 0) === Number(numberOrNull(row.weight) ?? 0)
      && numberOrNull(entry.reps) === numberOrNull(row.reps)
      && numberOrNull(entry.rir) === numberOrNull(row.rir);
  }

  function applyRow(entry, row, timed = false) {
    if (timed) {
      entry.weight = 0;
      entry.reps = null;
      const seconds = numberOrNull(row.reps);
      if (seconds === null) {
        delete entry.seconds;
      } else {
        entry.seconds = seconds;
      }
    } else {
      entry.weight = Number(numberOrNull(row.weight) ?? 0);
      entry.reps = numberOrNull(row.reps);
    }
    entry.rir = numberOrNull(row.rir);
    entry.completed = row.completed !== false;
  }

  function circuitsApi() {
    return (typeof window !== 'undefined' && window.VALHALLA && window.VALHALLA.circuitsCore) || null;
  }

  // Circuito del día de la fila (o null si la fila es de un ejercicio).
  function findCircuit(state, row) {
    const assignment = (state.trainingsV08?.assignments || []).find((item) => item.id === row.assignment_id) || null;
    const day = (assignment?.days || []).find((item) => item.id === row.day_id) || null;
    return (Array.isArray(day?.blocks) ? day.blocks : []).find((block) => block && block.type === 'circuit' && block.id === row.exercise_id) || null;
  }

  function findPlan(state, row) {
    const assignment = (state.trainingsV08?.assignments || []).find((item) => item.id === row.assignment_id) || null;
    const day = (assignment?.days || []).find((item) => item.id === row.day_id) || null;
    // Un ejercicio cambiado o agregado solo para este alumno (Modo Grupo) vive en clientOverrides.
    const exercise = (day?.exercises || []).find((item) => item.id === row.exercise_id)
      || (state.trainingsV08?.clientOverrides || []).find((item) => item.clientId === row.client_id && item.exercise?.id === row.exercise_id)?.exercise
      || null;
    return { assignment, day, exercise };
  }

  // B3.4: alumno con dos sesiones la misma fecha con distinto día del programa (no se
  // fusionan; se avisa). Solo revisa las fechas de las filas traídas.
  function findDaySplits(state, rows) {
    const sessions = state.trainingsV08?.sessions || [];
    const assignments = state.trainingsV08?.assignments || [];
    const pairs = new Map();
    (rows || []).forEach((row) => pairs.set(`${row.client_id}|${row.session_date}`, { clientId: row.client_id, date: row.session_date }));
    const splits = [];
    pairs.forEach(({ clientId, date }) => {
      const sameDay = sessions.filter((session) => session.clientId === clientId && session.date === date && session.programDayId);
      const dayIds = [...new Set(sameDay.map((session) => session.programDayId))];
      if (dayIds.length < 2) return;
      const dayNames = dayIds.map((dayId) => {
        const session = sameDay.find((item) => item.programDayId === dayId);
        const day = assignments.find((item) => item.id === session.programAssignmentId)?.days?.find((item) => item.id === dayId);
        return String(session.programDayName || day?.name || 'Día');
      });
      splits.push({ clientId, date, dayNames });
    });
    return splits.sort((a, b) => a.date.localeCompare(b.date) || a.clientId.localeCompare(b.clientId));
  }

  // rows: filas de student_sets. Devuelve el resumen; cambia `state` en el lugar.
  // skipRow (B3.4): filas que no se tocan porque el entrenador tiene esa serie pendiente de subir.
  function mergeStudentSets(state, rows, { coachId, createId, now = new Date(), skipRow = null }) {
    const summary = { added: 0, updated: 0, keptCoach: 0, unchanged: 0, sessionsCreated: 0, ignored: 0, splits: [] };
    if (!state.trainingsV08 || typeof state.trainingsV08 !== 'object') {
      state.trainingsV08 = { plans: [], sessions: [], programs: [], assignments: [] };
    }
    if (!Array.isArray(state.trainingsV08.sessions)) {
      state.trainingsV08.sessions = [];
    }
    const sessions = state.trainingsV08.sessions;
    const clientIds = new Set((state.clients || []).map((client) => client.id));
    const usable = (rows || []).filter((row) => {
      const ok = row && row.auth_user_id && row.auth_user_id !== coachId && clientIds.has(row.client_id)
        && (row.set_type === 'A' || row.set_type === 'S') && Number(row.set_number) >= 1
        && /^\d{4}-\d{2}-\d{2}$/.test(String(row.session_date || '')) && row.day_id && row.exercise_id;
      if (!ok) summary.ignored += 1;
      return ok;
    });
    const pendingCoach = new Set(skipRow ? usable.filter((row) => skipRow(row)) : []);
    summary.keptCoach += pendingCoach.size;
    // Orden estable: por fecha, aproximaciones antes que efectivas, y por número.
    usable.sort((a, b) => String(a.session_date).localeCompare(String(b.session_date))
      || String(a.client_id).localeCompare(String(b.client_id))
      || String(a.exercise_id).localeCompare(String(b.exercise_id))
      || String(a.set_type).localeCompare(String(b.set_type))
      || Number(a.set_number) - Number(b.set_number));

    // Sesión del mismo alumno, día y fecha (la de esa asignación primero); si no hay, se crea.
    const sessionFor = (row, plan) => {
      const candidates = sessions.filter((session) => session.clientId === row.client_id && session.date === row.session_date && session.programDayId === row.day_id);
      let session = candidates.find((item) => item.programAssignmentId === row.assignment_id) || candidates[0] || null;
      if (!session) {
        session = {
          id: createId('tx-session'),
          clientId: row.client_id,
          planId: null,
          programAssignmentId: row.assignment_id,
          programId: plan.assignment?.programId || '',
          programDayId: row.day_id,
          programDayName: plan.day?.name || '',
          groupSessionId: null,
          date: row.session_date,
          title: `Registro del alumno · ${plan.day?.name || 'Entrenamiento'}`,
          status: 'completed',
          notes: '',
          exercises: []
        };
        sessions.push(session);
        summary.sessionsCreated += 1;
      }
      return session;
    };

    // Circuitos: las filas S1 y S2 de un mismo circuito, alumno y fecha van juntas.
    const circuitGroups = new Map();
    const api = circuitsApi();
    for (const row of usable) {
      if (pendingCoach.has(row)) continue;
      const circuit = findCircuit(state, row);
      if (!circuit) continue;
      const key = [row.client_id, row.assignment_id, row.session_date, row.day_id, row.exercise_id].join('|');
      if (!circuitGroups.has(key)) circuitGroups.set(key, { circuit, rows: [] });
      circuitGroups.get(key).rows.push(row);
    }
    const circuitRows = new Set([...circuitGroups.values()].flatMap((group) => group.rows));
    circuitGroups.forEach(({ circuit, rows: groupRows }) => {
      const effective = groupRows.filter((row) => row.set_type === 'S');
      if (!api || !effective.length) {
        summary.ignored += groupRows.length;
        return;
      }
      const first = effective[0];
      const session = sessionFor(first, findPlan(state, first));
      if (!Array.isArray(session.exercises)) session.exercises = [];
      const list = Array.isArray(session.circuits) ? session.circuits : [];
      const index = list.findIndex((entry) => entry.blockId === circuit.id);
      const current = index >= 0 ? list[index] : null;
      if (current && current.loggedBy !== STUDENT && api.resultHasData(current)) {
        summary.keptCoach += effective.length; // Lo del entrenador gana.
        return;
      }
      const byNumber = {};
      effective.forEach((row) => { byNumber[Number(row.set_number)] = numberOrNull(row.reps); });
      const entry = api.buildSessionEntry(circuit, api.studentSetsToResult(circuit, byNumber), { now, loggedBy: STUDENT });
      if (!entry) {
        summary.ignored += groupRows.length;
        return;
      }
      entry.studentSetIds = effective.map(rowId);
      const same = current && api.formatResult(circuit, current) === api.formatResult(circuit, entry);
      if (same) {
        summary.unchanged += effective.length;
        return;
      }
      if (current) {
        list[index] = { ...current, ...entry };
        summary.updated += effective.length;
      } else {
        list.push(entry);
        summary.added += effective.length;
      }
      session.circuits = list;
    });

    for (const row of usable) {
      if (pendingCoach.has(row) || circuitRows.has(row)) continue;
      const id = rowId(row);
      const plan = findPlan(state, row);
      const timed = plan.exercise?.measure === 'time';
      const session = sessionFor(row, plan);
      if (!Array.isArray(session.exercises)) session.exercises = [];

      let exercise = session.exercises.find((item) => item.programExerciseId === row.exercise_id) || null;
      if (!exercise) {
        const planned = Number(plan.exercise?.sets ?? plan.exercise?.plannedSets);
        exercise = {
          id: createId('tx-exercise'),
          programExerciseId: row.exercise_id,
          libraryExerciseId: plan.exercise?.libraryExerciseId || '',
          exerciseName: plan.exercise?.exerciseName || 'Ejercicio',
          order: session.exercises.length + 1,
          plannedSets: Number.isFinite(planned) && planned >= 1 ? planned : Math.max(1, Number(row.set_number)),
          plannedRepMin: plan.exercise ? (plan.exercise.repMin ?? plan.exercise.repRangeMin ?? null) : null,
          plannedRepMax: plan.exercise ? (plan.exercise.repMax ?? plan.exercise.repRangeMax ?? null) : null,
          targetWeight: Number(plan.exercise?.targetWeight || 0),
          restSeconds: Number(plan.exercise?.restSeconds || 90),
          coachNotes: '',
          ...(timed ? { measure: 'time', ...(plan.exercise.durationSeconds ? { plannedSeconds: plan.exercise.durationSeconds } : {}) } : {}),
          ...(plan.exercise?.blockId ? { blockId: plan.exercise.blockId } : {}),
          sets: []
        };
        session.exercises.push(exercise);
      }
      if (!Array.isArray(exercise.sets)) exercise.sets = [];
      const sets = exercise.sets;

      // Ya traída antes: solo se actualiza si sigue siendo del alumno y cambió.
      const known = sets.find((entry) => entry.studentSetId === id);
      if (known) {
        if (known.loggedBy === STUDENT && !sameValues(known, row, timed)) {
          applyRow(known, row, timed);
          // B3.4: si el entrenador ya la había revisado, el cambio del alumno se vuelve a revisar.
          known.coachValidated = false;
          summary.updated += 1;
        } else if (known.loggedBy === STUDENT) {
          summary.unchanged += 1;
        } else {
          summary.keptCoach += 1;
        }
        continue;
      }

      // La n-ésima serie de ese tipo en la sesión del entrenador.
      const sameType = sets.filter((entry) => setType(entry) === row.set_type).sort((a, b) => Number(a.setNumber || 0) - Number(b.setNumber || 0));
      const target = sameType[Number(row.set_number) - 1] || null;
      if (target && !target.studentSetId && setHasData(target)) {
        summary.keptCoach += 1; // Lo del entrenador gana.
        continue;
      }
      if (target && !target.studentSetId) {
        applyRow(target, row, timed); // Serie vacía del entrenador: se llena.
        target.setType = row.set_type;
        target.loggedBy = STUDENT;
        target.studentSetId = id;
        summary.added += 1;
        continue;
      }
      const nextNumber = sets.reduce((max, entry) => Math.max(max, Number(entry.setNumber || 0)), 0) + 1;
      const entry = {
        setNumber: nextNumber,
        weight: 0,
        reps: null,
        completed: true,
        setType: row.set_type,
        rir: null,
        createdAt: String(row.created_at || row.updated_at || now.toISOString()),
        techniqueStatus: 'pending',
        coachValidated: false,
        personalRecord: false,
        loggedBy: STUDENT,
        studentSetId: id
      };
      applyRow(entry, row, timed);
      sets.push(entry);
      summary.added += 1;
    }
    summary.splits = findDaySplits(state, usable);
    return summary;
  }

  function isStudentSet(entry) {
    return entry?.loggedBy === STUDENT;
  }

  function countStudentSets(session) {
    return (session?.exercises || []).reduce((sum, exercise) => sum + (exercise.sets || []).filter(isStudentSet).length, 0);
  }

  // v0.9.45: circuitos con el resultado que anotó el alumno.
  function countStudentCircuits(session) {
    return (Array.isArray(session?.circuits) ? session.circuits : []).filter(isStudentSet).length;
  }

  window.VALHALLA.studentImportCore = { mergeStudentSets, findDaySplits, isStudentSet, countStudentSets, countStudentCircuits, rowId };
})();
