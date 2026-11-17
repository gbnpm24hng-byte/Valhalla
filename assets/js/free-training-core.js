(function () {
  // v0.9.59 · Entrenamiento libre: un día extra que arma el alumno (por ejemplo, un sábado que
  // entrena solo) con ejercicios de la galería del entrenador. El programa (A, B, C) no cambia.
  // Sin red ni pantalla: lo usan student-view.js (alumno), student-import-core.js y app.js (coach).
  //
  // Nube: las series van a student_sets como siempre, con day_id = 'libre' y exercise_id = id del
  // ejercicio en data.library del programa publicado. La base las acepta solo con
  // supabase/b5_entrenamiento_libre.sql: solo series S, de la 1 a la 10, de ids de data.library.
  //
  // Reglas:
  //   - Se ve solo si el alumno puede anotar (can_self_log) y lo publicado trae data.library.
  //   - Hasta 8 ejercicios y 10 series por ejercicio; parte con 3 series y se agregan de a una.
  //   - Los ejercicios elegidos que aún no tienen series viven solo en el teléfono (clave propia
  //     valhalla_free_training:<cuenta>, por programa y fecha). Lo anotado sale de student_sets y de
  //     la cola del teléfono: un ejercicio con series no se puede quitar (la base no deja borrar).
  //   - Récords y "Última vez": una serie libre y una del programa del mismo ejercicio se juntan
  //     (sameExercise: el ejercicio de la galería enlazado y, si no, el nombre sin tildes ni mayúsculas).
  //   - Racha: cuenta como día entrenado. "Semana completa", "✓ hecha esta semana" y la rutina
  //     sugerida: no cuentan. Para el entrenador no es una clase (no descuenta del pago).

  const DAY_ID = 'libre';
  const DAY_NAME = 'Entrenamiento libre';
  const MAX_EXERCISES = 8;
  const MAX_SETS = 10;
  const DEFAULT_SETS = 3;
  const STORE_PREFIX = 'valhalla_free_training:';
  const STORE_VERSION = 1;
  const KEEP_DAYS = 10;

  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isFreeDayId(dayId) {
    return String(dayId || '') === DAY_ID;
  }

  // Sesión del entrenador que vino de un Entrenamiento libre.
  function isFreeSession(session) {
    return Boolean(session) && (session.freeTraining === true || isFreeDayId(session.programDayId));
  }

  // Sesión publicada (student_progress) de un Entrenamiento libre.
  function isFreeProgress(row) {
    const data = row?.data || {};
    return data.free === true || fold(data.dayName) === fold(DAY_NAME);
  }

  // Galería publicada (data.library): solo ejercicios con id y nombre, sin repetir ids.
  function libraryOf(program) {
    const data = program?.data || program || {};
    const seen = new Set();
    return (Array.isArray(data.library) ? data.library : []).filter((item) => {
      const id = typeof item?.id === 'string' ? item.id : '';
      if (!id || seen.has(id) || !String(item?.name || '').trim()) return false;
      seen.add(id);
      return true;
    });
  }

  function isAvailable(program, canLog) {
    return Boolean(canLog) && libraryOf(program).length > 0;
  }

  // Zonas de la figura de un ejercicio de la galería (músculo principal; pecho según el nombre).
  function itemZones(item, muscleMap) {
    if (!muscleMap || !item?.muscle) return [];
    return muscleMap.zonesFor(item.muscle, [], item.name).main;
  }

  // Zonas que tienen al menos un ejercicio, en el orden de la figura: [{ zone, label }].
  function zoneOptions(library, muscleMap) {
    if (!muscleMap) return [];
    const present = new Set();
    (library || []).forEach((item) => itemZones(item, muscleMap).forEach((zone) => present.add(zone)));
    return muscleMap.ZONES.filter((zone) => present.has(zone)).map((zone) => ({ zone, label: muscleMap.zoneLabel(zone) }));
  }

  // Búsqueda: todas las palabras dentro del nombre (sin tildes ni mayúsculas) y, si hay, la zona.
  function matches(item, query, zone, muscleMap) {
    const words = fold(query).split(' ').filter(Boolean);
    const name = fold(item?.name);
    if (words.some((word) => !name.includes(word))) return false;
    return !zone || itemZones(item, muscleMap).includes(zone);
  }

  function search(library, { query = '', zone = '', muscleMap = null } = {}) {
    return (library || []).filter((item) => matches(item, query, zone, muscleMap));
  }

  // Ejercicio del día libre a partir del de la galería (con lo que necesitan las pantallas).
  function toExercise(item, sets) {
    const exercise = {
      id: item.id,
      name: String(item.name || 'Ejercicio'),
      libraryId: item.id,
      sets: Math.min(MAX_SETS, Math.max(1, Math.floor(Number(sets) || DEFAULT_SETS))),
      approximations: [],
      effectiveSets: [],
      free: true
    };
    if (item.muscle) {
      exercise.primaryMuscle = String(item.muscle);
      exercise.secondaryMuscles = [];
    }
    if (item.image) {
      exercise.image = String(item.image);
    }
    return exercise;
  }

  // ---------------------------------------------------------------------------
  // Lo elegido en el teléfono (sin series todavía)
  // ---------------------------------------------------------------------------

  function storeKey(userId) {
    return `${STORE_PREFIX}${userId}`;
  }

  function dayKey(assignmentId, date) {
    return `${assignmentId}|${date}`;
  }

  function readStore(storage, userId) {
    if (!userId) return {};
    try {
      const parsed = JSON.parse(storage.getItem(storeKey(userId)) || 'null');
      return parsed && parsed.version === STORE_VERSION && parsed.userId === userId && parsed.days && typeof parsed.days === 'object' ? parsed.days : {};
    } catch (error) {
      return {};
    }
  }

  // Guarda y olvida las fechas de hace más de 10 días. Devuelve false si no hay espacio.
  function writeStore(storage, userId, days, today) {
    if (!userId) return false;
    const kept = {};
    Object.keys(days || {}).forEach((key) => {
      const date = key.split('|').pop();
      if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= shiftDate(today, -KEEP_DAYS)) {
        kept[key] = days[key];
      }
    });
    try {
      storage.setItem(storeKey(userId), JSON.stringify({ version: STORE_VERSION, userId, days: kept }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function shiftDate(isoDate, days) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
  }

  // [{ id, sets }] elegidos para ese programa y fecha.
  function chosenItems(days, assignmentId, date) {
    const list = days?.[dayKey(assignmentId, date)];
    return Array.isArray(list) ? list.filter((item) => item && typeof item.id === 'string' && item.id) : [];
  }

  // Series libres anotadas en esa fecha: Map(exerciseId → número de serie más alto).
  function loggedSets({ assignmentId, date, setRows = [], outbox = [] }) {
    const top = new Map();
    const put = (id, number) => {
      if (!id) return;
      top.set(id, Math.max(top.get(id) || 0, Number(number) || 0));
    };
    (setRows || []).forEach((row) => {
      if (row && isFreeDayId(row.day_id) && row.assignment_id === assignmentId && row.session_date === date) put(row.exercise_id, row.set_number);
    });
    (outbox || []).forEach((item) => {
      if (item && isFreeDayId(item.dayId) && item.assignmentId === assignmentId && item.sessionDate === date) put(item.exerciseId, item.setNumber);
    });
    return top;
  }

  // Día libre de esa fecha: lo anotado (base y teléfono) más lo elegido sin series, en el orden en
  // que se eligió. Un ejercicio que ya no está en la galería publicada se omite (la base ya no
  // aceptaría sus series; lo anotado sigue en la nube y el entrenador lo ve).
  function buildDay({ program, assignmentId, date, chosen = [], setRows = [], outbox = [] }) {
    const library = libraryOf(program);
    const byId = new Map(library.map((item) => [item.id, item]));
    const logged = loggedSets({ assignmentId, date, setRows, outbox });
    const order = [];
    chosen.forEach((item) => {
      if (!order.includes(item.id)) order.push(item.id);
    });
    logged.forEach((_, id) => {
      if (!order.includes(id)) order.push(id);
    });
    const setsWanted = new Map(chosen.map((item) => [item.id, Number(item.sets) || DEFAULT_SETS]));
    const exercises = order.filter((id) => byId.has(id)).map((id) => {
      const sets = Math.max(setsWanted.get(id) || DEFAULT_SETS, logged.get(id) || 0);
      const exercise = toExercise(byId.get(id), sets);
      exercise.loggedSets = logged.get(id) || 0;
      return exercise;
    });
    return { id: DAY_ID, name: DAY_NAME, free: true, exercises };
  }

  // Cambios a lo elegido. Devuelven la lista nueva (o la misma si no se puede).
  function addExercise(chosen, id) {
    const list = (chosen || []).slice();
    if (!id || list.some((item) => item.id === id) || list.length >= MAX_EXERCISES) return list;
    list.push({ id, sets: DEFAULT_SETS });
    return list;
  }

  function removeExercise(chosen, id) {
    return (chosen || []).filter((item) => item.id !== id);
  }

  function addSet(chosen, id, current) {
    const list = (chosen || []).slice();
    const index = list.findIndex((item) => item.id === id);
    const next = Math.min(MAX_SETS, Math.max(Number(current) || 0, index >= 0 ? Number(list[index].sets) || 0 : 0) + 1);
    if (index >= 0) list[index] = { ...list[index], sets: next };
    else list.push({ id, sets: next });
    return list;
  }

  // ---------------------------------------------------------------------------
  // El mismo ejercicio en el programa y en el libre
  // ---------------------------------------------------------------------------

  // Claves de un ejercicio publicado (programa o libre): 'lib:<id de la galería>' y 'name:<nombre>'.
  function exerciseKeys(exercise) {
    const keys = new Set();
    if (!exercise) return keys;
    const libraryId = exercise.libraryId || (exercise.free ? exercise.id : '');
    if (libraryId) keys.add(`lib:${libraryId}`);
    const name = fold(exercise.name || exercise.exerciseName);
    if (name) keys.add(`name:${name}`);
    return keys;
  }

  // Igual = mismo ejercicio de la galería si los dos lo tienen; si alguno no tiene enlace, mismo nombre.
  function sameExercise(a, b) {
    const ka = exerciseKeys(a);
    const kb = exerciseKeys(b);
    const libA = [...ka].find((key) => key.startsWith('lib:'));
    const libB = [...kb].find((key) => key.startsWith('lib:'));
    if (libA && libB) return libA === libB;
    const nameA = [...ka].find((key) => key.startsWith('name:'));
    const nameB = [...kb].find((key) => key.startsWith('name:'));
    return Boolean(nameA && nameA === nameB);
  }

  // Ejercicio al que apunta una serie (student_sets o cola): del programa publicado o de su galería.
  // programs: filas de student_programs. Devuelve el ejercicio publicado o null.
  function exerciseForSet(programs, assignmentId, dayId, exerciseId) {
    const program = (programs || []).find((row) => row && row.assignment_id === assignmentId);
    if (!program) return null;
    if (isFreeDayId(dayId)) {
      const item = libraryOf(program).find((entry) => entry.id === exerciseId);
      return item ? toExercise(item, 1) : null;
    }
    const day = (program.data?.days || []).find((entry) => entry && entry.id === dayId);
    return (day?.exercises || []).find((entry) => entry && entry.id === exerciseId) || null;
  }

  // "Sáb 22 nov · libre" (para el entrenador).
  const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  function sessionLine(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return 'libre';
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return `${WEEKDAY_SHORT[weekday]} ${day} ${MONTHS_SHORT[month - 1]} · libre`;
  }

  const api = {
    DAY_ID, DAY_NAME, MAX_EXERCISES, MAX_SETS, DEFAULT_SETS, STORE_PREFIX,
    fold, isFreeDayId, isFreeSession, isFreeProgress, libraryOf, isAvailable, itemZones, zoneOptions, search, toExercise,
    storeKey, dayKey, readStore, writeStore, chosenItems, loggedSets, buildDay, addExercise, removeExercise, addSet,
    exerciseKeys, sameExercise, exerciseForSet, sessionLine
  };
  if (typeof window !== 'undefined') {
    window.VALHALLA = window.VALHALLA || {};
    window.VALHALLA.freeTraining = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
