(function () {
  // v0.9.56 · Mensajes cortos y alegres de la vista del alumno (sin red ni pantalla; lo usa
  // student-view.js). Todo se calcula con lo que la vista ya tiene: el historial de cada
  // ejercicio (exerciseHistory), los récords (findRecords), la racha (weekStreak) y los días
  // de esta semana (activityDates). No guarda nada ni inventa cálculos nuevos.
  //
  // Mensajes y cuándo sale cada uno (máximo 2 a la vez en "Hoy"; prioridad en este orden):
  //   1. Mensaje del coach: el texto que el entrenador escribió en la ficha (hasta 140), llega
  //      al publicar; se ve hasta que lo borre o lo cambie.
  //   2. "¡Récord nuevo en Sentadilla: 70 kg!": hubo récord en su último día entrenado (se ve ese
  //      día y al abrir la sesión siguiente, hasta 7 días después).
  //   3. "¡Semana completa! 3 de 3 🔥": esta semana entrenó tantos días como días tiene su programa.
  //   4. "¡2 semanas seguidas! Sigue así 🔥" (también 4 y 8): la racha llega justo a 2, 4 u 8.
  // En cada ejercicio (pantalla del ejercicio), comparado con la última vez (solo si hay una
  // sesión anterior): "Subiste 5 kg 💪" · "Hiciste 2 reps más" · "Mismo peso, más control:
  // vamos bien en este rango" (mismo peso, mismas reps) · por tiempo "Aguantaste 10 s más".

  const MAX_MESSAGES = 2;
  const MAX_COACH = 140;
  const STREAK_MILESTONES = [2, 4, 8];
  const RECORD_DAYS = 7;

  function num(value) {
    return value !== null && value !== undefined && value !== '' && Number(value) > 0 ? Number(value) : 0;
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 });
  }

  // "Ana María Falsa" → "Ana" (el saludo usa solo el primer nombre).
  function firstName(fullName) {
    return String(fullName || '').trim().split(/\s+/)[0] || '';
  }

  // Mensaje del coach publicado: texto limpio de hasta 140 caracteres ('' si no hay).
  function coachMessage(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_COACH) : '';
  }

  // Series efectivas con dato de una fecha: máximo de kilos y reps hechas con ese máximo.
  function summary(sets, timed) {
    const valid = (sets || []).filter((set) => num(set.weight) || num(set.reps));
    if (!valid.length) {
      return null;
    }
    if (timed) {
      return { seconds: valid.reduce((max, set) => Math.max(max, num(set.reps)), 0) };
    }
    const top = valid.reduce((max, set) => Math.max(max, num(set.weight)), 0);
    const reps = valid.filter((set) => num(set.weight) === top).reduce((total, set) => total + num(set.reps), 0);
    return { top, reps };
  }

  // Comparación con la última vez. current/previous: { sets } de dos fechas distintas.
  // Devuelve { kind, text } o null (sin sesión anterior, o si bajó: no se dice nada).
  function exerciseComparison(current, previous, timed = false) {
    const now = summary(current?.sets, timed);
    const before = summary(previous?.sets, timed);
    if (!now || !before) {
      return null;
    }
    if (timed) {
      const diff = now.seconds - before.seconds;
      return diff > 0 ? { kind: 'more-time', text: `Aguantaste ${formatNumber(diff)} s más 💪` } : null;
    }
    if (now.top > before.top && before.top > 0) {
      return { kind: 'more-weight', text: `Subiste ${formatNumber(now.top - before.top)} kg 💪` };
    }
    if (now.top !== before.top) {
      return null;
    }
    if (now.reps > before.reps) {
      const diff = now.reps - before.reps;
      return { kind: 'more-reps', text: `Hiciste ${diff} ${diff === 1 ? 'rep' : 'reps'} más` };
    }
    if (now.reps === before.reps && now.top > 0) {
      return { kind: 'same', text: 'Mismo peso, más control: vamos bien en este rango' };
    }
    return null;
  }

  // Récords del último día entrenado (records = findRecords de student-view).
  function recordMessage(records, lastDate, today) {
    if (!lastDate || !Array.isArray(records) || !records.length) {
      return null;
    }
    const days = Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${lastDate}T12:00:00`)) / 86400000);
    if (!(days >= 0 && days <= RECORD_DAYS)) {
      return null;
    }
    const ofDay = records.filter((record) => record.date === lastDate);
    if (!ofDay.length) {
      return null;
    }
    const best = ofDay[0];
    const more = ofDay.length - 1;
    return {
      kind: 'record',
      text: `¡Récord nuevo en ${best.name}: ${formatNumber(best.weight)} ${best.unit || 'kg'}!${more ? ` Y ${more} ${more === 1 ? 'récord más' : 'récords más'}.` : ''}`
    };
  }

  // Semana completa: días entrenados esta semana ≥ días de su programa (1 a 7).
  function weekMessage(doneThisWeek, target) {
    const goal = Math.floor(Number(target) || 0);
    if (goal < 1 || goal > 7 || doneThisWeek < goal) {
      return null;
    }
    return { kind: 'week', text: `¡Semana completa! ${goal} de ${goal} 🔥` };
  }

  function streakMessage(weeks) {
    return STREAK_MILESTONES.includes(weeks) ? { kind: 'streak', text: `¡${weeks} semanas seguidas! Sigue así 🔥` } : null;
  }

  // Los que se muestran: en orden de prioridad y como máximo 2.
  function pick({ coach = '', record = null, week = null, streak = null } = {}) {
    const list = [];
    const text = coachMessage(coach);
    if (text) {
      list.push({ kind: 'coach', text });
    }
    [record, week, streak].forEach((item) => {
      if (item && item.text) {
        list.push(item);
      }
    });
    return list.slice(0, MAX_MESSAGES);
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.studentMessages = {
    MAX_MESSAGES,
    MAX_COACH,
    STREAK_MILESTONES,
    firstName,
    coachMessage,
    exerciseComparison,
    recordMessage,
    weekMessage,
    streakMessage,
    pick
  };
})();
