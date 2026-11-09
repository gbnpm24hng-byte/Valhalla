// v0.9.52: "Vista alumno" del entrenador (vista previa de solo lectura de la app del alumno)
// y objetivo de Modo Grupo sin peso. Solo datos falsos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const appSource = read('assets/js/app.js');

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró function ${name} en app.js`);
  const bodyStart = appSource.indexOf('{', appSource.indexOf(')', start));
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Llaves sin cerrar en ${name}`);
}

global.window = global;
require('../assets/js/group-round-core.js');
const groupRoundApi = globalThis.VALHALLA.groupRoundCore;
const formatGroupTarget = new Function('groupRoundApi', `
  ${extractFunction('getGroupRepsLabel')}
  ${extractFunction('formatGroupTarget')}
  return formatGroupTarget;`)(groupRoundApi);

test('Modo Grupo: objetivo sin peso (0 o vacío) muestra solo las repeticiones, sin "0 kg"', () => {
  for (const targetWeight of [0, '0', '', null, undefined, '  ']) {
    assert.equal(formatGroupTarget({ repMin: 10, repMax: 12, targetWeight }), 'Objetivo 10-12', `peso ${JSON.stringify(targetWeight)}`);
  }
  assert.equal(formatGroupTarget({ repMin: 8, repMax: 8, targetWeight: 0 }), 'Objetivo 8');
  assert.equal(formatGroupTarget({ repMin: 10, repMax: 12, targetWeight: 40 }), 'Objetivo 40 kg × 10-12');
  assert.equal(formatGroupTarget({ repMin: 10, repMax: 12, targetWeight: 22.5 }), 'Objetivo 22,5 kg × 10-12');
});

test('la pantalla vieja de "Vista alumno" (Guardar serie, Validar por entrenador) ya no existe', () => {
  const html = read('index.html');
  for (const gone of ['id="studentTraining"', 'studentSaveSetBtn', 'studentValidateRecordBtn', 'Validar por entrenador']) {
    assert.equal(html.includes(gone), false, `index.html aún tiene ${gone}`);
  }
  for (const gone of ['enterStudentMode', 'renderStudentTraining', 'saveStudentSetEntry', 'studentUi']) {
    assert.equal(appSource.includes(gone), false, `app.js aún tiene ${gone}`);
  }
  // El botón abre la vista previa, en la ficha y en Modo Grupo (⋯ compacto y lista).
  assert.match(appSource, /openStudentPreview\(clientStudentViewId\)/);
  assert.equal((appSource.match(/data-client-student-view=/g) || []).length, 3);
});

// Entorno mínimo de navegador para dibujar la vista del alumno en modo vista previa.
function fakeContainer() {
  const node = (store, key) => ({
    set innerHTML(value) { store[key] = value; },
    get innerHTML() { return store[key] || ''; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {} },
    setAttribute() {}
  });
  const parts = {};
  const container = node(parts, 'shell');
  container.parts = parts;
  container.querySelector = (selector) => {
    const attr = selector.match(/^\[([a-z-]+)\]$/)?.[1];
    if (!attr || !(parts.shell || '').includes(attr)) return null;
    return node(parts, attr);
  };
  return container;
}

test('vista previa: pantalla del alumno en solo lectura, sin "Cerrar sesión" y sin escribir nada', () => {
  const writes = [];
  global.localStorage = {
    getItem: () => null,
    setItem: (key) => writes.push(key),
    removeItem: (key) => writes.push(`-${key}`)
  };
  global.addEventListener = () => {};
  global.CSS = { escape: (value) => value };
  require('../assets/js/self-log-core.js');
  require('../assets/js/student-view.js');
  const view = globalThis.VALHALLA.studentView;
  assert.equal(typeof view.renderPreview, 'function');
  const container = fakeContainer();
  view.renderPreview(container, {
    name: 'Alumna Falsa',
    programs: [{ assignment_id: 'asig-1', title: 'Programa falso', published_at: '2026-11-01T10:00:00Z', data: {
      days: [{ id: 'd1', name: 'Lunes falso', exercises: [{ id: 'e1', name: 'Sentadilla falsa', sets: 3, repMin: 10, repMax: 12, effectiveSets: [] }] }]
    } }],
    progress: []
  });
  assert.match(container.innerHTML, /Hola, Alumna Falsa/);
  const content = container.parts['data-student-content'] || '';
  assert.match(content, /Sentadilla falsa/);
  assert.equal(content.includes('data-sv-check'), false, 'sin ✓ para registrar');
  assert.equal(container.innerHTML.includes('data-auth-logout'), false, 'sin Cerrar sesión');
  assert.deepEqual(writes, [], 'no escribe en el teléfono (ni caché ni cola de series)');
  view.closePreview();
});
