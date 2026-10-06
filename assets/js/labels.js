(function () {
  // Tabla única de etiquetas en español para los códigos de la biblioteca de ejercicios.
  // Solo cambia lo que se MUESTRA: los valores guardados (quadriceps, horizontal_pull,
  // beginner, ...) no se tocan en el estado, la nube, los respaldos ni lo publicado.
  // Si un valor no está en la tabla, se muestra tal cual (nunca vacío).

  const LABELS = {
    pattern: {
      squat: 'Sentadilla',
      hinge: 'Bisagra de cadera',
      lunge: 'Zancada',
      horizontal_push: 'Empuje horizontal',
      vertical_push: 'Empuje vertical',
      horizontal_pull: 'Tracción horizontal',
      vertical_pull: 'Tracción vertical',
      carry: 'Acarreo',
      core: 'Core',
      conditioning: 'Acondicionamiento',
      mobility: 'Movilidad',
      other: 'Otro'
    },
    muscle: {
      quadriceps: 'Cuádriceps',
      hamstrings: 'Femorales',
      glutes: 'Glúteos',
      adductors: 'Aductores',
      chest: 'Pecho',
      lats: 'Dorsales',
      upper_back: 'Espalda alta',
      mid_back: 'Espalda media',
      traps: 'Trapecios',
      front_delts: 'Deltoides anterior',
      lateral_delts: 'Deltoides lateral',
      rear_delts: 'Deltoides posterior',
      biceps: 'Bíceps',
      triceps: 'Tríceps',
      forearms: 'Antebrazos',
      core: 'Core',
      abdominals: 'Abdominales',
      obliques: 'Oblicuos',
      spinal_erectors: 'Erectores espinales',
      calves: 'Pantorrillas',
      full_body: 'Cuerpo completo',
      other: 'Otro'
    },
    level: {
      beginner: 'Principiante',
      intermediate: 'Intermedio',
      advanced: 'Avanzado'
    },
    loadType: {
      external_load: 'Carga externa',
      bodyweight: 'Peso corporal',
      machine: 'Máquina',
      assisted: 'Asistido',
      band: 'Banda elástica',
      other: 'Otro'
    },
    equipment: {
      barbell: 'Barra',
      bar: 'Barra',
      ez_bar: 'Barra Z',
      hex_bar: 'Barra hexagonal',
      dumbbell: 'Mancuerna',
      kettlebell: 'Pesa rusa',
      bench: 'Banco',
      rack: 'Rack',
      power_rack: 'Rack de potencia',
      smith_machine: 'Máquina Smith',
      cable: 'Polea',
      lat_pulldown: 'Jalón al pecho',
      band: 'Banda elástica',
      leg_press: 'Prensa de piernas',
      leg_extension_machine: 'Máquina de extensión de cuádriceps',
      leg_curl_machine: 'Máquina de curl femoral',
      ghr_bench: 'Banco GHR',
      calf_machine: 'Máquina de pantorrillas',
      seated_calf_machine: 'Máquina de pantorrillas sentado',
      pull_up_bar: 'Barra de dominadas',
      dip_bars: 'Paralelas',
      push_up_handles: 'Agarres para flexiones',
      machine: 'Máquina'
    },
    relation: {
      variant_of: 'Variante de',
      alternative_to: 'Alternativa a',
      regression_of: 'Regresión de',
      progression_of: 'Progresión de'
    }
  };

  // Para comparar sin tildes ni mayúsculas (búsqueda y texto libre).
  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function label(kind, value) {
    const raw = value === null || value === undefined ? '' : String(value);
    const table = LABELS[kind] || {};
    return Object.prototype.hasOwnProperty.call(table, raw) ? table[raw] : raw;
  }

  // Opciones { value, label } ordenadas alfabéticamente por la etiqueta en español.
  function sortedOptions(kind, values) {
    return values
      .map((value) => ({ value, label: label(kind, value) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }

  // Lista guardada (array) -> texto para mostrar: "Glúteos, Core".
  function listLabel(kind, values) {
    return (Array.isArray(values) ? values : []).map((value) => label(kind, value)).join(', ');
  }

  // Texto escrito en el formulario -> códigos. Las etiquetas conocidas vuelven a su
  // código (quadriceps, barbell, ...); lo desconocido se guarda tal como se escribió.
  function listCodes(kind, text) {
    const table = LABELS[kind] || {};
    return String(text || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      if (Object.prototype.hasOwnProperty.call(table, item)) {
        return item;
      }
      const match = Object.keys(table).find((code) => fold(table[code]) === fold(item) || fold(code) === fold(item));
      return match || item;
    });
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.labels = { LABELS, label, sortedOptions, listLabel, listCodes, fold };
})();
