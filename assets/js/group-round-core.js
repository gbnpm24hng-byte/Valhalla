(function () {
  // Modo Grupo compacto v2 (v0.9.43): lógica sin pantalla de la forma real de trabajo en clase:
  // se anota una serie por alumno y se rota ("✓ S2 hecha · ir a NOMBRE"); al terminar todos sus
  // series, "Cierre de ronda" pide el RIR de cada uno. Solo lee y arma valores del borrador
  // (s1Weight, s1Reps…): no guarda nada. Se prueba en tests/group-round-core.test.js.

  const WEIGHT_STEP = 2.5;
  const REPS_STEP = 1;
  // v0.9.44: ejercicio por tiempo (draft.measure === 'time'): una casilla de segundos por serie
  // (s1Seconds…), de a 5 s, en vez de kilos y repeticiones.
  const SECONDS_STEP = 5;

  function isTimeDraft(draft) {
    return draft?.measure === 'time';
  }

  const blank = (value) => value === null || value === undefined || String(value).trim() === '';

  // "22,5" o "22.5" -> 22.5; vacío o inválido -> null.
  function parseNumber(value) {
    if (blank(value)) {
      return null;
    }
    const number = Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  // Para guardar en el borrador: con punto, como siempre ("22,5" -> "22.5").
  function normalizeWeightText(value) {
    return String(value ?? '').trim().replace(',', '.');
  }

  // Para mostrar: con coma y sin ceros de más (22.5 -> "22,5"; 40 -> "40").
  function formatNumber(value) {
    const number = parseNumber(value);
    return number === null ? '' : String(Math.round(number * 100) / 100).replace('.', ',');
  }

  // Una serie está hecha cuando tiene peso y repeticiones. Por tiempo hay una sola casilla: tocar
  // −/+ no la da por hecha; queda hecha con "✓ S1 hecha" (marca s1Done) o si la registró el alumno.
  function isSetDone(draft, n) {
    if (isTimeDraft(draft)) {
      return parseNumber(draft?.[`s${n}Seconds`]) !== null && draft?.[`s${n}Done`] === '1';
    }
    return parseNumber(draft?.[`s${n}Weight`]) !== null && parseNumber(draft?.[`s${n}Reps`]) !== null;
  }

  function setCountOf(draft) {
    return Math.max(1, Math.round(Number(draft?.setCount)) || 1);
  }

  // Estado de las series del ejercicio actual: hechas, total y la primera sin hacer (0 = todas).
  function setProgress(draft) {
    const total = setCountOf(draft);
    let done = 0;
    let current = 0;
    for (let n = 1; n <= total; n += 1) {
      if (isSetDone(draft, n)) {
        done += 1;
      } else if (!current) {
        current = n;
      }
    }
    return { done, total, current, pending: current > 0 };
  }

  // −/+ : sin valor escrito parte del gris (lo de la última vez) y aplica el paso. Nunca bajo 0.
  function stepValue(value, ghost, delta) {
    const base = parseNumber(value) ?? parseNumber(ghost) ?? 0;
    const next = Math.max(0, Math.round((base + Number(delta)) * 100) / 100);
    return String(next);
  }

  // La vuelta: la serie que están haciendo los que van más atrás (entre los que tienen pendientes).
  // states: [{ clientId, done, pending }] en el orden de la barra.
  function roundNumber(states) {
    const pending = (states || []).filter((item) => item.pending);
    return pending.length ? Math.min(...pending.map((item) => item.done)) + 1 : 0;
  }

  // Siguiente alumno con una serie pendiente, en orden circular desde el actual. Entre los que
  // tienen pendientes, primero los que van más atrás (así se anota la S1 de todos, después la S2…).
  // Devuelve '' si nadie tiene series pendientes.
  function nextClient(states, currentId) {
    const list = states || [];
    const pending = list.filter((item) => item.pending);
    if (!pending.length) {
      return '';
    }
    const least = Math.min(...pending.map((item) => item.done));
    const start = Math.max(list.findIndex((item) => item.clientId === currentId), -1);
    for (let step = 1; step <= list.length; step += 1) {
      const item = list[(start + step + list.length) % list.length];
      if (item.pending && item.done === least) {
        return item.clientId;
      }
    }
    return pending[0].clientId;
  }

  // Ronda terminada: todos los que están haciendo un ejercicio ya completaron sus series.
  function roundComplete(states) {
    const active = (states || []).filter((item) => item.active);
    return active.length > 0 && active.every((item) => !item.pending);
  }

  // "40 × 12, 12, 11"; si cambia el peso: "40 × 12 / 42,5 × 10". Reps sin dato: "—".
  function summarizeSets(entries) {
    // Por tiempo: "40, 40, 35 s" (nunca mezcla kilos con segundos).
    if ((entries || []).some((entry) => entry && 'seconds' in entry)) {
      const seconds = entries.map((entry) => parseNumber(entry?.seconds)).filter((value) => value !== null);
      return seconds.length ? `${seconds.map(formatNumber).join(', ')} s` : '';
    }
    const groups = [];
    (entries || []).forEach((entry) => {
      const weight = parseNumber(entry?.weight);
      if (weight === null) {
        return;
      }
      const reps = parseNumber(entry?.reps);
      const last = groups[groups.length - 1];
      const repsText = reps === null ? '—' : formatNumber(reps);
      if (last && last.weight === weight) {
        last.reps.push(repsText);
      } else {
        groups.push({ weight, reps: [repsText] });
      }
    });
    return groups.map((group) => `${formatNumber(group.weight)} × ${group.reps.join(', ')}`).join(' / ');
  }

  // Series de la sesión de hoy escritas en el borrador (con peso).
  function draftEntries(draft) {
    if (isTimeDraft(draft)) {
      return Array.from({ length: setCountOf(draft) }, (_, index) => ({ seconds: draft?.[`s${index + 1}Seconds`] }))
        .filter((entry) => parseNumber(entry.seconds) !== null);
    }
    return Array.from({ length: setCountOf(draft) }, (_, index) => ({
      weight: draft?.[`s${index + 1}Weight`],
      reps: draft?.[`s${index + 1}Reps`]
    })).filter((entry) => parseNumber(entry.weight) !== null);
  }

  // Tocar la decisión: Subir -> Mantener -> Bajar -> Subir.
  function cycleDecision(decision) {
    return decision === 'up' ? 'keep' : decision === 'keep' ? 'down' : 'up';
  }

  // Iniciales para el círculo de la barra: nombre y apellido ("Alumna Falsa" -> "AF"; solo "Alumna" -> "AL").
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return '?';
    }
    const text = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2);
    return text.toUpperCase();
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.groupRoundCore = {
    WEIGHT_STEP,
    REPS_STEP,
    SECONDS_STEP,
    isTimeDraft,
    parseNumber,
    normalizeWeightText,
    formatNumber,
    isSetDone,
    setProgress,
    stepValue,
    roundNumber,
    nextClient,
    roundComplete,
    summarizeSets,
    draftEntries,
    cycleDecision,
    initials
  };
})();
