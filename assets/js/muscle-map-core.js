(function () {
  // v0.9.37: figura "esculpida" con los músculos de cada ejercicio (vista del alumno).
  // Mapa puro de los músculos de la galería (primaryMuscle / secondaryMuscles) a las 15 zonas
  // de assets/images/figura-esculpida.svg, y la figura en línea para pintarla con CSS
  // (.vk-musculos [data-zona].is-main / .is-sec en styles.css). No guarda ni sube nada.

  const ZONES = ['pechoSup', 'pechoInf', 'trapecio', 'espaldaMedia', 'dorsales', 'lumbar', 'hombros', 'biceps', 'triceps',
    'core', 'gluteoMayor', 'gluteoMedio', 'cuadriceps', 'isquios', 'gemelos'];

  const ZONE_LABELS = {
    pechoSup: 'Pecho superior',
    pechoInf: 'Pecho inferior',
    trapecio: 'Trapecio',
    espaldaMedia: 'Espalda media',
    dorsales: 'Dorsales',
    lumbar: 'Lumbar',
    hombros: 'Hombros',
    biceps: 'Bíceps',
    triceps: 'Tríceps',
    core: 'Core',
    gluteoMayor: 'Glúteo mayor',
    gluteoMedio: 'Glúteo medio',
    cuadriceps: 'Cuádriceps',
    isquios: 'Isquios',
    gemelos: 'Gemelos'
  };

  // Músculo de la galería → zona. chest se decide por el nombre (chestZones). forearms,
  // adductors, full_body, other o vacío no tienen zona.
  const MUSCLE_ZONE = {
    quadriceps: 'cuadriceps',
    hamstrings: 'isquios',
    calves: 'gemelos',
    glutes: 'gluteoMayor',
    abductors: 'gluteoMedio',
    lats: 'dorsales',
    upper_back: 'espaldaMedia',
    mid_back: 'espaldaMedia',
    traps: 'trapecio',
    spinal_erectors: 'lumbar',
    front_delts: 'hombros',
    lateral_delts: 'hombros',
    rear_delts: 'hombros',
    biceps: 'biceps',
    triceps: 'triceps',
    abdominals: 'core',
    obliques: 'core',
    core: 'core'
  };

  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // Pecho según el nombre: inclinado → superior trabaja e inferior ayuda; declinado o fondos →
  // al revés; si no, trabajan las dos.
  function chestZones(exerciseName) {
    const name = fold(exerciseName);
    if (name.includes('inclinad')) {
      return { main: ['pechoSup'], sec: ['pechoInf'] };
    }
    if (name.includes('declinad') || name.includes('fondo')) {
      return { main: ['pechoInf'], sec: ['pechoSup'] };
    }
    return { main: ['pechoSup', 'pechoInf'], sec: [] };
  }

  function isKnownMuscle(key) {
    return key === 'chest' || Object.prototype.hasOwnProperty.call(MUSCLE_ZONE, key);
  }

  function ordered(set) {
    return ZONES.filter((zone) => set.has(zone));
  }

  // Zonas de un ejercicio: { main, sec } en el orden de ZONES. Si una zona sale como trabaja y
  // como ayuda, gana trabaja. Un pecho secundario deja sus dos zonas como "ayuda".
  function zonesFor(primaryMuscle, secondaryMuscles, exerciseName) {
    const main = new Set();
    const sec = new Set();
    const primary = String(primaryMuscle || '');
    if (primary === 'chest') {
      const chest = chestZones(exerciseName);
      chest.main.forEach((zone) => main.add(zone));
      chest.sec.forEach((zone) => sec.add(zone));
    } else if (MUSCLE_ZONE[primary]) {
      main.add(MUSCLE_ZONE[primary]);
    }
    (Array.isArray(secondaryMuscles) ? secondaryMuscles : []).forEach((muscle) => {
      const key = String(muscle || '');
      if (key === 'chest') {
        const chest = chestZones(exerciseName);
        [...chest.main, ...chest.sec].forEach((zone) => sec.add(zone));
      } else if (Object.prototype.hasOwnProperty.call(MUSCLE_ZONE, key)) {
        sec.add(MUSCLE_ZONE[key]);
      }
    });
    main.forEach((zone) => sec.delete(zone));
    return { main: ordered(main), sec: ordered(sec) };
  }

  function hasZones(zones) {
    return Boolean(zones && (zones.main.length || zones.sec.length));
  }

  // Zonas de un ejercicio publicado (lo que ve el alumno).
  function zonesForExercise(exercise) {
    return zonesFor(exercise?.primaryMuscle, exercise?.secondaryMuscles, exercise?.name || exercise?.exerciseName);
  }

  // Suma del día: trabaja = principales de todos; ayuda = secundarias que no son principales en
  // otro ejercicio. top = hasta 3 principales que más se repiten (empate: orden de ZONES).
  function dayZones(exercises) {
    const count = new Map();
    const sec = new Set();
    (Array.isArray(exercises) ? exercises : []).forEach((exercise) => {
      const zones = zonesForExercise(exercise);
      zones.main.forEach((zone) => count.set(zone, (count.get(zone) || 0) + 1));
      zones.sec.forEach((zone) => sec.add(zone));
    });
    const main = ordered(new Set(count.keys()));
    main.forEach((zone) => sec.delete(zone));
    const top = main.slice().sort((a, b) => (count.get(b) - count.get(a)) || (ZONES.indexOf(a) - ZONES.indexOf(b))).slice(0, 3);
    return { main, sec: ordered(sec), top };
  }

  function zoneLabel(zone) {
    return ZONE_LABELS[zone] || '';
  }

  // "A", "A y B", "A, B y C".
  function joinLabels(zones) {
    const labels = zones.map(zoneLabel).filter(Boolean);
    if (labels.length <= 1) {
      return labels[0] || '';
    }
    return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  }

  // Etiqueta corta de la zona principal ("ESPALDA MEDIA"); con las dos zonas de pecho, "PECHO".
  function mainLabel(zones) {
    if (!zones || !zones.main.length) {
      return '';
    }
    if (zones.main.includes('pechoSup') && zones.main.includes('pechoInf')) {
      return 'PECHO';
    }
    return zoneLabel(zones.main[0]).toUpperCase();
  }

  function ariaText(zones) {
    return `Trabaja: ${joinLabels(zones.main) || 'ninguno'}; ayudan: ${joinLabels(zones.sec) || 'ninguno'}`;
  }

  // Músculos que se publican al alumno: solo claves conocidas, y solo si dan alguna zona.
  function publishableMuscles(libraryItem, exerciseName) {
    const primary = isKnownMuscle(String(libraryItem?.primaryMuscle || '')) ? String(libraryItem.primaryMuscle) : '';
    const secondary = [...new Set((Array.isArray(libraryItem?.secondaryMuscles) ? libraryItem.secondaryMuscles : [])
      .map((item) => String(item || '')).filter(isKnownMuscle))].slice(0, 12);
    return hasZones(zonesFor(primary, secondary, exerciseName)) ? { primaryMuscle: primary, secondaryMuscles: secondary } : null;
  }

  function escapeAttr(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Lugar de la figura. Sin zonas no hay figura (cadena vacía, sin espacio reservado). El SVG se
  // inserta en línea al cargarse (hydrate), porque cada zona se pinta con CSS.
  function figureHtml(zones, size = 'sm') {
    if (!hasZones(zones)) {
      return '';
    }
    const safe = (list) => list.filter((zone) => ZONES.includes(zone)).join(' ');
    return `<span class="vk-fig vk-fig--${escapeAttr(size)}" role="img" aria-label="${escapeAttr(ariaText(zones))}" data-vk-main="${safe(zones.main)}" data-vk-sec="${safe(zones.sec)}"></span>`;
  }

  // Del archivo SVG: sin metadatos ni <style> (los estilos viven en styles.css), oculto para
  // lectores de pantalla (el texto va en el aria-label del contenedor).
  function cleanSvg(text) {
    return String(text || '')
      .replace(/<\?xml[\s\S]*?\?>/g, '')
      .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/\s(?:role|aria-label|xmlns:c2pa)="[^"]*"/g, '')
      .replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"')
      .trim();
  }

  let svgMarkup = '';

  function paint(el) {
    if (!svgMarkup || el.hasAttribute('data-vk-ready')) {
      return;
    }
    el.innerHTML = svgMarkup;
    const main = new Set((el.getAttribute('data-vk-main') || '').split(' ').filter(Boolean));
    const sec = new Set((el.getAttribute('data-vk-sec') || '').split(' ').filter(Boolean));
    el.querySelectorAll('[data-zona]').forEach((part) => {
      const zone = part.getAttribute('data-zona');
      part.classList.toggle('is-main', main.has(zone));
      part.classList.toggle('is-sec', !main.has(zone) && sec.has(zone));
    });
    el.setAttribute('data-vk-ready', '');
  }

  function hydrate(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !svgMarkup) {
      return;
    }
    scope.querySelectorAll('.vk-fig:not([data-vk-ready])').forEach(paint);
  }

  // En el navegador: carga la figura una vez y pinta cada lugar nuevo que aparezca.
  if (typeof document !== 'undefined' && typeof fetch === 'function') {
    fetch('./assets/images/figura-esculpida.svg')
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        svgMarkup = cleanSvg(text);
        hydrate();
      })
      .catch(() => {});
    if (typeof MutationObserver === 'function') {
      let queued = false;
      new MutationObserver(() => {
        if (queued || !svgMarkup) {
          return;
        }
        queued = true;
        Promise.resolve().then(() => {
          queued = false;
          hydrate();
        });
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.muscleMap = {
    ZONES,
    ZONE_LABELS,
    MUSCLE_ZONE,
    zonesFor,
    zonesForExercise,
    dayZones,
    hasZones,
    zoneLabel,
    joinLabels,
    mainLabel,
    ariaText,
    publishableMuscles,
    figureHtml,
    cleanSvg,
    hydrate
  };
})();
