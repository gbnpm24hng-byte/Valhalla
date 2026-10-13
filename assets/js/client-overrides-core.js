(function () {
  // Cambios de ejercicio de UN alumno (Modo Grupo), guardados aparte del programa en
  // trainingsV08.clientOverrides y aplicados encima de su asignación al mostrarla.
  // El programa común y las asignaciones de los demás alumnos nunca se modifican.
  //   kind:  'replace' (cambia un ejercicio del día) o 'add' (agrega uno al final del día).
  //   scope: 'today'   (solo la sesión de esa fecha) o 'forward' (esa fecha y las siguientes,
  //          hasta endDate si se quitó después).
  // Se identifican por alumno + programa + día (no por id de asignación), así sobreviven
  // a que el programa se vuelva a guardar o asignar.

  const KINDS = ['replace', 'add'];
  const SCOPES = ['today', 'forward'];

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function sameProgram(override, ctx) {
    if (override.programId && ctx.programId) {
      return override.programId === ctx.programId;
    }
    return Boolean(override.assignmentId) && override.assignmentId === ctx.assignmentId;
  }

  // ctx: { clientId, programId, assignmentId, dayId, date }. Sin fecha (publicar) solo
  // se aplican los cambios "de aquí en adelante".
  function applies(override, ctx) {
    if (!override || override.clientId !== ctx.clientId || override.dayId !== ctx.dayId || !sameProgram(override, ctx)) {
      return false;
    }
    if (override.scope === 'today') {
      return Boolean(ctx.date) && override.date === ctx.date;
    }
    if (override.scope !== 'forward') {
      return false;
    }
    // Un cambio quitado deja de valer desde endDate + 1 (y no se publica).
    if (!ctx.date) {
      return !override.endDate;
    }
    return String(override.date || '') <= ctx.date && (!override.endDate || ctx.date <= override.endDate);
  }

  function previousDay(date) {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  // "Quitar cambio" desde la fecha `date`: un "solo hoy" o uno hecho desde esa misma
  // fecha se borra; uno "de aquí en adelante" anterior se cierra el día antes, así las
  // fechas pasadas siguen mostrando lo que se hizo. Cambia `list` en el lugar.
  function revertOverride(list, overrideId, date, now = new Date().toISOString()) {
    const index = list.findIndex((override) => override.id === overrideId);
    if (index < 0) {
      return null;
    }
    const override = list[index];
    if (override.scope === 'today' || String(override.date || '') >= date) {
      list.splice(index, 1);
      return { override, action: 'deleted' };
    }
    override.endDate = previousDay(date);
    override.updatedAt = now;
    return { override, action: 'ended' };
  }

  // Ejercicio efectivo: copia del guardado en el cambio, con la marca de dónde viene.
  function toEffectiveExercise(override) {
    return { ...override.exercise, overrideId: override.id, overrideScope: override.scope, overrideKind: override.kind };
  }

  // Día con los cambios del alumno aplicados en el orden en que se hicieron. Nunca
  // modifica el día recibido. Un reemplazo cuyo ejercicio ya no está se ignora.
  function applyToDay(day, overrides, ctx) {
    if (!day) {
      return day;
    }
    const matching = list(overrides)
      .filter((override) => applies(override, { ...ctx, dayId: day.id }))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    if (!matching.length) {
      return day;
    }
    const exercises = list(day.exercises).slice();
    matching.forEach((override) => {
      if (override.kind === 'add') {
        exercises.push(toEffectiveExercise(override));
        return;
      }
      const index = exercises.findIndex((exercise) => exercise.id === override.targetExerciseId);
      if (index >= 0) {
        exercises[index] = toEffectiveExercise(override);
      }
    });
    return { ...day, exercises };
  }

  // Asignación del alumno con sus cambios aplicados (copia; la original no cambia).
  function applyToAssignment(assignment, overrides, { date = '' } = {}) {
    if (!assignment) {
      return assignment;
    }
    const ctx = { clientId: assignment.clientId, programId: assignment.programId || '', assignmentId: assignment.id, date };
    const days = list(assignment.days).map((day) => applyToDay(day, overrides, ctx));
    return days.some((day, index) => day !== assignment.days[index]) ? { ...assignment, days } : assignment;
  }

  // "8" -> { min: 8, max: 8 }; "8-10" -> { min: 8, max: 10 }. null si no es válido.
  function parseReps(text) {
    const match = String(text ?? '').trim().match(/^(\d{1,3})(?:\s*[-–a]\s*(\d{1,3}))?$/);
    if (!match) {
      return null;
    }
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : Number(match[2]);
    return min >= 1 && max >= min ? { min, max } : null;
  }

  // Valida lo que escribió el entrenador. Devuelve { error } o { values }.
  function validateInput({ sets, reps, weight }) {
    const setCount = Number(String(sets ?? '').trim());
    if (!Number.isInteger(setCount) || setCount < 1 || setCount > 10) {
      return { error: 'Series: un número de 1 a 10' };
    }
    const repRange = parseReps(reps);
    if (!repRange) {
      return { error: 'Repeticiones: por ejemplo 8 o 8-10' };
    }
    const weightText = String(weight ?? '').trim().replace(',', '.');
    const targetWeight = Number(weightText);
    if (weightText === '' || !Number.isFinite(targetWeight) || targetWeight < 0) {
      return { error: 'Peso: un número en kg (0 si no lleva carga)' };
    }
    return { values: { sets: setCount, repMin: repRange.min, repMax: repRange.max, targetWeight } };
  }

  // Arma el registro del cambio. replaced: ejercicio efectivo que se cambia (o null al agregar).
  function createOverride({ createId, now, client, assignment, day, kind, scope, date, libraryExercise, values, replaced }) {
    if (!KINDS.includes(kind) || !SCOPES.includes(scope)) {
      throw new Error('Cambio de ejercicio inválido');
    }
    const timestamp = now || new Date().toISOString();
    return {
      id: createId('client-override'),
      clientId: client.id,
      programId: assignment.programId || '',
      assignmentId: assignment.id,
      dayId: day.id,
      dayName: day.name || '',
      kind,
      scope,
      date,
      targetExerciseId: kind === 'replace' ? replaced.id : '',
      replacedExerciseName: kind === 'replace' ? (replaced.exerciseName || '') : '',
      exercise: {
        id: createId('client-exercise'),
        libraryExerciseId: libraryExercise.id || '',
        exerciseName: libraryExercise.name || 'Ejercicio',
        category: libraryExercise.category || 'OTROS',
        sets: values.sets,
        repMin: values.repMin,
        repMax: values.repMax,
        repRangeMin: values.repMin,
        repRangeMax: values.repMax,
        targetWeight: values.targetWeight,
        restSeconds: Number(replaced?.restSeconds || 90),
        notes: ''
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.clientOverrides = {
    KINDS,
    SCOPES,
    applies,
    applyToDay,
    applyToAssignment,
    revertOverride,
    parseReps,
    validateInput,
    createOverride
  };
})();
