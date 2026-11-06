(function () {
  // v0.9.44 · Bloques (fase 1 de 2): ejercicios por tiempo y superseries. Sin pantalla; la usan
  // data.js (normalizar), app.js (armador y Modo Grupo), publish-core.js y student-view.js.
  //
  // Modelo (todo opcional: un programa sin estos campos queda exactamente igual):
  //   * Ejercicio: measure: 'time' (sin la clave = repeticiones), durationSeconds (segundos por
  //     serie) y blockId (bloque al que pertenece).
  //   * Día: blocks: [{ id, type: 'superset', rounds, restSeconds }]. Los ejercicios de un bloque
  //     van seguidos en day.exercises (la lista sigue siendo plana: todo lo que ya recorre los
  //     ejercicios del día sigue funcionando) y sus series = vueltas del bloque.
  //   * Fase 2 (circuitos: EMOM, AMRAP…): type: 'circuit' con su formato (format, minutes…).
  //     BLOCK_TYPES lo deja preparado; hoy solo se crea 'superset'.
  //   * Serie hecha de un ejercicio por tiempo: seconds (peso 0 y reps null).

  const TIME = 'time';
  const BLOCK_TYPES = ['superset'];
  const SUPERSET_MIN = 2;
  const SUPERSET_MAX = 4;
  const ROUNDS_MIN = 1;
  const ROUNDS_MAX = 10;
  const SECONDS_STEP = 5;
  const SECONDS_MAX = 1000; // límite de la columna reps de student_sets, donde viajan los segundos

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isTimed(exercise) {
    return exercise?.measure === TIME;
  }

  // Entero en [min, max] o null.
  function intOrNull(value, min, max) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const number = Math.round(Number(String(value).replace(',', '.')));
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function cleanSeconds(value) {
    return intOrNull(value, 1, SECONDS_MAX);
  }

  // "40 s"; vacío = ''.
  function formatSeconds(value) {
    const seconds = cleanSeconds(value);
    return seconds === null ? '' : `${seconds} s`;
  }

  // Lo que se pide por serie: "40 s" (tiempo) o "8-12" / "10" / "reps por definir".
  function formatTarget(exercise) {
    if (isTimed(exercise)) {
      return formatSeconds(exercise.durationSeconds) || 'tiempo por definir';
    }
    const min = Number(exercise?.repMin ?? exercise?.repRangeMin ?? exercise?.plannedRepMin);
    const max = Number(exercise?.repMax ?? exercise?.repRangeMax ?? exercise?.plannedRepMax);
    if (!Number.isFinite(min) || min <= 0) {
      return 'reps por definir';
    }
    return Number.isFinite(max) && max > min ? `${min}-${max}` : String(min);
  }

  // Campos del ejercicio del programa (data.js los suma al normalizar). Sin datos = {}.
  function normalizeExerciseFields(raw) {
    const out = {};
    if (raw?.measure === TIME) {
      out.measure = TIME;
      const seconds = cleanSeconds(raw.durationSeconds);
      if (seconds !== null) {
        out.durationSeconds = seconds;
      }
    }
    if (raw?.blockId) {
      out.blockId = String(raw.blockId);
    }
    return out;
  }

  function normalizeBlock(raw) {
    if (!isPlainObject(raw) || !raw.id || !BLOCK_TYPES.includes(raw.type)) {
      return null;
    }
    return {
      id: String(raw.id),
      type: raw.type,
      rounds: intOrNull(raw.rounds, ROUNDS_MIN, ROUNDS_MAX) ?? 3,
      restSeconds: intOrNull(raw.restSeconds, 0, 900) ?? 90
    };
  }

  // Ordena el día: cada bloque con sus ejercicios seguidos (en la posición del primero), quita
  // los bloques con menos de 2 ejercicios (o sin ejercicios) y las referencias a bloques que no
  // existen, y deja las series de cada ejercicio del bloque = vueltas. Sin bloques válidos, el día
  // queda sin la clave blocks. Devuelve { exercises, blocks } (copias; no cambia lo recibido).
  function normalizeDayBlocks(exercises, rawBlocks) {
    const list = Array.isArray(exercises) ? exercises.map((exercise) => ({ ...exercise })) : [];
    const blocks = (Array.isArray(rawBlocks) ? rawBlocks : []).map(normalizeBlock).filter(Boolean)
      .filter((block, index, all) => all.findIndex((other) => other.id === block.id) === index);
    const known = new Set(blocks.map((block) => block.id));
    list.forEach((exercise) => {
      if (exercise.blockId && !known.has(exercise.blockId)) {
        delete exercise.blockId;
      }
    });
    // Agrupa: cada bloque en la posición de su primer ejercicio.
    const ordered = [];
    const placed = new Set();
    list.forEach((exercise) => {
      if (!exercise.blockId) {
        ordered.push(exercise);
        return;
      }
      if (placed.has(exercise.blockId)) {
        return;
      }
      placed.add(exercise.blockId);
      ordered.push(...list.filter((item) => item.blockId === exercise.blockId));
    });
    const kept = blocks.filter((block) => {
      const members = ordered.filter((exercise) => exercise.blockId === block.id);
      if (block.type === 'superset' && members.length >= SUPERSET_MIN && members.length <= SUPERSET_MAX) {
        return true;
      }
      // Un bloque que quedó con 1 ejercicio (o de más) se deshace: sus ejercicios quedan sueltos.
      members.forEach((exercise) => delete exercise.blockId);
      return false;
    });
    kept.forEach((block) => {
      ordered.filter((exercise) => exercise.blockId === block.id).forEach((exercise) => {
        exercise.sets = block.rounds;
      });
    });
    return {
      exercises: ordered.map((exercise, index) => ({ ...exercise, order: index + 1 })),
      blocks: kept
    };
  }

  // Letra de cada bloque del día por orden de aparición: A, B, C…
  function blockLetters(day) {
    const letters = {};
    let next = 0;
    (day?.exercises || []).forEach((exercise) => {
      if (exercise?.blockId && !letters[exercise.blockId] && findBlock(day, exercise.blockId)) {
        letters[exercise.blockId] = String.fromCharCode(65 + next);
        next += 1;
      }
    });
    return letters;
  }

  function findBlock(day, blockId) {
    return (Array.isArray(day?.blocks) ? day.blocks : []).find((block) => block.id === blockId) || null;
  }

  // El día en tramos: [{ kind: 'single', exercise, index }] o
  // [{ kind: 'superset', block, letter, items: [{ exercise, index, position }] }]. index = posición en
  // day.exercises; position = 1, 2… dentro del bloque (A1, A2…).
  function segments(day) {
    const letters = blockLetters(day);
    const out = [];
    (day?.exercises || []).forEach((exercise, index) => {
      const block = exercise?.blockId ? findBlock(day, exercise.blockId) : null;
      if (!block) {
        out.push({ kind: 'single', exercise, index });
        return;
      }
      const last = out[out.length - 1];
      if (last && last.kind === block.type && last.block.id === block.id) {
        last.items.push({ exercise, index, position: last.items.length + 1 });
        return;
      }
      out.push({ kind: block.type, block, letter: letters[block.id], items: [{ exercise, index, position: 1 }] });
    });
    return out;
  }

  // Bloque de un ejercicio: { block, letter, members, position } o null.
  function blockOf(day, exerciseId) {
    const exercise = (day?.exercises || []).find((item) => item.id === exerciseId);
    const block = exercise?.blockId ? findBlock(day, exercise.blockId) : null;
    if (!block) {
      return null;
    }
    const members = day.exercises.filter((item) => item.blockId === block.id);
    return { block, letter: blockLetters(day)[block.id], members, position: members.findIndex((item) => item.id === exerciseId) + 1 };
  }

  // "A1", "A2"… o '' si no está en un bloque.
  function memberLabel(day, exerciseId) {
    const info = blockOf(day, exerciseId);
    return info ? `${info.letter}${info.position}` : '';
  }

  // Día nuevo (copia) con una superserie hecha de los ejercicios nuevos (al final del día).
  function addSuperset(day, newExercises, { id, rounds = 3, restSeconds = 90 } = {}) {
    const count = Array.isArray(newExercises) ? newExercises.length : 0;
    if (!id || count < SUPERSET_MIN || count > SUPERSET_MAX) {
      return null;
    }
    const block = normalizeBlock({ id, type: 'superset', rounds, restSeconds });
    const exercises = [...(day?.exercises || []), ...newExercises.map((exercise) => ({ ...exercise, blockId: block.id }))];
    const result = normalizeDayBlocks(exercises, [...(day?.blocks || []), block]);
    return { ...day, exercises: result.exercises, blocks: result.blocks };
  }

  // Mueve un tramo entero (un ejercicio suelto o un bloque completo) una posición arriba (-1) o
  // abajo (+1). Así un ejercicio suelto nunca queda metido dentro de una superserie.
  function moveSegment(day, segmentIndex, direction) {
    const parts = segments(day);
    const target = segmentIndex + direction;
    if (segmentIndex < 0 || segmentIndex >= parts.length || target < 0 || target >= parts.length) {
      return null;
    }
    [parts[segmentIndex], parts[target]] = [parts[target], parts[segmentIndex]];
    const exercises = parts.flatMap((part) => (part.kind === 'single' ? [part.exercise] : part.items.map((item) => item.exercise)));
    return finishDay(day, exercises, day.blocks);
  }

  // Tramo que contiene el ejercicio de la posición `index` de day.exercises.
  function segmentIndexOf(day, index) {
    return segments(day).findIndex((part) => (part.kind === 'single' ? part.index === index : part.items.some((item) => item.index === index)));
  }

  // Mueve un ejercicio dentro de su bloque (A2 pasa a A1). null si no se puede.
  function moveWithinBlock(day, exerciseId, direction) {
    const info = blockOf(day, exerciseId);
    if (!info) {
      return null;
    }
    const exercises = [...day.exercises];
    const from = exercises.findIndex((item) => item.id === exerciseId);
    const to = from + direction;
    if (to < 0 || to >= exercises.length || exercises[to].blockId !== info.block.id) {
      return null;
    }
    [exercises[from], exercises[to]] = [exercises[to], exercises[from]];
    return finishDay(day, exercises, day.blocks);
  }

  // Saca un ejercicio de su bloque: queda suelto justo después del bloque. Si el bloque queda
  // con un solo ejercicio, se deshace.
  function removeFromBlock(day, exerciseId) {
    const info = blockOf(day, exerciseId);
    if (!info) {
      return null;
    }
    const others = day.exercises.filter((item) => item.id !== exerciseId);
    const lastMember = info.members.filter((item) => item.id !== exerciseId).pop();
    const at = others.findIndex((item) => item.id === lastMember.id) + 1;
    const freed = { ...info.members[info.position - 1] };
    delete freed.blockId;
    others.splice(at, 0, freed);
    return finishDay(day, others, day.blocks);
  }

  // Cambia vueltas o descanso de un bloque (las series de sus ejercicios siguen a las vueltas).
  function updateBlock(day, blockId, changes) {
    const blocks = (day?.blocks || []).map((block) => (block.id === blockId ? normalizeBlock({ ...block, ...changes }) : block));
    return finishDay(day, day.exercises, blocks);
  }

  // Quita un ejercicio del día (si estaba en un bloque y éste queda con uno, se deshace).
  function removeExercise(day, index) {
    const exercises = (day?.exercises || []).filter((_, position) => position !== index);
    return finishDay(day, exercises, day.blocks);
  }

  function finishDay(day, exercises, blocks) {
    const result = normalizeDayBlocks(exercises, blocks);
    const next = { ...day, exercises: result.exercises };
    if (result.blocks.length) {
      next.blocks = result.blocks;
    } else {
      delete next.blocks;
    }
    return next;
  }

  // Modo Grupo: después de anotar una serie de un ejercicio de superserie, ¿a cuál sigue el mismo
  // alumno? { nextId, endOfRound } — nextId: el siguiente del bloque (A1 -> A2) o, tras el último,
  // el primero (vuelta siguiente); endOfRound = terminó la vuelta del bloque (pasa al otro alumno).
  function supersetStep(day, exerciseId) {
    const info = blockOf(day, exerciseId);
    if (!info) {
      return null;
    }
    const isLast = info.position >= info.members.length;
    return { nextId: isLast ? info.members[0].id : info.members[info.position].id, endOfRound: isLast };
  }

  // Series hechas por tiempo: "40, 40, 35 s"; vacío ''.
  function summarizeSeconds(values) {
    const list = (values || []).map(cleanSeconds).filter((value) => value !== null);
    return list.length ? `${list.join(', ')} s` : '';
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.blocksCore = {
    TIME,
    BLOCK_TYPES,
    SUPERSET_MIN,
    SUPERSET_MAX,
    ROUNDS_MIN,
    ROUNDS_MAX,
    SECONDS_STEP,
    SECONDS_MAX,
    isTimed,
    cleanSeconds,
    formatSeconds,
    formatTarget,
    normalizeExerciseFields,
    normalizeBlock,
    normalizeDayBlocks,
    blockLetters,
    findBlock,
    segments,
    blockOf,
    memberLabel,
    addSuperset,
    moveSegment,
    segmentIndexOf,
    moveWithinBlock,
    removeFromBlock,
    updateBlock,
    removeExercise,
    supersetStep,
    summarizeSeconds
  };
})();
