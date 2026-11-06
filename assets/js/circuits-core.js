(function () {
  // v0.9.45 · Bloques fase 2: circuitos. Sin pantalla; la usan blocks-core.js (normalizar el bloque),
  // app.js (armador, Modo Grupo y Progreso), publish-core.js, student-view.js y student-import-core.js.
  // Se carga antes de blocks-core.js.
  //
  // Modelo (todo opcional: un día sin circuitos queda exactamente igual):
  //   * Día: un bloque más en day.blocks: { id, type: 'circuit', format, at, name?, …datos del formato,
  //     stations: [{ id, name, libraryExerciseId?, quantity?, unit? }] }. Las estaciones viven dentro del
  //     bloque (no en day.exercises): un circuito no tiene series, ni regla de carga, ni récords.
  //     at = cuántos ejercicios del día van antes del circuito (0 = al principio; el largo = al final).
  //   * Formatos y sus datos:
  //       rounds  (Vueltas)    rounds, restSeconds
  //       emom                 minutes
  //       amrap                minutes
  //       tabata               rounds (8), workSeconds (20), pauseSeconds (10)
  //       fortime (Por tiempo) rounds, capMinutes? (tope opcional)
  //   * Sesión: session.circuits: [{ blockId, format, label, name?, totalRounds?, rounds?, reps?, seconds?,
  //     completed?, note?, noData?, loggedBy?, studentSetIds?, savedAt? }]. Solo existe si se guardó algún resultado.
  //   * Alumno (student_sets, sin cambiar la base): el circuito se publica también como una entrada de
  //     day.exercises con su id y sets: 2, y el resultado viaja en dos filas 'S' en la columna reps:
  //     S1 = rondas / vueltas (en Por tiempo, los minutos); S2 = reps extra del AMRAP (en Por tiempo,
  //     los segundos 0-59). EMOM y Tabata: S1 = rondas cumplidas (todas = "Completado").

  const FORMATS = ['rounds', 'emom', 'amrap', 'tabata', 'fortime'];
  const FORMAT_NAMES = { rounds: 'Vueltas', emom: 'EMOM', amrap: 'AMRAP', tabata: 'Tabata', fortime: 'Por tiempo' };
  const UNITS = ['reps', 'seconds', 'meters'];
  const UNIT_NAMES = { reps: 'reps', seconds: 's', meters: 'm' };
  const STATIONS_MAX = 12;
  const NAME_MAX = 120;
  const NOTE_MAX = 300;
  const STUDENT_SETS = 2; // filas S1 y S2 en student_sets
  const LIMITS = {
    rounds: [1, 50],
    restSeconds: [0, 900],
    minutes: [1, 90],
    workSeconds: [5, 120],
    pauseSeconds: [0, 120],
    capMinutes: [1, 180],
    quantity: [1, 10000]
  };
  const DEFAULTS = {
    rounds: { rounds: 3, restSeconds: 60 },
    emom: { minutes: 10 },
    amrap: { minutes: 12 },
    tabata: { rounds: 8, workSeconds: 20, pauseSeconds: 10 },
    fortime: { rounds: 3 }
  };
  const FIELDS = {
    rounds: ['rounds', 'restSeconds'],
    emom: ['minutes'],
    amrap: ['minutes'],
    tabata: ['rounds', 'workSeconds', 'pauseSeconds'],
    fortime: ['rounds', 'capMinutes']
  };
  const RESULT_MAX = { rounds: 999, reps: 999, seconds: 35999 };

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function intOrNull(value, min, max) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const number = Math.round(Number(String(value).replace(',', '.')));
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function cleanText(value, max) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function isCircuit(block) {
    return block?.type === 'circuit';
  }

  function isFormat(value) {
    return FORMATS.includes(value);
  }

  // Estación: de la galería (libraryExerciseId) o texto libre ("200 m remo"). Sin nombre = null.
  function normalizeStation(raw, index = 0) {
    if (!isPlainObject(raw)) {
      return null;
    }
    const name = cleanText(raw.name ?? raw.exerciseName, NAME_MAX);
    if (!name) {
      return null;
    }
    const out = { id: raw.id ? String(raw.id) : `station-${index + 1}`, name };
    if (raw.libraryExerciseId) {
      out.libraryExerciseId = String(raw.libraryExerciseId);
    }
    const quantity = intOrNull(raw.quantity, ...LIMITS.quantity);
    if (quantity !== null) {
      out.quantity = quantity;
      if (UNITS.includes(raw.unit)) {
        out.unit = raw.unit;
      }
    }
    return out;
  }

  // Circuito del día. Solo quedan los datos de su formato (con valores por defecto). null si no es
  // un circuito válido (sin id o con un formato desconocido).
  function normalizeCircuit(raw) {
    if (!isPlainObject(raw) || !raw.id || !isCircuit(raw) || !isFormat(raw.format)) {
      return null;
    }
    const format = raw.format;
    const out = { id: String(raw.id), type: 'circuit', format };
    const name = cleanText(raw.name, NAME_MAX);
    if (name) {
      out.name = name;
    }
    FIELDS[format].forEach((field) => {
      const value = intOrNull(raw[field], ...LIMITS[field]);
      const fallback = DEFAULTS[format][field];
      if (value !== null) {
        out[field] = value;
      } else if (fallback !== undefined) {
        out[field] = fallback;
      }
    });
    const at = intOrNull(raw.at, 0, 999);
    out.at = at === null ? 999 : at; // sin posición: al final del día
    const seen = new Set();
    out.stations = (Array.isArray(raw.stations) ? raw.stations : []).map(normalizeStation).filter(Boolean)
      .slice(0, STATIONS_MAX)
      .map((station, index) => {
        let id = station.id;
        while (seen.has(id)) {
          id = `${station.id}-${index + 1}`;
        }
        seen.add(id);
        return { ...station, id };
      });
    return out;
  }

  // Circuito nuevo con los datos por defecto del formato.
  function createCircuit({ id, format = 'amrap', at = 999, name = '', stations = [], ...rest } = {}) {
    return normalizeCircuit({ id, type: 'circuit', format, at, name, stations, ...DEFAULTS[format], ...rest });
  }

  function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
  }

  // Lo que se pide en una estación: "Burpees · 10 reps", "Remo · 200 m" o solo el nombre.
  function formatStation(station) {
    const name = cleanText(station?.name, NAME_MAX) || 'Estación';
    const quantity = intOrNull(station?.quantity, ...LIMITS.quantity);
    if (quantity === null) {
      return name;
    }
    const unit = UNIT_NAMES[station?.unit];
    return `${name} · ${unit ? `${quantity} ${unit}` : `× ${quantity}`}`;
  }

  // Título de la tarjeta (en mayúsculas): "CIRCUITO · AMRAP 12 MIN".
  function formatTitle(circuit) {
    return `CIRCUITO · ${formatHeadline(circuit)}`.toUpperCase();
  }

  // "AMRAP 12 min", "EMOM 10 min", "3 vueltas", "Tabata 8 rondas (20/10)", "Por tiempo · 3 vueltas".
  function formatHeadline(circuit) {
    const c = circuit || {};
    switch (c.format) {
      case 'rounds':
        return plural(Number(c.rounds) || 0, 'vuelta', 'vueltas');
      case 'emom':
        return `EMOM ${Number(c.minutes) || 0} min`;
      case 'amrap':
        return `AMRAP ${Number(c.minutes) || 0} min`;
      case 'tabata':
        return `Tabata ${plural(Number(c.rounds) || 0, 'ronda', 'rondas')} (${Number(c.workSeconds) || 0}/${Number(c.pauseSeconds) || 0})`;
      case 'fortime':
        return `Por tiempo · ${plural(Number(c.rounds) || 0, 'vuelta', 'vueltas')}`;
      default:
        return 'Circuito';
    }
  }

  // Detalle debajo del título: "descanso 60 s entre vueltas", "tope 15 min", "20 s de trabajo · 10 s de pausa".
  function formatDetail(circuit) {
    const c = circuit || {};
    if (c.format === 'rounds' && Number(c.restSeconds) > 0) {
      return `descanso ${Number(c.restSeconds)} s entre vueltas`;
    }
    if (c.format === 'fortime' && Number(c.capMinutes) > 0) {
      return `tope ${Number(c.capMinutes)} min`;
    }
    if (c.format === 'tabata') {
      return `${Number(c.workSeconds) || 0} s de trabajo · ${Number(c.pauseSeconds) || 0} s de pausa`;
    }
    if (c.format === 'emom') {
      return 'cada minuto, al empezar el minuto';
    }
    return '';
  }

  // Nombre corto para Progreso: "AMRAP 12", "EMOM 10", "Vueltas", "Tabata 8", "Por tiempo".
  function formatShort(circuit) {
    const c = circuit || {};
    switch (c.format) {
      case 'rounds':
        return 'Vueltas';
      case 'emom':
        return `EMOM ${Number(c.minutes) || 0}`;
      case 'amrap':
        return `AMRAP ${Number(c.minutes) || 0}`;
      case 'tabata':
        return `Tabata ${Number(c.rounds) || 0}`;
      case 'fortime':
        return 'Por tiempo';
      default:
        return 'Circuito';
    }
  }

  // Rondas que tiene el formato para "Completado" (EMOM: un minuto = una ronda; Tabata: sus rondas).
  function totalRounds(circuit) {
    if (circuit?.format === 'emom') {
      return Number(circuit.minutes) || 0;
    }
    if (circuit?.format === 'tabata' || circuit?.format === 'rounds' || circuit?.format === 'fortime') {
      return Number(circuit.rounds) || 0;
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Reloj
  // ---------------------------------------------------------------------------

  // Segundos totales del reloj (0 = sin cuenta regresiva: Vueltas no tiene reloj; Por tiempo es
  // cronómetro y su total es el tope, si hay).
  function clockTotalSeconds(circuit) {
    const c = circuit || {};
    if (c.format === 'amrap' || c.format === 'emom') {
      return (Number(c.minutes) || 0) * 60;
    }
    if (c.format === 'tabata') {
      return (Number(c.rounds) || 0) * ((Number(c.workSeconds) || 0) + (Number(c.pauseSeconds) || 0));
    }
    if (c.format === 'fortime') {
      return (Number(c.capMinutes) || 0) * 60;
    }
    return 0;
  }

  // 'down' (cuenta regresiva: AMRAP, EMOM, Tabata), 'up' (cronómetro: Por tiempo) o 'none' (Vueltas).
  function clockMode(circuit) {
    if (circuit?.format === 'fortime') {
      return 'up';
    }
    return ['amrap', 'emom', 'tabata'].includes(circuit?.format) ? 'down' : 'none';
  }

  // 754 -> "12:34"; 3725 -> "62:05". Sin dato: ''.
  function formatClock(totalSeconds) {
    const seconds = Number(totalSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '';
    }
    const whole = Math.floor(seconds);
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
  }

  // "12:34", "12.34", "12 34" o "754" (segundos) -> 754. Vacío o inválido = null.
  function parseClock(text) {
    const value = String(text ?? '').trim();
    if (!value) {
      return null;
    }
    const parts = value.match(/^(\d{1,3})\s*[:.,\s]\s*(\d{1,2})$/);
    if (parts) {
      const seconds = Number(parts[2]);
      return seconds < 60 ? Math.min(Number(parts[1]) * 60 + seconds, RESULT_MAX.seconds) : null;
    }
    return /^\d{1,5}$/.test(value) ? Math.min(Number(value), RESULT_MAX.seconds) : null;
  }

  // Lo que muestra el reloj a los `elapsedMs` de empezado:
  // { mode, display, elapsed, remaining, finished, minute?, round?, phase?, phaseLeft? }.
  function clockState(circuit, elapsedMs) {
    const mode = clockMode(circuit);
    const elapsed = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1000));
    const total = clockTotalSeconds(circuit);
    if (mode === 'none') {
      return { mode, display: '', elapsed, remaining: 0, finished: false };
    }
    if (mode === 'up') {
      const capped = total > 0 ? Math.min(elapsed, total) : elapsed;
      return { mode, display: formatClock(capped), elapsed: capped, remaining: total > 0 ? total - capped : 0, finished: total > 0 && elapsed >= total };
    }
    const shown = Math.min(elapsed, total);
    const remaining = total - shown;
    const out = { mode, display: formatClock(remaining), elapsed: shown, remaining, finished: elapsed >= total };
    if (circuit.format === 'emom') {
      const minutes = Number(circuit.minutes) || 0;
      out.minute = Math.min(Math.floor(shown / 60) + 1, minutes);
      out.phaseLeft = out.finished ? 0 : 60 - (shown % 60);
    }
    if (circuit.format === 'tabata') {
      const work = Number(circuit.workSeconds) || 0;
      const cycle = work + (Number(circuit.pauseSeconds) || 0);
      const rounds = Number(circuit.rounds) || 0;
      const inCycle = cycle > 0 ? shown % cycle : 0;
      out.round = Math.min(cycle > 0 ? Math.floor(shown / cycle) + 1 : 1, rounds);
      out.phase = out.finished ? 'done' : inCycle < work ? 'work' : 'pause';
      out.phaseLeft = out.finished ? 0 : inCycle < work ? work - inCycle : cycle - inCycle;
    }
    return out;
  }

  // Reloj que se puede pausar: { running, startedAt, accumulatedMs }. now en milisegundos.
  function timerElapsed(timer, now) {
    if (!timer) {
      return 0;
    }
    return (Number(timer.accumulatedMs) || 0) + (timer.running ? Math.max(0, now - (Number(timer.startedAt) || now)) : 0);
  }

  function timerStart(timer, now) {
    if (timer?.running) {
      return timer;
    }
    return { running: true, startedAt: now, accumulatedMs: Number(timer?.accumulatedMs) || 0 };
  }

  function timerPause(timer, now) {
    if (!timer?.running) {
      return timer || { running: false, startedAt: 0, accumulatedMs: 0 };
    }
    return { running: false, startedAt: 0, accumulatedMs: timerElapsed(timer, now) };
  }

  function timerReset() {
    return { running: false, startedAt: 0, accumulatedMs: 0 };
  }

  // ---------------------------------------------------------------------------
  // Resultados
  // ---------------------------------------------------------------------------

  // Resultado de un alumno según el formato. Solo quedan los campos del formato.
  //   rounds:  { rounds }            amrap: { rounds, reps }
  //   emom / tabata: { completed } o { rounds } (rondas cumplidas)
  //   fortime: { seconds }
  // + note (opcional) y noData ("Hecho sin datos": sin números).
  function normalizeResult(format, raw) {
    const source = isPlainObject(raw) ? raw : {};
    const out = {};
    const note = cleanText(source.note, NOTE_MAX);
    if (source.noData === true) {
      out.noData = true;
    } else if (format === 'rounds') {
      const rounds = intOrNull(source.rounds, 0, RESULT_MAX.rounds);
      if (rounds !== null) out.rounds = rounds;
    } else if (format === 'amrap') {
      const rounds = intOrNull(source.rounds, 0, RESULT_MAX.rounds);
      const reps = intOrNull(source.reps, 0, RESULT_MAX.reps);
      if (rounds !== null || reps !== null) {
        out.rounds = rounds ?? 0;
        out.reps = reps ?? 0;
      }
    } else if (format === 'emom' || format === 'tabata') {
      if (source.completed === true) {
        out.completed = true;
      } else {
        const rounds = intOrNull(source.rounds, 0, RESULT_MAX.rounds);
        if (rounds !== null) out.rounds = rounds;
      }
    } else if (format === 'fortime') {
      const seconds = intOrNull(source.seconds, 0, RESULT_MAX.seconds);
      if (seconds !== null) out.seconds = seconds;
    }
    if (note) {
      out.note = note;
    }
    return out;
  }

  // ¿Hay algo para guardar? (un número, "Completado", "Hecho sin datos" o una nota).
  function resultHasData(result) {
    return Boolean(result) && (result.noData === true || result.completed === true || ['rounds', 'reps', 'seconds'].some((key) => Number.isFinite(result[key])) || Boolean(result.note));
  }

  // "5 rondas + 12", "3 vueltas", "Completado", "6 de 8 rondas", "12:34", "Hecho sin datos"; vacío ''.
  function formatResult(circuit, result) {
    const r = result || {};
    if (r.noData) {
      return 'Hecho sin datos';
    }
    switch (circuit?.format) {
      case 'rounds':
        return Number.isFinite(r.rounds) ? plural(r.rounds, 'vuelta', 'vueltas') : '';
      case 'amrap':
        return Number.isFinite(r.rounds) ? `${plural(r.rounds, 'ronda', 'rondas')}${Number(r.reps) > 0 ? ` + ${r.reps}` : ''}` : '';
      case 'emom':
      case 'tabata': {
        if (r.completed) return 'Completado';
        const total = totalRounds(circuit);
        return Number.isFinite(r.rounds) ? (total ? `${r.rounds} de ${plural(total, 'ronda', 'rondas')}` : plural(r.rounds, 'ronda', 'rondas')) : '';
      }
      case 'fortime':
        return Number.isFinite(r.seconds) ? formatClock(r.seconds) : '';
      default:
        return '';
    }
  }

  // Lo que se guarda en session.circuits para un alumno (null si no hay nada que guardar).
  function buildSessionEntry(circuit, result, { now = new Date(), loggedBy = '' } = {}) {
    const clean = normalizeResult(circuit?.format, result);
    if (!circuit?.id || !resultHasData(clean)) {
      return null;
    }
    return {
      blockId: String(circuit.id),
      format: circuit.format,
      label: formatShort(circuit),
      ...(circuit.name ? { name: circuit.name } : {}),
      ...(circuit.format === 'emom' || circuit.format === 'tabata' ? { totalRounds: totalRounds(circuit) } : {}),
      ...clean,
      ...(loggedBy ? { loggedBy } : {}),
      savedAt: now.toISOString()
    };
  }

  // Para data.js: session.circuits limpio. Lo que no se reconoce se descarta; sin entradas = null.
  function normalizeSessionCircuits(list) {
    if (!Array.isArray(list)) {
      return null;
    }
    const out = list.filter((entry) => isPlainObject(entry) && entry.blockId && isFormat(entry.format)).map((entry) => {
      const clean = {
        ...entry, // conserva lo que no conoce (como keepUnknown en data.js)
        blockId: String(entry.blockId),
        format: entry.format,
        label: cleanText(entry.label, 60) || formatShort({ format: entry.format })
      };
      ['rounds', 'reps', 'seconds', 'completed', 'noData', 'note'].forEach((key) => delete clean[key]);
      return { ...clean, ...normalizeResult(entry.format, entry) };
    });
    return out.length ? out : null;
  }

  // "AMRAP 12 · 5 rondas + 12" (Progreso).
  function formatSessionEntry(entry) {
    const total = Number(entry?.totalRounds) || 0;
    const text = formatResult({ format: entry?.format, minutes: total, rounds: total }, entry);
    return [cleanText(entry?.label, 60), text].filter(Boolean).join(' · ');
  }

  // ---------------------------------------------------------------------------
  // Alumno: student_sets (S1 y S2 en la columna reps)
  // ---------------------------------------------------------------------------

  // Resultado -> [{ setNumber, reps }]. Sin datos = [].
  function resultToStudentSets(circuit, result) {
    const r = normalizeResult(circuit?.format, result);
    switch (circuit?.format) {
      case 'rounds':
        return Number.isFinite(r.rounds) ? [{ setNumber: 1, reps: Math.min(r.rounds, 1000) }] : [];
      case 'amrap':
        return Number.isFinite(r.rounds) ? [{ setNumber: 1, reps: Math.min(r.rounds, 1000) }, { setNumber: 2, reps: Math.min(r.reps || 0, 1000) }] : [];
      case 'emom':
      case 'tabata':
        if (r.completed) return [{ setNumber: 1, reps: Math.min(totalRounds(circuit), 1000) }];
        return Number.isFinite(r.rounds) ? [{ setNumber: 1, reps: Math.min(r.rounds, 1000) }] : [];
      case 'fortime':
        return Number.isFinite(r.seconds) ? [{ setNumber: 1, reps: Math.min(Math.floor(r.seconds / 60), 1000) }, { setNumber: 2, reps: r.seconds % 60 }] : [];
      default:
        return [];
    }
  }

  // Filas S1/S2 de student_sets (o del teléfono) -> resultado. byNumber: { 1: reps, 2: reps }.
  function studentSetsToResult(circuit, byNumber) {
    const s1 = byNumber?.[1];
    const s2 = byNumber?.[2];
    const has = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    if (!has(s1)) {
      return {};
    }
    const first = Number(s1);
    switch (circuit?.format) {
      case 'rounds':
        return { rounds: first };
      case 'amrap':
        return { rounds: first, reps: has(s2) ? Number(s2) : 0 };
      case 'emom':
      case 'tabata': {
        const total = totalRounds(circuit);
        return total && first >= total ? { completed: true } : { rounds: first };
      }
      case 'fortime':
        return { seconds: first * 60 + (has(s2) ? Math.min(Number(s2), 59) : 0) };
      default:
        return {};
    }
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.circuitsCore = {
    FORMATS,
    FORMAT_NAMES,
    UNITS,
    UNIT_NAMES,
    STATIONS_MAX,
    STUDENT_SETS,
    LIMITS,
    DEFAULTS,
    FIELDS,
    isCircuit,
    isFormat,
    normalizeStation,
    normalizeCircuit,
    createCircuit,
    formatStation,
    formatTitle,
    formatHeadline,
    formatDetail,
    formatShort,
    totalRounds,
    clockTotalSeconds,
    clockMode,
    clockState,
    formatClock,
    parseClock,
    timerElapsed,
    timerStart,
    timerPause,
    timerReset,
    normalizeResult,
    resultHasData,
    formatResult,
    buildSessionEntry,
    normalizeSessionCircuits,
    formatSessionEntry,
    resultToStudentSets,
    studentSetsToResult
  };
})();
