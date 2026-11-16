(function () {
  // v0.9.55 · "Revisar pesos" (Ajustes): series guardadas cuyo peso parece 10 veces lo normal para
  // ese alumno en ese ejercicio (p. ej. 75 cuando sus otras son 7,5: el punto de "7.5" leído como
  // separador de miles antes de v0.9.55). Sin pantalla; app.js dibuja la lista y guarda.
  //
  // Regla exacta (findSuspects):
  //   1. Se miran las series guardadas en las sesiones (state.trainingsV08.sessions) con peso > 0.
  //      Las de ejercicios por tiempo (con segundos) no cuentan.
  //   2. Se agrupan por alumno + ejercicio (nombre sin mayúsculas ni espacios de más).
  //   3. Para cada serie, la referencia es la MEDIANA de los pesos de las series efectivas (S) del
  //      mismo alumno y ejercicio en OTRAS fechas (cada fecha aporta la mediana de sus series, así
  //      una sesión con muchas series no pesa más que otra). Hacen falta al menos 2 fechas distintas
  //      para comparar; si no, la serie no se revisa.
  //   4. Sale en la lista si peso ÷ 10 queda a menos de 25 % de la referencia
  //      (es decir, el peso es entre 7,5 y 12,5 veces la referencia).
  //   5. No sale si se marcó "Está bien" (weightCheck: 'ok' en la serie).
  //
  // "Corregir a X" divide solo el peso por 10 (nada más de la serie cambia, salvo que una serie
  // anotada por el alumno pasa a ser del entrenador, igual que al corregirla en el editor de series).

  const RATIO_MIN = 7.5;
  const RATIO_MAX = 12.5;
  const MIN_OTHER_DATES = 2;

  function exerciseKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function median(values) {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function setType(entry) {
    const raw = String(entry?.setType || entry?.set_type || 'S').trim().toUpperCase();
    return raw === 'A' || raw === 'T' ? raw : 'S';
  }

  function isTimed(entry) {
    return Number(entry?.seconds) > 0;
  }

  function weightOf(entry) {
    const number = Number(entry?.weight);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  // Corrige "75" a "7,5" sin errores de coma flotante (7.5, no 7.500000001).
  function dividedByTen(weight) {
    return Math.round((Number(weight) / 10) * 1000) / 1000;
  }

  // sessions: lista de sesiones { id, clientId, date, exercises: [{ id, exerciseName, sets: [...] }] }.
  // Devuelve [{ sessionId, clientId, date, exerciseId, exerciseName, setIndex, setNumber, setType,
  //            weight, reps, suggested, reference, loggedBy }], de la fecha más nueva a la más antigua.
  function findSuspects(sessions) {
    const groups = new Map();
    (Array.isArray(sessions) ? sessions : []).forEach((session) => {
      if (!session || !session.clientId) return;
      (Array.isArray(session.exercises) ? session.exercises : []).forEach((exercise) => {
        const key = `${session.clientId}::${exerciseKey(exercise?.exerciseName)}`;
        if (!exerciseKey(exercise?.exerciseName)) return;
        (Array.isArray(exercise.sets) ? exercise.sets : []).forEach((entry, setIndex) => {
          if (!entry || isTimed(entry) || !weightOf(entry)) return;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ session, exercise, entry, setIndex });
        });
      });
    });
    const found = [];
    groups.forEach((items) => {
      // Mediana de las series efectivas de cada fecha.
      const byDate = new Map();
      items.forEach((item) => {
        if (setType(item.entry) !== 'S') return;
        const date = String(item.session.date || '');
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(weightOf(item.entry));
      });
      const dateMedians = new Map([...byDate.entries()].map(([date, weights]) => [date, median(weights)]));
      items.forEach((item) => {
        if (item.entry.weightCheck === 'ok') return;
        const date = String(item.session.date || '');
        const others = [...dateMedians.entries()].filter(([otherDate]) => otherDate !== date).map(([, value]) => value);
        if (others.length < MIN_OTHER_DATES) return;
        const reference = median(others);
        if (!reference) return;
        const weight = weightOf(item.entry);
        const ratio = weight / reference;
        if (ratio < RATIO_MIN || ratio > RATIO_MAX) return;
        found.push({
          sessionId: String(item.session.id || ''),
          clientId: String(item.session.clientId),
          date,
          exerciseId: String(item.exercise.id || ''),
          exerciseName: String(item.exercise.exerciseName || ''),
          setIndex: item.setIndex,
          setNumber: Number(item.entry.setNumber || item.setIndex + 1),
          setType: setType(item.entry),
          weight,
          reps: item.entry.reps === null || item.entry.reps === undefined ? null : Number(item.entry.reps),
          suggested: dividedByTen(weight),
          reference,
          loggedBy: item.entry.loggedBy === 'student' ? 'student' : (item.entry.loggedBy || '')
        });
      });
    });
    return found.sort((a, b) => b.date.localeCompare(a.date)
      || a.clientId.localeCompare(b.clientId)
      || a.exerciseName.localeCompare(b.exerciseName)
      || a.setIndex - b.setIndex);
  }

  // Clave estable de una serie de la lista (para los botones).
  function suspectKey(item) {
    return [item.sessionId, item.exerciseId, item.setIndex].join('|');
  }

  // Busca la serie en las sesiones; devuelve { entry } o null si ya no existe o cambió el peso.
  function locate(sessions, item) {
    const session = (sessions || []).find((candidate) => String(candidate?.id || '') === item.sessionId);
    const exercise = (session?.exercises || []).find((candidate) => String(candidate?.id || '') === item.exerciseId);
    const entry = exercise?.sets?.[item.setIndex];
    if (!entry || weightOf(entry) !== item.weight) return null;
    return { session, exercise, entry };
  }

  // "Corregir a X": solo el peso ÷ 10. Devuelve true si cambió algo.
  function applyFix(sessions, item) {
    const found = locate(sessions, item);
    if (!found) return false;
    found.entry.weight = dividedByTen(found.entry.weight);
    // Igual que el editor de series: una serie del alumno que el entrenador corrige pasa a ser suya
    // (así "Traer registros" no la vuelve a pisar con el valor viejo).
    if (found.entry.loggedBy === 'student') {
      found.entry.loggedBy = 'coach';
    }
    return true;
  }

  // "Está bien": queda marcada y no vuelve a salir.
  function markOk(sessions, item) {
    const found = locate(sessions, item);
    if (!found) return false;
    found.entry.weightCheck = 'ok';
    return true;
  }

  const api = { findSuspects, suspectKey, applyFix, markOk, dividedByTen, median, RATIO_MIN, RATIO_MAX, MIN_OTHER_DATES };

  if (typeof window !== 'undefined') {
    window.VALHALLA = window.VALHALLA || {};
    window.VALHALLA.weightReview = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
