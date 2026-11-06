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

  // Notas internas que no se publican al alumno. Se revisa frase por frase: se quita
  // solo la frase interna y se conserva el resto de la nota de técnica.
  // Convención para el entrenador: empezar una frase con "Interno:" o "Nota interna"
  // la deja solo para él.
  const INTERNAL_NOTE_PATTERNS = [
    /^\s*\(?\s*(interno|interna|nota interna|solo coach|solo entrenador)\b/i,
    /no incluid[oa]s? en los datos/i,
    /datos recibidos/i,
    /\b(por|a) (completar|confirmar|revisar|definir)\b/i,
    /\b(pendiente|falta) (de )?(dato|datos|confirmar|completar|revisar)\b/i,
    /sin datos registrados/i,
    /sin series registradas/i,
    /carga individual por alumno/i,
    /cambiado desde/i,
    // Solo "reps/series/pesos/cargas registrad(o/a)s:" seguido de dos puntos. No cubre
    // frases como "60 kg registrado como asistencia/lastre", que sí sirven al alumno.
    /\b(reps|repeticiones|series|pesos?|cargas?) registrad[oa]s?\s*:/i
  ];

  function isInternalNote(sentence) {
    return INTERNAL_NOTE_PATTERNS.some((pattern) => pattern.test(sentence));
  }

  // Devuelve la nota sin las frases internas.
  function studentNote(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .split(/\n+|(?<=[.!?;])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence && !isInternalNote(sentence))
      .join(' ')
      .slice(0, MAX_TEXT);
  }

  // Comentario de un ejercicio de la sesión: privado por defecto. Se publica solo con
  // visibleToStudent === true y, como las notas de técnica, sin las frases internas
  // ("Interno: …") frase por frase.
  const MAX_COMMENT = 300;
  function publishableComment(comment) {
    if (!comment || typeof comment !== 'object' || comment.visibleToStudent !== true) {
      return '';
    }
    return studentNote(comment.text).slice(0, MAX_COMMENT);
  }

  // Enlace de video de técnica: solo https:// con un dominio real. Devuelve el enlace limpio
  // o '' si no sirve. Se usa al guardar en la galería, al publicar y al mostrarlo al alumno.
  const MAX_VIDEO_URL = 500;
  function safeVideoUrl(value) {
    if (typeof value !== 'string') {
      return '';
    }
    const candidate = value.trim();
    if (candidate.length > MAX_VIDEO_URL || !/^https:\/\/\S+$/i.test(candidate)) {
      return '';
    }
    try {
      const url = new URL(candidate);
      const valid = url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password;
      return valid ? candidate : '';
    } catch (error) {
      return '';
    }
  }

  function foldName(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // Ejercicio de la galería enlazado: por libraryExerciseId y, si no, por nombre.
  // library: solo ejercicios activos (un ejercicio eliminado de la galería no aporta nada).
  function libraryMatchFor(exercise, library) {
    const libraryId = exercise?.libraryExerciseId || '';
    const name = foldName(exercise?.exerciseName || exercise?.name);
    return (libraryId && library.find((item) => item.id === libraryId))
      || (name && library.find((item) => foldName(item.name) === name || foldName(item.normalizedName) === name))
      || null;
  }

  // Video del ejercicio de la galería enlazado.
  function videoUrlFor(exercise, library) {
    const match = libraryMatchFor(exercise, library);
    return match ? safeVideoUrl(match.videoUrl) : '';
  }

  // v0.9.37: músculos del ejercicio de la galería enlazado (misma búsqueda que el video), solo
  // claves conocidas y solo si dan alguna zona de la figura (muscle-map-core.js).
  function musclesFor(exercise, library) {
    const muscleMap = (typeof window !== 'undefined' && window.VALHALLA && window.VALHALLA.muscleMap) || null;
    const match = libraryMatchFor(exercise, library);
    return match && muscleMap ? muscleMap.publishableMuscles(match, exercise?.exerciseName || exercise?.name) : null;
  }

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

  // Ejercicio del programa: nombre, series, repeticiones, carga objetivo, nota de técnica y,
  // solo si la galería tiene un enlace válido, videoUrl (sin video, la clave no existe y el
  // programa queda idéntico al de antes). Igual con primaryMuscle y secondaryMuscles (v0.9.37):
  // solo si el ejercicio de la galería tiene músculos con zona en la figura.
  function pickProgramExercise(exercise, library) {
    const picked = {
      id: text(exercise?.id, 120),
      name: text(exercise?.exerciseName || exercise?.name, 120),
      sets: numberOrNull(exercise?.sets),
      repMin: numberOrNull(exercise?.repMin ?? exercise?.repRangeMin),
      repMax: numberOrNull(exercise?.repMax ?? exercise?.repRangeMax),
      targetWeight: numberOrNull(exercise?.targetWeight),
      techniqueNotes: studentNote(exercise?.notes),
      approximations: list(exercise?.approximations).map(pickPrescribedSet),
      effectiveSets: list(exercise?.effectiveSets).map(pickPrescribedSet)
    };
    const videoUrl = videoUrlFor(exercise, library);
    if (videoUrl) {
      picked.videoUrl = videoUrl;
    }
    const muscles = musclesFor(exercise, library);
    if (muscles) {
      picked.primaryMuscle = text(muscles.primaryMuscle, 40);
      picked.secondaryMuscles = muscles.secondaryMuscles.map((item) => text(item, 40));
    }
    // v0.9.44: por tiempo (measure y durationSeconds) y superserie (blockId). Solo si los tiene:
    // un ejercicio de repeticiones suelto se publica igual que antes.
    if (exercise?.measure === 'time') {
      picked.measure = 'time';
      const seconds = numberOrNull(exercise?.durationSeconds);
      if (seconds !== null) {
        picked.durationSeconds = seconds;
      }
    }
    if (exercise?.blockId) {
      picked.blockId = text(exercise.blockId, 120);
    }
    return picked;
  }

  // Bloque del día (superserie): id, tipo, vueltas y descanso al final.
  const PUBLISHABLE_BLOCK_TYPES = ['superset'];
  function pickBlock(block) {
    return {
      id: text(block?.id, 120),
      type: text(block?.type, 20),
      rounds: numberOrNull(block?.rounds),
      restSeconds: numberOrNull(block?.restSeconds)
    };
  }

  function pickProgramDay(day, index, library) {
    const picked = {
      id: text(day?.id, 120),
      name: text(day?.name, 120) || `Día ${index + 1}`,
      order: numberOrNull(day?.order) ?? index + 1,
      exercises: list(day?.exercises).map((exercise) => pickProgramExercise(exercise, library))
    };
    const blocks = list(day?.blocks).filter((block) => block && block.id && PUBLISHABLE_BLOCK_TYPES.includes(block.type)).map(pickBlock);
    if (blocks.length) {
      picked.blocks = blocks;
    }
    return picked;
  }

  // Programa publicado a partir de una asignación (días, ejercicios, series, cargas).
  function buildPublishedProgram(assignment, library) {
    const activeLibrary = list(library).filter((item) => item && item.active !== false);
    return {
      schema: 1,
      assignmentId: text(assignment?.id, 120),
      programName: text(assignment?.programName, 120) || 'Programa',
      days: list(assignment?.days).map((day, index) => pickProgramDay(day, index, activeLibrary))
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
        const published = {
          setNumber: numberOrNull(entry?.setNumber) ?? index + 1,
          type,
          weight: numberOrNull(entry?.weight),
          reps: numberOrNull(entry?.reps),
          rir: numberOrNull(entry?.rir),
          completed: entry?.completed !== false
        };
        // v0.9.44: serie por tiempo (solo si tiene segundos).
        const seconds = numberOrNull(entry?.seconds);
        if (seconds !== null) {
          published.seconds = seconds;
        }
        sets.push(published);
      });
      const record = {
        name: text(exercise?.exerciseName, 120),
        targetWeight: numberOrNull(exercise?.targetWeight),
        techniqueNotes: studentNote(exercise?.coachNotes),
        sets
      };
      if (exercise?.measure === 'time') {
        record.measure = 'time';
      }
      // Solo si el entrenador lo marcó visible (y no es "Interno:"). Sin comentario, el
      // registro queda igual que antes.
      const comment = publishableComment(exercise?.comment);
      if (comment) {
        record.comment = comment;
      }
      return record;
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
  function buildPublication(assignment, sessions, library) {
    const program = buildPublishedProgram(assignment, library);
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
    findForbiddenKeys,
    studentNote,
    publishableComment,
    safeVideoUrl
  };
})();
