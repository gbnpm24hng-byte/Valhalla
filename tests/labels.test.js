const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/data.js');
require('../assets/js/labels.js');

const labels = globalThis.VALHALLA.labels;
const dataApi = globalThis.VALHALLA.data;
const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

// Catálogos tal como los define app.js (lo que se ofrece en los selectores).
function catalog(functionName) {
  const match = appSource.match(new RegExp(`function ${functionName}\\(\\) \\{\\s*return \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `no se encontró ${functionName} en app.js`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

// Valores presentes en la biblioteca real (61 ejercicios, respaldo de octubre 2026).
const REAL_VALUES = {
  pattern: ['squat', 'horizontal_push', 'horizontal_pull', 'other', 'hinge', 'lunge', 'vertical_pull'],
  muscle: ['quadriceps', 'chest', 'lats', 'glutes', 'hamstrings', 'full_body', 'calves', 'mid_back', 'rear_delts', 'biceps', 'triceps', 'front_delts', 'core'],
  level: ['intermediate', 'beginner', 'advanced'],
  loadType: ['external_load', 'machine', 'bodyweight'],
  equipment: ['barbell', 'rack', 'bench', 'dumbbell', 'band', 'leg_press', 'leg_extension_machine', 'leg_curl_machine', 'ghr_bench', 'hex_bar',
    'seated_calf_machine', 'calf_machine', 'cable', 'lat_pulldown', 'bar', 'pull_up_bar', 'ez_bar', 'smith_machine', 'push_up_handles', 'dip_bars']
};

test('cada valor del catálogo y de la biblioteca real tiene su etiqueta en español', () => {
  const sources = {
    pattern: catalog('getLibraryPatternOptions').concat(REAL_VALUES.pattern),
    muscle: catalog('getLibraryMuscleOptions').concat(REAL_VALUES.muscle),
    level: catalog('getLibraryTechnicalLevelOptions').concat(REAL_VALUES.level),
    loadType: catalog('getLibraryLoadTypeOptions').concat(REAL_VALUES.loadType),
    equipment: REAL_VALUES.equipment,
    relation: ['variant_of', 'alternative_to', 'regression_of', 'progression_of']
  };
  Object.entries(sources).forEach(([kind, values]) => {
    values.forEach((value) => {
      assert.ok(Object.prototype.hasOwnProperty.call(labels.LABELS[kind], value), `${kind}.${value} no tiene etiqueta`);
      const shown = labels.label(kind, value);
      assert.ok(shown && !/_/.test(shown), `${kind}.${value} se muestra como "${shown}"`);
    });
  });
});

test('un valor desconocido se muestra tal cual, nunca vacío', () => {
  assert.equal(labels.label('muscle', 'serratus'), 'serratus');
  assert.equal(labels.label('pattern', ''), '');
  assert.equal(labels.listLabel('equipment', ['barbell', 'trineo']), 'Barra, trineo');
});

test('las listas se ordenan por la etiqueta en español', () => {
  const ordered = labels.sortedOptions('level', ['beginner', 'intermediate', 'advanced']).map((option) => option.label);
  assert.deepEqual(ordered, ['Avanzado', 'Intermedio', 'Principiante']);
  const muscles = labels.sortedOptions('muscle', catalog('getLibraryMuscleOptions')).map((option) => option.label);
  assert.deepEqual(muscles, [...muscles].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
});

test('los valores guardados no cambian: traducir solo afecta lo que se muestra', () => {
  const library = dataApi.createInitialState().exerciseLibrary;
  const before = JSON.stringify(library);
  library.forEach((exercise) => {
    labels.label('pattern', exercise.pattern);
    labels.label('muscle', exercise.primaryMuscle);
    labels.listLabel('muscle', exercise.secondaryMuscles);
    labels.listLabel('equipment', exercise.equipments);
  });
  assert.equal(JSON.stringify(library), before);
  // Los códigos guardados siguen siendo los mismos de siempre.
  assert.deepEqual(library.map((exercise) => exercise.pattern), ['squat', 'horizontal_push', 'horizontal_pull']);
  assert.deepEqual(library.map((exercise) => exercise.technicalLevel), ['intermediate', 'intermediate', 'beginner']);

  // Un respaldo con códigos se importa igual que antes (sin migración).
  const imported = dataApi.importState(JSON.stringify({ exerciseLibrary: [{ id: 'x', name: 'Remo', pattern: 'horizontal_pull', primaryMuscle: 'lats', technicalLevel: 'beginner', loadType: 'machine', secondaryMuscles: ['biceps'], equipments: ['cable'] }] }));
  const remo = imported.exerciseLibrary[0];
  assert.deepEqual([remo.pattern, remo.primaryMuscle, remo.technicalLevel, remo.loadType, remo.secondaryMuscles, remo.equipments],
    ['horizontal_pull', 'lats', 'beginner', 'machine', ['biceps'], ['cable']]);
});

test('texto libre escrito en español vuelve a su código; lo desconocido queda como se escribió', () => {
  assert.deepEqual(labels.listCodes('muscle', 'glúteos, Femorales'), ['glutes', 'hamstrings']);
  assert.deepEqual(labels.listCodes('muscle', 'gluteos'), ['glutes'], 'sin tilde también');
  assert.deepEqual(labels.listCodes('muscle', 'glutes, core'), ['glutes', 'core'], 'los códigos siguen funcionando');
  assert.deepEqual(labels.listCodes('equipment', 'barra, rack, trineo'), ['barbell', 'rack', 'trineo']);
});

test('búsqueda sin tildes ni mayúsculas', () => {
  assert.equal(labels.fold('Bíceps'), 'biceps');
  assert.equal(labels.fold('TRACCIÓN horizontal').includes('traccion'), true);
});
