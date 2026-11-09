const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// "Reemplazar este equipo con la nube" (cloud-sync.js, replaceLocalWithCloud): la verificación
// fallaba siempre cuando la nube traía datos que la normalización completa con valores de
// "ahora" o ids nuevos (p. ej. series de Modo Grupo sin createdAt). Datos falsos.
global.window = global;
require('../assets/js/labels.js');
require('../assets/js/blocks-core.js');
require('../assets/js/circuits-core.js');
require('../assets/js/monthly-card-core.js');
require('../assets/js/data.js');
require('../assets/js/sync-core.js');

const data = globalThis.VALHALLA.data;
const sync = globalThis.VALHALLA.syncCore;
const wait = (ms) => { const end = Date.now() + ms; while (Date.now() < end) { /* espera activa */ } };

// Como lo deja el teléfono en la nube: estado de la app + una sesión de Modo Grupo cuyas
// series no traen createdAt (buildGroupDraftSets no lo pone).
function cloudLikeState() {
  const state = data.importState(JSON.stringify({
    clients: [{ id: 'falso-1', full_name: 'Cliente Falso Uno' }, { id: 'falso-2', full_name: 'Cliente Falso Dos' }],
    trainingsV08: { plans: [], programs: [], assignments: [], sessions: [] }
  }));
  state.trainingsV08.sessions.push({
    id: 'ses-grupo', clientId: 'falso-1', date: '2026-11-09', title: 'Modo Grupo', status: 'completed',
    exercises: [{ id: 'ex-1', exerciseName: 'Sentadilla falsa', sets: [
      { setNumber: 1, weight: 40, reps: 8, setType: 'S', completed: true },
      { setNumber: 2, weight: 42.5, reps: 8, setType: 'S', completed: true }
    ] }]
  });
  return state;
}

// Simula el guardado del navegador y arma lo que verifica replaceLocalWithCloud.
function verifyAfterWrite(nextState, { storedRaw = JSON.stringify(nextState), loaded } = {}) {
  const expected = data.importState(JSON.stringify(nextState));
  wait(3); // la app normaliza dos veces con algo de tiempo entre medio (más con 1,3 MB)
  return sync.verifyCloudLoad({
    intended: nextState,
    storedRaw,
    // Igual que loadState: si lo guardado no se puede leer, devuelve el estado inicial.
    loaded: loaded || (() => { try { return data.importState(storedRaw); } catch (error) { return data.createInitialState(); } })(),
    expected
  });
}

test('causa: normalizar dos veces el mismo dato no da idéntico si faltan createdAt (la verificación anterior fallaba siempre)', () => {
  const raw = JSON.stringify(cloudLikeState());
  const first = sync.buildCloudPayload(data.importState(raw));
  wait(3);
  const second = sync.buildCloudPayload(data.importState(raw));
  const old = sync.compare(second, first);
  assert.equal(old.identical, false);
  assert.equal(old.countsMatch, true);
  assert.deepEqual(sync.diffPaths(second, first).map((item) => item.path), ['trainingsV08.sessions[].exercises[].sets[].createdAt']);
});

test('arreglo: con el guardado correcto la verificación pasa y solo tolera los campos que inventa la normalización', () => {
  const result = verifyAfterWrite(cloudLikeState());
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.tolerated.map((item) => item.path), ['trainingsV08.sessions[].exercises[].sets[].createdAt']);
  // Datos ya completos: idéntico, nada que tolerar.
  const complete = data.importState(JSON.stringify(cloudLikeState()));
  assert.deepEqual(verifyAfterWrite(complete), { ok: true, reason: '', tolerated: [] });
});

test('protección intacta: si no quedó guardado, quedó dañado o quedó otra cosa, falla y dice qué', () => {
  const next = cloudLikeState();
  assert.equal(verifyAfterWrite(next, { storedRaw: null }).ok, false);
  const broken = verifyAfterWrite(next, { storedRaw: JSON.stringify(next).slice(0, 200) });
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /dañado/);
  const other = JSON.parse(JSON.stringify(next));
  other.clients.pop();
  const wrong = verifyAfterWrite(next, { storedRaw: JSON.stringify(other) });
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /no es lo de la nube \(difiere: clients\.length/);
});

test('protección intacta: si la app lee los datos viejos (guardado fallido), falla con los conteos', () => {
  const old = data.importState(JSON.stringify({ clients: [{ id: 'falso-viejo', full_name: 'Cliente Falso Viejo' }], trainingsV08: { sessions: [] } }));
  const result = verifyAfterWrite(cloudLikeState(), { loaded: old });
  assert.equal(result.ok, false);
  assert.match(result.reason, /lo que lee la app no coincide/);
  assert.match(result.reason, /clientes 1 en vez de 2/);
  assert.match(result.reason, /sesiones 0 en vez de 1/);
});

test('protección intacta: un valor real distinto (no inventado) falla; el mensaje da rutas, nunca valores ni nombres', () => {
  const next = cloudLikeState();
  const loaded = data.importState(JSON.stringify(next));
  loaded.trainingsV08.sessions[0].exercises[0].sets[1].weight = 99;
  loaded.clients[0].full_name = 'Otro Nombre Falso';
  const result = verifyAfterWrite(next, { loaded });
  assert.equal(result.ok, false);
  assert.match(result.reason, /trainingsV08\.sessions\[\]\.exercises\[\]\.sets\[\]\.weight/);
  assert.match(result.reason, /clients\[\]\.full_name/);
  assert.doesNotMatch(result.reason, /Cliente Falso|Otro Nombre|99|42\.5/);
});

test('cloud-sync.js usa la verificación nueva, avisa si no hay espacio y sigue restaurando lo anterior', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'cloud-sync.js'), 'utf8');
  const fn = source.slice(source.indexOf('function replaceLocalWithCloud'), source.indexOf('function loadIntoEmptyDevice'));
  assert.match(fn, /syncCore\.verifyCloudLoad\(\{/);
  assert.match(fn, /storedRaw: localStorage\.getItem\(dataApi\.STORAGE_KEY\)/);
  assert.match(fn, /\/quota\|exceed\/i/);
  assert.match(fn, /No hay espacio en este equipo/);
  assert.match(fn, /localStorage\.setItem\(previous\.key, previous\.value\)/);
  assert.match(fn, /Se restauraron los datos que tenía este equipo/);
  assert.doesNotMatch(fn, /check\.identical/);
});

// v0.9.51 · Origen corregido: Modo Grupo guarda createdAt en cada serie (función real de app.js).
const appSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app.js'), 'utf8');
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró function ${name} en app.js`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`Llaves sin cerrar en function ${name}`);
}
const buildGroupDraftSets = new Function(`${extractFunction(appSource, 'buildGroupDraftSets')}\nreturn buildGroupDraftSets;`)();

test('Modo Grupo: cada serie (aproximación, efectiva y por tiempo) lleva createdAt; normalizar dos veces da idéntico', () => {
  const before = new Date().toISOString();
  const sets = [
    ...buildGroupDraftSets({ warmups: '20, 30', rir: '2' }, [{ weight: '40', reps: '8' }, { weight: '42,5', reps: '' }]),
    ...buildGroupDraftSets({ rir: '' }, [{ seconds: 40 }])
  ];
  assert.equal(sets.length, 5);
  assert.deepEqual(sets.map((set) => set.setType), ['A', 'A', 'S', 'S', 'S']);
  sets.forEach((set) => {
    assert.match(set.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(set.createdAt >= before);
  });
  // Lo demás de cada serie no cambia.
  assert.deepEqual({ ...sets[2], createdAt: undefined }, { setNumber: 3, weight: 40, reps: 8, setType: 'S', rir: null, completed: true, createdAt: undefined });
  assert.equal(sets[3].rir, 2);
  assert.equal(sets[4].seconds, 40);
  const state = cloudLikeState();
  state.trainingsV08.sessions[0].exercises[0].sets = sets;
  const raw = JSON.stringify(state);
  const first = sync.buildCloudPayload(data.importState(raw));
  wait(3);
  const second = sync.buildCloudPayload(data.importState(raw));
  assert.equal(sync.compare(second, first).identical, true);
  assert.deepEqual(verifyAfterWrite(state), { ok: true, reason: '', tolerated: [] });
});
