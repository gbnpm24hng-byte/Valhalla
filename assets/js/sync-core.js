(function () {
  // Núcleo de la sincronización con la nube (sin red ni pantalla): qué se sube,
  // cómo se compara y qué hacer al iniciar sesión. Lo usa cloud-sync.js.

  // Lista de lo PERMITIDO: solo estas claves del estado suben a coach_state.
  // Una clave nueva del estado no sube hasta que alguien la agregue aquí a propósito.
  const SYNCED_KEYS = [
    'clients',
    'trainings',
    'trainingModelVersion',
    'trainingsV08',
    'exerciseLibrary',
    'sportsProfiles',
    'sportsConsiderations',
    'movementStatuses',
    'nutritionProfiles',
    'nutritionPlans',
    'nutritionLogs',
    'foodBlocks',
    'settings'
  ];

  // De settings solo sube el WhatsApp del entrenador (lo usa el QR de ingreso);
  // magic_budget, ant_budget y savings_rate son finanzas personales.
  const SYNCED_SETTINGS_FIELDS = ['coach_whatsapp_number'];

  // Se quedan solo en el dispositivo: no se suben y no se borran al cargar la nube.
  const LOCAL_ONLY_KEYS = [
    'accounts',
    'categories',
    'movements',
    'recurring',
    'recurringTransactions',
    'financialGoals',
    'debts',
    'profile'
  ];

  // Nunca forman parte del estado que se serializa (viven en otras claves de localStorage).
  const FORBIDDEN_PATTERNS = [/valhalla_auth_access/, /valhalla_sync_meta/, /sb-[a-z0-9]+-auth-token/, /eyJ[A-Za-z0-9_-]{10,}.eyJ[A-Za-z0-9_-]{10,}/];

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  // Arma lo que se sube: solo claves permitidas, copiadas, sin referencias al estado vivo.
  function buildCloudPayload(state) {
    const source = state && typeof state === 'object' ? state : {};
    const payload = {};
    SYNCED_KEYS.forEach((key) => {
      if (source[key] === undefined) {
        return;
      }
      if (key === 'settings') {
        const settings = {};
        SYNCED_SETTINGS_FIELDS.forEach((field) => {
          if (source.settings && source.settings[field] !== undefined) {
            settings[field] = clone(source.settings[field]);
          }
        });
        payload.settings = settings;
        return;
      }
      payload[key] = clone(source[key]);
    });
    assertPayloadIsSafe(payload);
    return payload;
  }

  function assertPayloadIsSafe(payload) {
    const keys = Object.keys(payload);
    const unexpected = keys.filter((key) => !SYNCED_KEYS.includes(key));
    if (unexpected.length) {
      throw new Error(`Claves no permitidas en la subida: ${unexpected.join(', ')}`);
    }
    const leaked = LOCAL_ONLY_KEYS.filter((key) => key in payload);
    if (leaked.length) {
      throw new Error(`La subida incluye datos que deben quedarse en el equipo: ${leaked.join(', ')}`);
    }
    const serialized = JSON.stringify(payload);
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(serialized))) {
      throw new Error('La subida incluye datos de sesión; se canceló.');
    }
  }

  // JSON canónico: claves ordenadas a todo nivel, para comparar sin depender del orden
  // (Postgres jsonb no conserva el orden de las claves).
  function canonicalize(value) {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item === undefined ? null : item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  // Huella corta del JSON canónico (cyrb53). Solo para detectar cambios, no es seguridad.
  function fingerprint(value) {
    const text = typeof value === 'string' ? value : canonicalize(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function latestDate(value) {
    let latest = '';
    const visit = (node, key) => {
      if (Array.isArray(node)) {
        node.forEach((item) => visit(item, ''));
      } else if (node && typeof node === 'object') {
        Object.keys(node).forEach((childKey) => visit(node[childKey], childKey));
      } else if (typeof node === 'string' && /^(updatedAt|createdAt|updated_at|created_at)$/.test(key) && /^\d{4}-\d{2}-\d{2}/.test(node) && node > latest) {
        latest = node;
      }
    };
    visit(value, '');
    return latest;
  }

  function summarize(payload) {
    const data = payload || {};
    const clients = Array.isArray(data.clients) ? data.clients : [];
    const v08 = data.trainingsV08 || {};
    return {
      clientes: clients.length,
      programas: Array.isArray(v08.programs) ? v08.programs.length : 0,
      asignaciones: Array.isArray(v08.assignments) ? v08.assignments.length : 0,
      ejercicios: Array.isArray(data.exerciseLibrary) ? data.exerciseLibrary.length : 0,
      sesiones: Array.isArray(v08.sessions) ? v08.sessions.length : 0,
      asistencias: clients.reduce((total, client) => total + (Array.isArray(client.training_attendance) ? client.training_attendance.length : 0), 0),
      ultimoCambio: latestDate(data)
    };
  }

  // Comparación canónica: mismas claves, mismos conteos y mismo contenido.
  function compare(localPayload, cloudData) {
    const local = localPayload || {};
    const cloud = cloudData || {};
    const localKeys = Object.keys(local).sort();
    const cloudKeys = Object.keys(cloud).sort();
    const keysMatch = canonicalize(localKeys) === canonicalize(cloudKeys);
    const localSummary = summarize(local);
    const cloudSummary = summarize(cloud);
    const countFields = ['clientes', 'programas', 'asignaciones', 'ejercicios', 'sesiones', 'asistencias'];
    const countDifferences = countFields.filter((field) => localSummary[field] !== cloudSummary[field]);
    const identical = canonicalize(local) === canonicalize(cloud);
    return {
      identical,
      keysMatch,
      countsMatch: countDifferences.length === 0,
      missingInCloud: localKeys.filter((key) => !cloudKeys.includes(key)),
      extraInCloud: cloudKeys.filter((key) => !localKeys.includes(key)),
      countDifferences
    };
  }

  // Decide qué hacer al iniciar sesión como entrenador.
  //  - cloudRow: fila de coach_state (o null si no hay)
  //  - localStored: true si este equipo tiene estado guardado en localStorage
  //  - localPayload: lo que este equipo subiría (buildCloudPayload del estado local)
  //  - meta: marca de última sincronización de este equipo (o null)
  function decideSyncAction({ cloudRow, localStored, localPayload, meta, ownerId }) {
    if (!cloudRow) {
      return 'offer-upload';
    }
    if (!localStored) {
      return 'load-cloud';
    }
    if (compare(localPayload, cloudRow.data).identical) {
      return 'in-sync';
    }
    // La nube no cambió desde que este equipo sincronizó: la diferencia son cambios
    // hechos aquí después. Quedan "pendientes de sincronizar" (los subirá A3).
    if (meta && meta.ownerId === ownerId && meta.version === cloudRow.version && meta.cloudHash === fingerprint(cloudRow.data)) {
      return 'pending-local';
    }
    return 'choose';
  }

  // Reemplaza en el estado local SOLO las claves sincronizadas por las de la nube.
  // Las finanzas y el perfil local se conservan tal cual. Nunca combina listas.
  function applyCloudData(localState, cloudData) {
    const base = clone(localState) || {};
    const cloud = cloudData || {};
    SYNCED_KEYS.forEach((key) => {
      if (key === 'settings') {
        return;
      }
      if (cloud[key] !== undefined) {
        base[key] = clone(cloud[key]);
      }
    });
    base.settings = { ...(base.settings || {}) };
    SYNCED_SETTINGS_FIELDS.forEach((field) => {
      if (cloud.settings && cloud.settings[field] !== undefined) {
        base.settings[field] = clone(cloud.settings[field]);
      }
    });
    return base;
  }

  window.VALHALLA = window.VALHALLA || {};
  window.VALHALLA.syncCore = {
    SYNCED_KEYS,
    SYNCED_SETTINGS_FIELDS,
    LOCAL_ONLY_KEYS,
    buildCloudPayload,
    canonicalize,
    fingerprint,
    summarize,
    compare,
    decideSyncAction,
    applyCloudData
  };
})();
