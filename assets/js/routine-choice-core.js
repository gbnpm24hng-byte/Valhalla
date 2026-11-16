(function () {
  // v0.9.57 · "Cambiar día": el alumno elige qué rutina de la semana hace hoy (el lunes puede
  // hacer la del viernes). Sin red ni pantalla; lo usan student-view.js (alumno) y app.js
  // (ficha y Progreso: "Lun 16 nov · hizo C").
  //
  // No cambia nada en la nube: student_sets ya guarda day_id (el id del día del programa) con
  // cada serie, así que lo anotado queda con la fecha de hoy y ligado a la rutina elegida.
  //
  // Reglas:
  //   - "✓ hecha esta semana" (lunes a domingo de la fecha que registra): ese día del programa
  //     tiene al menos una serie efectiva (S) suya en esa semana (subida o pendiente, nunca
  //     rechazada) o una sesión publicada por el entrenador con ese nombre de día.
  //   - Sugerencia: la primera rutina (en el orden del programa, con ejercicios) que todavía
  //     no hizo esta semana; si ya hizo todas, la del calendario (nombre que empieza con el
  //     día de la semana); si no hay, la primera con ejercicios.
  //   - Etiqueta corta: "Día C" → "C"; "Viernes — Piernas" → "Piernas"; sin nombre, la letra
  //     por orden.

  const WEEKDAY_PREFIXES = [['domingo', 'dom'], ['lunes', 'lun'], ['martes', 'mar'], ['miercoles', 'mie'], ['jueves', 'jue'], ['viernes', 'vie'], ['sabado', 'sab']];
  const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

  const pad2 = (n) => String(n).padStart(2, '0');

  function fold(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function addDays(isoDate, days) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  // 0 = domingo (calendario puro, sin zona horaria).
  function weekdayOf(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  // Lunes y domingo de la semana de la fecha.
  function weekRange(isoDate) {
    const start = addDays(isoDate, -((weekdayOf(isoDate) + 6) % 7));
    return { start, end: addDays(start, 6) };
  }

  function inWeek(date, range) {
    return isIsoDate(date) && date >= range.start && date <= range.end;
  }

  // Día de la semana (0 = domingo) con que empieza el nombre, o -1.
  function weekdayFromName(name) {
    const folded = fold(name);
    return WEEKDAY_PREFIXES.findIndex(([full, short]) => folded.startsWith(full) || new RegExp(`^${short}\\b`).test(folded));
  }

  // Nombre corto de la rutina para "hizo C" y el encabezado "Lunes — C".
  function routineLabel(day, index = 0) {
    let name = String(day?.name || '').replace(/\s+/g, ' ').trim();
    const letter = /^d[ií]a\s+([a-z0-9]{1,2})$/i;
    if (!name) return String.fromCharCode(65 + Math.max(0, Number(index) || 0));
    if (weekdayFromName(name) >= 0) {
      const rest = name.replace(/^\S+\.?\s*(?:[—–\-:·|/]\s*)?/, '').trim();
      if (rest) name = rest;
    }
    const match = letter.exec(name);
    return match ? match[1].toUpperCase() : name;
  }

  function hasExercises(day) {
    return Array.isArray(day?.exercises) && day.exercises.length > 0;
  }

  // Ids de los días del programa hechos en la semana de `date`.
  // setRows: filas de student_sets; outbox: series del teléfono; progress: sesiones publicadas.
  function doneDayIds({ days = [], assignmentId = '', date, setRows = [], outbox = [], progress = [] }) {
    const done = new Set();
    if (!isIsoDate(date)) return done;
    const range = weekRange(date);
    const ids = new Set((days || []).map((day) => day?.id).filter(Boolean));
    (setRows || []).forEach((row) => {
      if (row && row.assignment_id === assignmentId && (row.set_type || 'S') === 'S' && ids.has(row.day_id) && inWeek(row.session_date, range)) {
        done.add(row.day_id);
      }
    });
    (outbox || []).forEach((item) => {
      if (item && item.status !== 'rejected' && item.assignmentId === assignmentId && item.setType === 'S' && ids.has(item.dayId) && inWeek(item.sessionDate, range)) {
        done.add(item.dayId);
      }
    });
    const byName = new Map();
    (days || []).forEach((day) => {
      const key = fold(day?.name);
      if (key && day?.id && !byName.has(key)) byName.set(key, day.id);
    });
    (progress || []).forEach((row) => {
      const sessionDate = row?.session_date || row?.data?.date;
      const id = byName.get(fold(row?.data?.dayName));
      if (id && inWeek(sessionDate, range)) done.add(id);
    });
    return done;
  }

  // Rutina sugerida para `date`: la primera pendiente de la semana; si hizo todas, la del calendario.
  function suggestDay({ days = [], done = new Set(), date }) {
    const list = (days || []).filter(Boolean);
    const withExercises = list.filter(hasExercises);
    const pending = withExercises.find((day) => !done.has(day.id));
    if (pending) return pending;
    const weekday = isIsoDate(date) ? weekdayOf(date) : -1;
    return withExercises.find((day) => weekdayFromName(day.name) === weekday) || withExercises[0] || list[0] || null;
  }

  // "Lunes — C" (día de la semana de la fecha y la rutina elegida).
  function headline(date, day, index) {
    const weekday = isIsoDate(date) ? WEEKDAY_NAMES[weekdayOf(date)] : '';
    const label = routineLabel(day, index);
    return weekday ? `${weekday} — ${label}` : label;
  }

  // "Ya hiciste B esta semana. ¿Repetirla?"
  function repeatQuestion(day, index) {
    return `Ya hiciste ${routineLabel(day, index)} esta semana. ¿Repetirla?`;
  }

  // "Lun 16 nov · hizo C" (sin rutina: solo la fecha).
  function sessionLine(date, label) {
    if (!isIsoDate(date)) return label ? `hizo ${label}` : '';
    const [, month, day] = date.split('-').map(Number);
    const when = `${WEEKDAY_SHORT[weekdayOf(date)]} ${day} ${MONTHS_SHORT[month - 1]}`;
    return label ? `${when} · hizo ${label}` : when;
  }

  // Etiqueta de la rutina de una sesión del entrenador (programDayId / programDayName).
  function sessionRoutineLabel(session, assignments = []) {
    if (!session || (!session.programDayId && !session.programDayName)) return '';
    const assignment = (assignments || []).find((item) => item && item.id === session.programAssignmentId) || null;
    const days = Array.isArray(assignment?.days) ? assignment.days : [];
    let index = days.findIndex((day) => day && session.programDayId && day.id === session.programDayId);
    if (index < 0 && session.programDayName) {
      index = days.findIndex((day) => fold(day?.name) === fold(session.programDayName));
    }
    if (index >= 0) return routineLabel(days[index], index);
    return session.programDayName ? routineLabel({ name: session.programDayName }, 0) : '';
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.routineChoice = {
    weekRange,
    weekdayFromName,
    routineLabel,
    doneDayIds,
    suggestDay,
    headline,
    repeatQuestion,
    sessionLine,
    sessionRoutineLabel
  };
})();
