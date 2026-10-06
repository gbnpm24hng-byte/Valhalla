(function () {
  // Fase B1: arma lo que se publica al alumno en student_programs y student_progress.
  // Regla (supabase/A0_CRITERIOS_ACEPTACION.md): se COPIA campo por campo desde una
  // lista cerrada. Nunca se copia un objeto completo, nunca se usa spread y nunca se
  // "copia todo y se borra lo prohibido". Un campo nuevo no se publica hasta que
  // alguien lo agregue aquí a propósito.

  // Claves que jamás pueden aparecer en lo publicado, a ningún nivel.
  const FORBIDDEN_KEYS = [
    'monthly_value', 'payment_status', 'amount', 'renewal_date', 'renewal_day', 'payments',
    'movements', 'accounts', 'phone', 'phone_number', 'email', 'injuries', 'observations',
    'emergency_contact', 'emergency_phone', 'birth_date', 'avoid_exercises', 'intake_comment'
  ];

  // Tipos de serie que acepta la base (student_sets). La app también acepta 'T', pero
  // nunca la crea; si apareciera, esa serie no se publica y se informa.
  const PUBLISHABLE_SET_TYPES = ['A', 'S'];

  const MAX_TEXT = 500;

  function text(value, max = MAX_TEXT) {
    return value === null || value === undefined ? '' : String(value).slice(0, max);
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  // Serie prescrita del programa: etiqueta, peso, repeticiones y RIR.
  function pickPrescribedSet(entry) {
    return {
      label: text(entry?.label, 20),
      weight: numberOrNull(entry?.weight),
      reps: numberOrNull(entry?.reps),
      rir: numberOrNull(entry?.rir)
    };
  }

  // Ejercicio del programa: nombre, series, repeticiones, carga objetivo y nota de técnica.
  function pickProgramExercise(exercise) {
    return {
      id: text(exercise?.id, 120),
      name: text(exercise?.exerciseName || exercise?.name, 120),
      sets: numberOrNull(exercise?.sets),
      repMin: numberOrNull(exercise?.repMin ?? exercise?.repRangeMin),
      repMax: numberOrNull(exercise?.repMax ?? exercise?.repRangeMax),
      targetWeight: numberOrNull(exercise?.targetWeight),
      techniqueNotes: text(exercise?.notes),
      approximations: list(exercise?.approximations).map(pickPrescribedSet),
      effectiveSets: list(exercise?.effectiveSets).map(pickPrescribedSet)
    };
  }

  function pickProgramDay(day, index) {
    return {
      id: text(day?.id, 120),
      name: text(day?.name, 120) || `Día ${index + 1}`,
      order: numberOrNull(day?.order) ?? index + 1,
      exercises: list(day?.exercises).map(pickProgramExercise)
    };
  }

  // Programa publicado a partir de una asignación (días, ejercicios, series, cargas).
  function buildPublishedProgram(assignment) {
    return {
      schema: 1,
      assignmentId: text(assignment?.id, 120),
      programName: text(assignment?.programName, 120) || 'Programa',
      days: list(assignment?.days).map(pickProgramDay)
    };
  }

  // Historial de series de una sesión del cliente. Las series de tipo no publicable
  // ('T') se omiten y se cuentan.
  function buildPublishedSession(session) {
    let omittedSets = 0;
    const exercises = list(session?.exercises).map((exercise) => {
      const sets = [];
      list(exercise?.sets).forEach((entry, index) => {
        const type = String(entry?.setType || entry?.set_type || 'S').trim().toUpperCase();
        if (!PUBLISHABLE_SET_TYPES.includes(type)) {
          omittedSets += 1;
          return;
        }
        sets.push({
          setNumber: numberOrNull(entry?.setNumber) ?? index + 1,
          type,
          weight: numberOrNull(entry?.weight),
          reps: numberOrNull(entry?.reps),
          rir: numberOrNull(entry?.rir),
          completed: entry?.completed !== false
        });
      });
      return {
        name: text(exercise?.exerciseName, 120),
        targetWeight: numberOrNull(exercise?.targetWeight),
        techniqueNotes: text(exercise?.coachNotes),
        sets
      };
    }).filter((exercise) => exercise.sets.length > 0);
    return {
      record: {
        schema: 1,
        sessionId: text(session?.id, 120),
        date: text(session?.date, 10),
        title: text(session?.title, 120),
        dayName: text(session?.programDayName, 120),
        exercises
      },
      omittedSets
    };
  }

  // Todo lo que se publica para un cliente: su programa activo y su historial.
  function buildPublication(assignment, sessions) {
    const program = buildPublishedProgram(assignment);
    let omittedSets = 0;
    const progress = list(sessions)
      .map(buildPublishedSession)
      .map((item) => {
        omittedSets += item.omittedSets;
        return item.record;
      })
      .filter((record) => record.sessionId && record.exercises.length > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { program, progress, omittedSets };
  }

  // Busca claves prohibidas en profundidad. Devuelve las rutas encontradas.
  function findForbiddenKeys(value, path = '$') {
    const found = [];
    if (Array.isArray(value)) {
      value.forEach((item, index) => found.push(...findForbiddenKeys(item, `${path}[${index}]`)));
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        if (FORBIDDEN_KEYS.includes(key)) {
          found.push(`${path}.${key}`);
        }
        found.push(...findForbiddenKeys(value[key], `${path}.${key}`));
      });
    }
    return found;
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.publishCore = {
    FORBIDDEN_KEYS,
    PUBLISHABLE_SET_TYPES,
    buildPublishedProgram,
    buildPublishedSession,
    buildPublication,
    findForbiddenKeys
  };
})();
