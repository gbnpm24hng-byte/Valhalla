(function () {
  // v0.9.56 · Asistencia y cambios de clase (sin red ni pantalla; lo usa app.js).
  //
  // Asistencia (client.training_attendance, como siempre): UNA marca por alumno y fecha.
  //   status 'attended'    → "Vino" (cuenta como clase usada aunque no tenga series)
  //   status 'no_show'     → "No vino" (nunca descuenta clase; noDiscount: true)
  //   status 'rescheduled' → "Reagendada" (Cancelar / reagendar, igual que antes)
  //   otherClass: true     → "Vino a otra clase" (status 'attended'; classLabel opcional)
  // Un día con series y "Vino" cuenta una sola vez: el período de pago cuenta FECHAS.
  //
  // Cambio de clase "Solo un día" (client.classMoves, opcional): [{ date, time, modality,
  // groupSize?, slotKey?, createdAt }]. Ese día el alumno aparece en esa clase y no en la suya.
  // "Desde ahora" no usa campos nuevos: cambia training_days, schedule_notes, service,
  // training_modality y training_group_size (los mismos de Editar).
  // Sin estos campos todo funciona como antes.

  const STATUSES = ['attended', 'no_show', 'rescheduled'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const MAX_LABEL = 60;
  const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  function isDate(value) {
    if (!DATE_RE.test(String(value || ''))) {
      return false;
    }
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
  }

  function isTime(value) {
    return TIME_RE.test(String(value || ''));
  }

  // "9:05" o "09.05" → "09:05"; cualquier otra cosa → ''.
  function cleanTime(value) {
    const match = String(value || '').trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
  }

  function entries(client) {
    return Array.isArray(client?.training_attendance) ? client.training_attendance.filter((entry) => entry && typeof entry === 'object') : [];
  }

  // Marca del día: la de esa clase (sessionKey) o, si no, la última de esa fecha.
  function entryFor(client, date, sessionKey = '') {
    const sameDay = entries(client).filter((entry) => entry.date === date);
    return (sessionKey && sameDay.find((entry) => entry.sessionKey === sessionKey)) || sameDay[sameDay.length - 1] || null;
  }

  // Lista nueva de asistencia: quita las marcas de esa fecha y agrega la nueva.
  // status vacío/null = quitar la marca de ese día. Lo demás de la lista no cambia.
  function withMark(client, mark) {
    const date = String(mark?.date || '');
    const rest = entries(client).filter((entry) => entry.date !== date);
    if (!isDate(date) || !STATUSES.includes(mark?.status)) {
      return rest;
    }
    const entry = {
      sessionKey: String(mark.sessionKey || `${date}:ficha`),
      date,
      time: cleanTime(mark.time),
      markedAt: String(mark.now || new Date().toISOString()),
      status: mark.status,
      reason: String(mark.reason || '').trim(),
      noticeDays: mark.noticeDays ?? null,
      requestedBy: ['student', 'coach'].includes(mark.requestedBy) ? mark.requestedBy : ''
    };
    if (mark.status === 'no_show') {
      entry.noDiscount = true;
    }
    if (mark.status === 'attended' && mark.otherClass) {
      entry.otherClass = true;
      const label = String(mark.classLabel || '').trim().slice(0, MAX_LABEL);
      if (label) {
        entry.classLabel = label;
      }
    }
    return [...rest, entry];
  }

  function statusLabel(entry) {
    if (!entry) {
      return '';
    }
    if (entry.status === 'attended') {
      return entry.otherClass ? `Vino a otra clase${entry.classLabel ? ` (${entry.classLabel})` : ''}` : 'Vino';
    }
    return entry.status === 'no_show' ? 'No vino' : entry.status === 'rescheduled' ? 'Reagendada' : '';
  }

  // ---- Cambio de clase "Solo un día" ----

  function moves(client) {
    return Array.isArray(client?.classMoves) ? client.classMoves.filter((move) => move && isDate(move.date)) : [];
  }

  function moveFor(client, date) {
    const found = moves(client).filter((move) => move.date === date);
    return found[found.length - 1] || null;
  }

  function cleanMove(move, now) {
    const modality = move?.modality === 'group' ? 'group' : 'personalized';
    const clean = {
      date: String(move?.date || ''),
      time: cleanTime(move?.time),
      modality,
      createdAt: String(move?.createdAt || now || new Date().toISOString())
    };
    if (modality === 'group') {
      clean.groupSize = Math.max(2, Math.min(4, Math.floor(Number(move?.groupSize) || 2)));
    }
    const slotKey = String(move?.slotKey || '').trim();
    if (slotKey) {
      clean.slotKey = slotKey.slice(0, 200);
    }
    return clean;
  }

  // Lista nueva de cambios: uno por fecha (el nuevo reemplaza al de ese día), ordenados.
  function withMove(client, move, now) {
    const clean = cleanMove(move, now);
    if (!isDate(clean.date)) {
      return moves(client);
    }
    return [...moves(client).filter((item) => item.date !== clean.date), clean].sort((a, b) => a.date.localeCompare(b.date));
  }

  function withoutMove(client, date) {
    return moves(client).filter((item) => item.date !== date);
  }

  // "Grupo 17:00" / "Personalizado 13:00".
  function classLabel(target) {
    const kind = target?.modality === 'group' ? 'Grupo' : 'Personalizado';
    return [kind, cleanTime(target?.time)].filter(Boolean).join(' ');
  }

  // ---- "Desde ahora" ----

  // [1, 3] → "lunes, miércoles" (lo lee getClientAgendaWeekdays de app.js).
  function weekdaysText(weekdays) {
    return [...new Set((weekdays || []).map(Number))]
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      .sort((a, b) => a - b)
      .map((day) => WEEKDAY_NAMES[day - 1])
      .join(', ');
  }

  // Campos que cambia "Desde ahora" (solo los de Editar). null si falta algo.
  function scheduleChange({ weekdays, time, service, modality, groupSize }) {
    const days = weekdaysText(weekdays);
    const cleanHour = cleanTime(time);
    if (!days || !cleanHour) {
      return null;
    }
    const group = modality === 'group';
    return {
      training_days: days,
      schedule_notes: cleanHour,
      service: String(service || '').trim() || (group ? 'Grupo' : 'Personalizado'),
      training_modality: group ? 'group' : 'personalized',
      training_group_size: group ? Math.max(2, Math.min(4, Math.floor(Number(groupSize) || 2))) : 1
    };
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.attendanceCore = {
    STATUSES,
    WEEKDAY_NAMES,
    isDate,
    isTime,
    cleanTime,
    entries,
    entryFor,
    withMark,
    statusLabel,
    moves,
    moveFor,
    withMove,
    withoutMove,
    classLabel,
    weekdaysText,
    scheduleChange
  };
})();
