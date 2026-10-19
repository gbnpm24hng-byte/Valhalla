(function () {
  // "Importar programa" del armador: lee un archivo JSON (formato en docs/formato-programa.md),
  // lo valida y arma un programa NUEVO (ids nuevos, sin alumnos) listo para agregar.
  // Enlaza cada ejercicio con la galería por nombre igual (sin tildes ni mayúsculas); si no
  // está, queda sin enlace. Nunca crea ejercicios ni toca programas, asignaciones o clientes.

  const FORMAT = 'valhalla-programa';
  const FORMAT_VERSION = 1;
  const PROGRAM_KEYS = ['format', 'formatVersion', 'name', 'objective', 'durationWeeks', 'weeklyFrequency', 'days'];
  const DAY_KEYS = ['name', 'exercises'];
  const EXERCISE_KEYS = ['exerciseName', 'sets', 'repMin', 'repMax', 'targetWeight', 'restSeconds', 'notes', 'zone', 'approximations', 'effectiveSets'];
  const APPROXIMATION_KEYS = ['label', 'weight', 'reps'];
  const EFFECTIVE_SET_KEYS = ['label', 'weight', 'reps', 'rir'];
  const MAX_DAYS = 7;
  const MAX_EXERCISES_PER_DAY = 30;

  class ImportError extends Error {}

  function fail(message) {
    throw new ImportError(message);
  }

  function defaultFold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function has(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined;
  }

  // Un campo mal escrito (por ejemplo "repmin") se rechaza en vez de ignorarse en silencio.
  function checkKeys(source, allowed, where) {
    const unknown = Object.keys(source).filter((key) => !allowed.includes(key));
    if (unknown.length) {
      fail(`${where}: campo desconocido "${unknown[0]}". Campos permitidos: ${allowed.join(', ')}.`);
    }
  }

  function text(source, key, where, { required = false, max = 200 } = {}) {
    if (!has(source, key) || source[key] === null) {
      if (required) {
        fail(`${where}: falta "${key}".`);
      }
      return '';
    }
    if (typeof source[key] !== 'string') {
      fail(`${where}: "${key}" debe ser texto.`);
    }
    const value = source[key].trim();
    if (required && !value) {
      fail(`${where}: "${key}" no puede estar vacío.`);
    }
    if (value.length > max) {
      fail(`${where}: "${key}" tiene más de ${max} caracteres.`);
    }
    return value;
  }

  // Entero en [min, max]. Sin el campo devuelve `fallback`; con allowNull, null se conserva.
  function integer(source, key, where, { min, max, fallback, required = false, allowNull = false }) {
    if (!has(source, key)) {
      if (required) {
        fail(`${where}: falta "${key}".`);
      }
      return fallback;
    }
    const value = source[key];
    if (value === null && allowNull) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      fail(`${where}: "${key}" debe ser un número entero entre ${min} y ${max}${allowNull ? ' (o null)' : ''}.`);
    }
    return value;
  }

  function weight(source, key, where, fallback) {
    if (!has(source, key)) {
      return fallback;
    }
    const value = source[key];
    if (value === null) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000) {
      fail(`${where}: "${key}" debe ser un número de kg entre 0 y 1000 (o null).`);
    }
    return value;
  }

  // Repeticiones: las dos vacías (null o ausentes) = sin repeticiones (series por tiempo).
  // Solo repMin = rango de un número. repMax nunca menor que repMin.
  function reps(source, where) {
    const min = integer(source, 'repMin', where, { min: 1, max: 100, fallback: null, allowNull: true });
    const max = integer(source, 'repMax', where, { min: 1, max: 100, fallback: null, allowNull: true });
    if (min === null && max !== null) {
      fail(`${where}: hay "repMax" sin "repMin". Para series por tiempo deja las dos vacías (null).`);
    }
    if (min === null) {
      return { repMin: null, repMax: null };
    }
    const resolvedMax = max === null ? min : max;
    if (resolvedMax < min) {
      fail(`${where}: "repMax" (${resolvedMax}) es menor que "repMin" (${min}).`);
    }
    return { repMin: min, repMax: resolvedMax };
  }

  function list(source, key, where, keys, readItem) {
    if (!has(source, key) || source[key] === null) {
      return [];
    }
    if (!Array.isArray(source[key])) {
      fail(`${where}: "${key}" debe ser una lista.`);
    }
    if (source[key].length > 20) {
      fail(`${where}: "${key}" tiene más de 20 elementos.`);
    }
    return source[key].map((item, index) => {
      const itemWhere = `${where}, ${key} ${index + 1}`;
      if (!isPlainObject(item)) {
        fail(`${itemWhere}: debe ser un objeto.`);
      }
      checkKeys(item, keys, itemWhere);
      return readItem(item, itemWhere, index);
    });
  }

  function readExercise(raw, where) {
    if (!isPlainObject(raw)) {
      fail(`${where}: debe ser un objeto.`);
    }
    checkKeys(raw, EXERCISE_KEYS, where);
    return {
      exerciseName: text(raw, 'exerciseName', where, { required: true, max: 120 }),
      sets: integer(raw, 'sets', where, { min: 1, max: 20, required: true }),
      ...reps(raw, where),
      targetWeight: weight(raw, 'targetWeight', where, 0),
      restSeconds: integer(raw, 'restSeconds', where, { min: 0, max: 900, fallback: 90 }),
      notes: text(raw, 'notes', where, { max: 500 }),
      zone: text(raw, 'zone', where, { max: 60 }),
      approximations: list(raw, 'approximations', where, APPROXIMATION_KEYS, (item, itemWhere, index) => ({
        label: text(item, 'label', itemWhere, { max: 10 }) || `A${index + 1}`,
        weight: weight(item, 'weight', itemWhere, null),
        reps: integer(item, 'reps', itemWhere, { min: 1, max: 100, fallback: null, allowNull: true })
      })),
      effectiveSets: list(raw, 'effectiveSets', where, EFFECTIVE_SET_KEYS, (item, itemWhere, index) => ({
        label: text(item, 'label', itemWhere, { max: 10 }) || `S${index + 1}`,
        weight: weight(item, 'weight', itemWhere, null),
        reps: integer(item, 'reps', itemWhere, { min: 1, max: 100, fallback: null, allowNull: true }),
        rir: integer(item, 'rir', itemWhere, { min: 0, max: 10, fallback: null, allowNull: true })
      }))
    };
  }

  function readDay(raw, index) {
    const where = `Día ${index + 1}`;
    if (!isPlainObject(raw)) {
      fail(`${where}: debe ser un objeto.`);
    }
    checkKeys(raw, DAY_KEYS, where);
    const name = text(raw, 'name', where, { required: true, max: 80 });
    const dayWhere = `Día ${index + 1} ("${name}")`;
    if (!Array.isArray(raw.exercises) || !raw.exercises.length) {
      fail(`${dayWhere}: "exercises" debe ser una lista con al menos un ejercicio.`);
    }
    if (raw.exercises.length > MAX_EXERCISES_PER_DAY) {
      fail(`${dayWhere}: tiene más de ${MAX_EXERCISES_PER_DAY} ejercicios.`);
    }
    return {
      name,
      exercises: raw.exercises.map((exercise, exerciseIndex) => readExercise(exercise, `${dayWhere}, ejercicio ${exerciseIndex + 1}`))
    };
  }

  // Valida el archivo. Devuelve { file } con los datos limpios o { error } con un mensaje claro.
  function parseProgramFile(rawText) {
    try {
      let parsed;
      try {
        parsed = JSON.parse(String(rawText ?? '').replace(/^﻿/, ''));
      } catch (error) {
        fail('El archivo no es un JSON válido.');
      }
      if (!isPlainObject(parsed)) {
        fail('El archivo debe contener un objeto con el programa.');
      }
      if (parsed.format !== FORMAT) {
        fail(`El archivo no es un programa de Valhalla: falta "format": "${FORMAT}".`);
      }
      if (has(parsed, 'formatVersion') && parsed.formatVersion !== FORMAT_VERSION) {
        fail(`Versión de formato no soportada (${JSON.stringify(parsed.formatVersion)}). Esta app lee la versión ${FORMAT_VERSION}.`);
      }
      checkKeys(parsed, PROGRAM_KEYS, 'Programa');
      const name = text(parsed, 'name', 'Programa', { required: true, max: 120 });
      const objective = text(parsed, 'objective', 'Programa', { max: 80 });
      const durationWeeks = integer(parsed, 'durationWeeks', 'Programa', { min: 1, max: 52, required: true });
      if (!Array.isArray(parsed.days) || !parsed.days.length) {
        fail('Programa: "days" debe ser una lista con al menos un día.');
      }
      if (parsed.days.length > MAX_DAYS) {
        fail(`Programa: tiene más de ${MAX_DAYS} días.`);
      }
      const days = parsed.days.map((day, index) => readDay(day, index));
      const weeklyFrequency = integer(parsed, 'weeklyFrequency', 'Programa', { min: 1, max: 7, fallback: days.length });
      if (weeklyFrequency > days.length) {
        fail(`Programa: "weeklyFrequency" (${weeklyFrequency}) es mayor que la cantidad de días (${days.length}).`);
      }
      return { file: { name, objective, durationWeeks, weeklyFrequency, days } };
    } catch (error) {
      if (error instanceof ImportError) {
        return { error: error.message };
      }
      throw error;
    }
  }

  // Arma el programa nuevo y la vista previa. library: galería actual (solo se lee).
  // deps: { createId, now, fold, categorize, normalizeProgram }.
  function buildProgram(file, library, deps) {
    const fold = deps.fold || defaultFold;
    const byName = new Map();
    (Array.isArray(library) ? library : []).forEach((item) => {
      if (item && item.active !== false && item.id && item.name) {
        const key = fold(item.name);
        if (key && !byName.has(key)) {
          byName.set(key, item);
        }
      }
    });
    const now = deps.now || new Date().toISOString();
    const missing = [];
    const days = file.days.map((day, dayIndex) => ({
      id: deps.createId('program-day'),
      name: day.name,
      order: dayIndex + 1,
      exercises: day.exercises.map((exercise, exerciseIndex) => {
        const match = byName.get(fold(exercise.exerciseName)) || null;
        if (!match && !missing.some((name) => fold(name) === fold(exercise.exerciseName))) {
          missing.push(exercise.exerciseName);
        }
        return {
          id: deps.createId('program-exercise'),
          libraryExerciseId: match ? match.id : '',
          exerciseName: match ? match.name : exercise.exerciseName,
          category: deps.categorize ? deps.categorize(match || { name: exercise.exerciseName }) : 'OTROS',
          order: exerciseIndex + 1,
          sets: exercise.sets,
          repMin: exercise.repMin,
          repMax: exercise.repMax,
          repRangeMin: exercise.repMin,
          repRangeMax: exercise.repMax,
          targetWeight: exercise.targetWeight,
          restSeconds: exercise.restSeconds,
          notes: exercise.notes,
          zone: exercise.zone,
          approximations: exercise.approximations.map((item) => ({ ...item, id: deps.createId('program-approximation') })),
          effectiveSets: exercise.effectiveSets.map((item) => ({ ...item, id: deps.createId('program-set') }))
        };
      })
    }));
    const draft = {
      id: deps.createId('program'),
      name: file.name,
      objective: file.objective,
      startDate: '',
      durationWeeks: file.durationWeeks,
      weeklyFrequency: file.weeklyFrequency,
      assignedClientIds: [],
      days,
      createdAt: now,
      updatedAt: now
    };
    const program = deps.normalizeProgram ? deps.normalizeProgram(draft) : draft;
    const preview = {
      name: program.name,
      durationWeeks: program.durationWeeks,
      weeklyFrequency: program.weeklyFrequency,
      days: program.days.map((day) => ({
        name: day.name,
        exercises: day.exercises.map((exercise) => ({
          name: exercise.exerciseName,
          sets: exercise.sets,
          reps: exercise.repMin === null ? null : (exercise.repMin === exercise.repMax ? String(exercise.repMin) : `${exercise.repMin}-${exercise.repMax}`),
          linked: Boolean(exercise.libraryExerciseId)
        }))
      })),
      exerciseCount: program.days.reduce((sum, day) => sum + day.exercises.length, 0),
      missing
    };
    return { program, preview };
  }

  // Lee el archivo y arma programa + vista previa, o devuelve { error }.
  function planProgramImport(rawText, library, deps) {
    const parsed = parseProgramFile(rawText);
    if (parsed.error) {
      return { error: parsed.error };
    }
    return buildProgram(parsed.file, library, deps);
  }

  // trainingsV08 con el programa agregado al principio (copia; no cambia el recibido).
  // Programas, asignaciones, sesiones y cambios por alumno existentes quedan iguales.
  function addImportedProgram(trainingsV08, program) {
    const source = isPlainObject(trainingsV08) ? trainingsV08 : {};
    const programs = Array.isArray(source.programs) ? source.programs : [];
    if (!program || !program.id || programs.some((item) => item && item.id === program.id)) {
      throw new Error('El programa importado no tiene un id nuevo.');
    }
    return { ...source, programs: [program, ...programs] };
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.programImport = {
    FORMAT,
    FORMAT_VERSION,
    parseProgramFile,
    buildProgram,
    planProgramImport,
    addImportedProgram
  };
})();
