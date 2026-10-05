const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// localStorage falso en memoria: nunca toca datos reales.
const storage = new Map();
global.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear()
};
global.window = global;
require('../assets/js/data.js');

const dataApi = globalThis.VALHALLA.data;
const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

// Extrae una función con nombre de app.js (llaves balanceadas) para probar el código real.
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

function buildAppFunction(name, scope) {
  const names = Object.keys(scope);
  const factory = new Function(...names, `${extractFunction(appSource, name)}\nreturn ${name};`);
  return factory(...names.map((key) => scope[key]));
}

function seedSavedState() {
  storage.clear();
  const saved = dataApi.createInitialState();
  saved.clients = [dataApi.normalizeClient({ id: 'falso-cliente-1', full_name: 'Cliente Falso', sessions_total: 8 })];
  saved.trainingsV08.programs = [];
  saved.trainingsV08.assignments = [];
  dataApi.saveState(saved);
  return dataApi.loadState();
}

function applyMemoryChanges(state) {
  state.trainingsV08.programs.push(dataApi.normalizeTrainingProgram({ id: 'falso-programa-1', name: 'Programa falso', days: [] }));
  state.trainingsV08.assignments.push(dataApi.normalizeTrainingProgramAssignment(
    { id: 'falso-asignacion-1', programId: 'falso-programa-1', clientId: 'falso-cliente-1', weeklyDays: [1, 3, 5] },
    { trainingsV08: { programs: state.trainingsV08.programs } }
  ));
  state.clients[0].training_attendance.push({ sessionKey: 'falso-sesion-1', date: '2026-10-05', time: '09:00', status: 'attended' });
}

function assertChangesPresent(state, label) {
  assert.ok(state.trainingsV08.programs.some((item) => item.id === 'falso-programa-1'), `${label}: falta el programa`);
  assert.ok(state.trainingsV08.assignments.some((item) => item.id === 'falso-asignacion-1'), `${label}: falta la asignación`);
  const client = state.clients.find((item) => item.id === 'falso-cliente-1');
  assert.ok(client, `${label}: falta el cliente`);
  assert.ok(client.training_attendance.some((entry) => entry.sessionKey === 'falso-sesion-1'), `${label}: falta la asistencia`);
}

test('persist() con sesión activa guarda en localStorage los cambios en memoria de programas, asignaciones y asistencia', () => {
  const state = seedSavedState();
  let renders = 0;
  const persist = buildAppFunction('persist', {
    state,
    dataApi,
    supabaseApi: { saveData: (data) => dataApi.saveState(data) },
    cloudUi: { sessionActive: true, ownerId: 'falso-owner', authUserId: 'falso-owner' },
    render: () => { renders += 1; }
  });

  applyMemoryChanges(state);
  persist();

  assertChangesPresent(state, 'memoria');
  assertChangesPresent(dataApi.loadState(), 'localStorage');
  assert.equal(renders, 1);
});

test('persistProgramInLocalStorage() no descarta cambios en memoria que aún no se habían guardado', () => {
  const state = seedSavedState();
  const ensureTrainingsV08State = () => {
    state.trainingsV08 = state.trainingsV08 || { plans: [], sessions: [], programs: [], assignments: [] };
  };
  const persistProgramInLocalStorage = buildAppFunction('persistProgramInLocalStorage', { state, dataApi, ensureTrainingsV08State });

  // Cambios pendientes en memoria (asistencia y asignación) + un programa nuevo que se guarda.
  state.clients[0].training_attendance.push({ sessionKey: 'falso-sesion-1', date: '2026-10-05', time: '09:00', status: 'attended' });
  state.trainingsV08.assignments.push(dataApi.normalizeTrainingProgramAssignment(
    { id: 'falso-asignacion-1', programId: 'falso-programa-1', clientId: 'falso-cliente-1', weeklyDays: [2, 4] },
    { trainingsV08: { programs: [] } }
  ));
  const persisted = persistProgramInLocalStorage(dataApi.normalizeTrainingProgram({ id: 'falso-programa-1', name: 'Programa falso', days: [] }));
  state.trainingsV08 = persisted.trainingsV08 || state.trainingsV08; // igual que hacen saveProgram() y savePlanningProgramAndAssignments()

  assertChangesPresent(state, 'memoria');
  assertChangesPresent(dataApi.loadState(), 'localStorage');
});
