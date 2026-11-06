(function () {
  // "Importar programa" del armador: lee un archivo JSON (formato en docs/formato-programa.md),
  // lo valida y arma un programa NUEVO (ids nuevos, sin alumnos) listo para agregar.
  // Enlaza cada ejercicio con la galería por nombre igual (sin tildes ni mayúsculas); si no
  // está, queda sin enlace. Nunca crea ejercicios ni toca programas, asignaciones o clientes.

  const FORMAT = 'valhalla-programa';
  const FORMAT_VERSION = 1;
  const PROGRAM_KEYS = ['format', 'formatVersion', 'name', 'objective', 'durationWeeks', 'weeklyFrequency', 'days'];
  // v0.9.44 (opcionales; los archivos anteriores siguen valiendo igual): en el día, blocks
  // (superseries); en el ejercicio, measure ("time"), durationSeconds y block (id del bloque).
  const DAY_KEYS = ['name', 'exercises', 'blocks'];
  const EXERCISE_KEYS = ['exerciseName', 'sets', 'repMin', 'repMax', 'targetWeight', 'restSeconds', 'notes', 'zone', 'approximations', 'effectiveSets', 'measure', 'durationSeconds', 'block'];
  const BLOCK_KEYS = ['id', 'type', 'rounds', 'restSeconds'];
  // v0.9.45 (opcional): circuitos en blocks: { id, type: "circuit", format, name?, at?, stations, …datos del
  // formato }. Las estaciones van dentro del circuito (no en exercises). Mismos límites que circuits-core.js.
  const CIRCUIT_FORMATS = ['rounds', 'emom', 'amrap', 'tabata', 'fortime'];
  const CIRCUIT_FIELDS = {
    rounds: ['rounds', 'restSeconds'],
    emom: ['minutes'],
    amrap: ['minutes'],
    tabata: ['rounds', 'workSeconds', 'pauseSeconds'],
    fortime: ['rounds', 'capMinutes']
  };
  const CIRCUIT_DEFAULTS = {
    rounds: { rounds: 3, restSeconds: 60 },
    emom: { minutes: 10 },
    amrap: { minutes: 12 },
    tabata: { rounds: 8, workSeconds: 20, pauseSeconds: 10 },
    fortime: { rounds: 3 }
  };
  const CIRCUIT_LIMITS = {
    rounds: [1, 50],
    restSeconds: [0, 900],
    minutes: [1, 90],
    workSeconds: [5, 120],
    pauseSeconds: [0, 120],
    capMinutes: [1, 180]
  };
  const CIRCUIT_KEYS = ['id', 'type', 'format', 'name', 'at', 'stations', ...Object.keys(CIRCUIT_LIMITS)];
  const ALL_BLOCK_KEYS = [...new Set([...BLOCK_KEYS, ...CIRCUIT_KEYS])];
  const STATION_KEYS = ['exerciseName', 'quantity', 'unit'];
  const STATION_UNITS = ['reps', 'seconds', 'meters'];
  const STATIONS_MAX = 12;
  const SUPERSET_MIN = 2;
  const SUPERSET_MAX = 4;
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
    // Por tiempo: measure "time" y durationSeconds (segundos por serie), sin repeticiones.
    let timed = {};
    if (has(raw, 'measure') && raw.measure !== null && raw.measure !== 'reps') {
      if (raw.measure !== 'time') {
        fail(`${where}: "measure" debe ser "time" (por tiempo) o "reps".`);
      }
      if ((has(raw, 'repMin') && raw.repMin !== null) || (has(raw, 'repMax') && raw.repMax !== null)) {
        fail(`${where}: un ejercicio por tiempo no lleva "repMin" ni "repMax" (usa "durationSeconds").`);
      }
      timed = { measure: 'time', durationSeconds: integer(raw, 'durationSeconds', where, { min: 1, max: 1000, required: true }) };
    } else if (has(raw, 'durationSeconds') && raw.durationSeconds !== null) {
      fail(`${where}: "durationSeconds" solo vale con "measure": "time".`);
    }
    const block = has(raw, 'block') && raw.block !== null ? text(raw, 'block', where, { required: true, max: 40 }) : '';
    return {
      exerciseName: text(raw, 'exerciseName', where, { required: true, max: 120 }),
      // En una superserie las series son las vueltas del bloque: "sets" puede faltar.
      sets: integer(raw, 'sets', where, { min: 1, max: 20, required: !block, fallback: 1 }),
      ...reps(raw, where),
      ...timed,
      ...(block ? { block } : {}),
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
    if (!Array.isArray(raw.exercises)) {
      fail(`${dayWhere}: "exercises" debe ser una lista con al menos un ejercicio.`);
    }
    if (raw.exercises.length > MAX_EXERCISES_PER_DAY) {
      fail(`${dayWhere}: tiene más de ${MAX_EXERCISES_PER_DAY} ejercicios.`);
    }
    const exercises = raw.exercises.map((exercise, exerciseIndex) => readExercise(exercise, `${dayWhere}, ejercicio ${exerciseIndex + 1}`));
    const blocks = readBlocks(raw, dayWhere, exercises);
    // Un día solo con circuitos vale; sin ejercicios ni circuitos, no.
    if (!exercises.length && !blocks.some((block) => block.type === 'circuit')) {
      fail(`${dayWhere}: "exercises" debe ser una lista con al menos un ejercicio (o el día debe tener un circuito en "blocks").`);
    }
    return blocks.length ? { name, exercises, blocks } : { name, exercises };
  }

  // Circuito: { "id", "type": "circuit", "format", "name"?, "at"?, "stations": [{ "exerciseName",
  // "quantity"?, "unit"? }], …datos del formato }. Un dato de otro formato se rechaza.
  function readCircuit(item, where, exercises) {
    if (!has(item, 'format') || !CIRCUIT_FORMATS.includes(item.format)) {
      fail(`${where}: "format" debe ser uno de: ${CIRCUIT_FORMATS.map((format) => `"${format}"`).join(', ')}.`);
    }
    const format = item.format;
    const allowed = CIRCUIT_FIELDS[format];
    const foreign = Object.keys(CIRCUIT_LIMITS).find((key) => has(item, key) && !allowed.includes(key));
    if (foreign) {
      fail(`${where}: "${foreign}" no corresponde al formato "${format}" (usa: ${allowed.join(', ')}).`);
    }
    const out = { id: text(item, 'id', where, { required: true, max: 40 }), type: 'circuit', format };
    const name = text(item, 'name', where, { max: 120 });
    if (name) {
      out.name = name;
    }
    allowed.forEach((key) => {
      const [min, max] = CIRCUIT_LIMITS[key];
      const value = integer(item, key, where, { min, max, fallback: CIRCUIT_DEFAULTS[format][key], allowNull: key === 'capMinutes' });
      if (value !== undefined && value !== null) {
        out[key] = value;
      }
    });
    out.at = integer(item, 'at', where, { min: 0, max: exercises.length, fallback: exercises.length });
    if (!Array.isArray(item.stations) || !item.stations.length) {
      fail(`${where}: "stations" debe ser una lista con al menos una estación.`);
    }
    if (item.stations.length > STATIONS_MAX) {
      fail(`${where}: "stations" tiene más de ${STATIONS_MAX} estaciones.`);
    }
    out.stations = list(item, 'stations', where, STATION_KEYS, (station, stationWhere) => {
      const clean = { exerciseName: text(station, 'exerciseName', stationWhere, { required: true, max: 120 }) };
      const quantity = integer(station, 'quantity', stationWhere, { min: 1, max: 10000, fallback: null, allowNull: true });
      const unit = has(station, 'unit') ? station.unit : null;
      if (unit !== null && !STATION_UNITS.includes(unit)) {
        fail(`${stationWhere}: "unit" debe ser "reps", "seconds" o "meters".`);
      }
      if (unit !== null && quantity === null) {
        fail(`${stationWhere}: "unit" va con "quantity".`);
      }
      if (quantity !== null) {
        clean.quantity = quantity;
        if (unit) {
          clean.unit = unit;
        }
      }
      return clean;
    });
    return out;
  }

  // Bloques del día. Superseries: "blocks": [{ "id": "A", "type": "superset", "rounds": 3, "restSeconds": 60 }]
  // y en cada ejercicio "block": "A" (de 2 a 4 ejercicios seguidos por bloque). Circuitos: ver readCircuit.
  function readBlocks(raw, where, exercises) {
    const blocks = list(raw, 'blocks', where, ALL_BLOCK_KEYS, (item, itemWhere) => {
      const type = text(item, 'type', itemWhere, { required: true, max: 20 });
      if (type === 'circuit') {
        return readCircuit(item, itemWhere, exercises);
      }
      if (type !== 'superset') {
        fail(`${itemWhere}: "type" debe ser "superset" o "circuit".`);
      }
      checkKeys(item, BLOCK_KEYS, itemWhere);
      return {
        id: text(item, 'id', itemWhere, { required: true, max: 40 }),
        type,
        rounds: integer(item, 'rounds', itemWhere, { min: 1, max: 10, required: true }),
        restSeconds: integer(item, 'restSeconds', itemWhere, { min: 0, max: 900, fallback: 90 })
      };
    });
    const ids = blocks.map((block) => block.id);
    const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
    if (repeated) {
      fail(`${where}: el bloque "${repeated}" está repetido en "blocks".`);
    }
    exercises.forEach((exercise, index) => {
      if (exercise.block && !ids.includes(exercise.block)) {
        fail(`${where}, ejercicio ${index + 1}: "block": "${exercise.block}" no está en "blocks" del día.`);
      }
      if (exercise.block && blocks.some((block) => block.id === exercise.block && block.type === 'circuit')) {
        fail(`${where}, ejercicio ${index + 1}: "block": "${exercise.block}" es un circuito; sus ejercicios van en "stations" del circuito.`);
      }
    });
    blocks.forEach((block) => {
      if (block.type === 'circuit') {
        return;
      }
      const positions = exercises.map((exercise, index) => (exercise.block === block.id ? index : -1)).filter((index) => index >= 0);
      if (positions.length < SUPERSET_MIN || positions.length > SUPERSET_MAX) {
        fail(`${where}: la superserie "${block.id}" debe tener de ${SUPERSET_MIN} a ${SUPERSET_MAX} ejercicios (tiene ${positions.length}).`);
      }
      if (positions[positions.length - 1] - positions[0] !== positions.length - 1) {
        fail(`${where}: los ejercicios de la superserie "${block.id}" deben ir seguidos.`);
      }
    });
    // Un circuito no puede quedar en medio de una superserie.
    blocks.filter((block) => block.type === 'circuit').forEach((block) => {
      const before = exercises[block.at - 1];
      const after = exercises[block.at];
      if (before?.block && after?.block === before.block) {
        fail(`${where}: el circuito "${block.id}" ("at": ${block.at}) queda en medio de la superserie "${before.block}".`);
      }
    });
    return blocks;
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
    const days = file.days.map((day, dayIndex) => {
      // Superseries y circuitos: ids nuevos para los bloques (solo en días que los traen).
      const blockIds = new Map((day.blocks || []).map((block) => [block.id, deps.createId(block.type === 'circuit' ? 'program-circuit' : 'program-block')]));
      const built = {
        id: deps.createId('program-day'),
        name: day.name,
        order: dayIndex + 1,
        exercises: day.exercises.map((exercise, exerciseIndex) => {
        const match = byName.get(fold(exercise.exerciseName)) || null;
        if (!match && !missing.some((name) => fold(name) === fold(exercise.exerciseName))) {
          missing.push(exercise.exerciseName);
        }
        return {
          ...(exercise.measure === 'time' ? { measure: 'time', durationSeconds: exercise.durationSeconds } : {}),
          ...(exercise.block ? { blockId: blockIds.get(exercise.block) } : {}),
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
      };
      if (blockIds.size) {
        built.blocks = day.blocks.map((block) => {
          if (block.type !== 'circuit') {
            return { id: blockIds.get(block.id), type: block.type, rounds: block.rounds, restSeconds: block.restSeconds };
          }
          // Estaciones: enlazadas con la galería por nombre igual; si no, quedan como texto libre.
          const { stations, id, ...rest } = block;
          return {
            ...rest,
            id: blockIds.get(id),
            stations: stations.map((station, stationIndex) => {
              const match = byName.get(fold(station.exerciseName)) || null;
              return {
                id: `station-${stationIndex + 1}`,
                name: match ? match.name : station.exerciseName,
                ...(match ? { libraryExerciseId: match.id } : {}),
                ...(station.quantity !== undefined ? { quantity: station.quantity } : {}),
                ...(station.unit ? { unit: station.unit } : {})
              };
            })
          };
        });
        // Las series de cada ejercicio de la superserie son las vueltas del bloque.
        built.exercises.forEach((exercise) => {
          const block = built.blocks.find((item) => item.id === exercise.blockId);
          if (block) {
            exercise.sets = block.rounds;
          }
        });
      }
      return built;
    });
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
      days: program.days.map((day) => {
        // Superseries: "A1", "A2"… (letra por orden de aparición en el día).
        const letters = new Map();
        const counts = new Map();
        const circuits = circuitsOfDay(day);
        const built = {
          name: day.name,
          exercises: day.exercises.map((exercise) => {
            const item = {
              name: exercise.exerciseName,
              sets: exercise.sets,
              reps: exercise.repMin === null || exercise.repMin === undefined ? null : (exercise.repMin === exercise.repMax ? String(exercise.repMin) : `${exercise.repMin}-${exercise.repMax}`),
              linked: Boolean(exercise.libraryExerciseId)
            };
            if (exercise.measure === 'time') {
              item.seconds = exercise.durationSeconds ?? null;
            }
            if (exercise.blockId) {
              if (!letters.has(exercise.blockId)) {
                letters.set(exercise.blockId, String.fromCharCode(65 + letters.size));
              }
              counts.set(exercise.blockId, (counts.get(exercise.blockId) || 0) + 1);
              item.superset = `${letters.get(exercise.blockId)}${counts.get(exercise.blockId)}`;
            }
            return item;
          })
        };
        // v0.9.45: circuitos del día con su lugar (at = ejercicios antes) y sus estaciones. Un día
        // sin circuitos queda igual que antes (sin la clave).
        if (circuits.length) {
          built.circuits = circuits.map((block) => ({
            at: Number.isFinite(Number(block.at)) ? Number(block.at) : day.exercises.length,
            block,
            stations: (block.stations || []).map((station) => ({ name: station.name, linked: Boolean(station.libraryExerciseId) }))
          }));
        }
        return built;
      }),
      exerciseCount: program.days.reduce((sum, day) => sum + day.exercises.length, 0),
      missing
    };
    const circuitCount = program.days.reduce((sum, day) => sum + circuitsOfDay(day).length, 0);
    if (circuitCount) {
      preview.circuitCount = circuitCount;
    }
    return { program, preview };
  }

  function circuitsOfDay(day) {
    return (Array.isArray(day?.blocks) ? day.blocks : []).filter((block) => block && block.type === 'circuit');
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
