const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/muscle-map-core.js');
require('../assets/js/publish-core.js');
require('../assets/js/student-view.js');

const map = globalThis.VALHALLA.muscleMap;
const publish = globalThis.VALHALLA.publishCore;

test('mapa: cada músculo de la galería va a su zona', () => {
  const cases = {
    quadriceps: 'cuadriceps', hamstrings: 'isquios', calves: 'gemelos', glutes: 'gluteoMayor', abductors: 'gluteoMedio',
    lats: 'dorsales', upper_back: 'espaldaMedia', mid_back: 'espaldaMedia', traps: 'trapecio', spinal_erectors: 'lumbar',
    front_delts: 'hombros', lateral_delts: 'hombros', rear_delts: 'hombros', biceps: 'biceps', triceps: 'triceps',
    abdominals: 'core', obliques: 'core', core: 'core'
  };
  Object.entries(cases).forEach(([muscle, zone]) => assert.deepEqual(map.zonesFor(muscle, [], 'X'), { main: [zone], sec: [] }, muscle));
});

test('mapa: forearms, adductors, full_body, other, vacío o desconocido no pintan nada', () => {
  ['forearms', 'adductors', 'full_body', 'other', '', null, undefined, 'inventado', '__proto__', 'toString'].forEach((muscle) => {
    assert.deepEqual(map.zonesFor(muscle, [muscle], 'X'), { main: [], sec: [] }, String(muscle));
  });
  assert.equal(map.figureHtml(map.zonesFor('forearms', ['adductors'], 'X')), '');
});

test('mapa: pecho según el nombre (sin tildes ni mayúsculas)', () => {
  assert.deepEqual(map.zonesFor('chest', [], 'Press INCLINADO con mancuernas'), { main: ['pechoSup'], sec: ['pechoInf'] });
  assert.deepEqual(map.zonesFor('chest', [], 'Press declinado'), { main: ['pechoInf'], sec: ['pechoSup'] });
  assert.deepEqual(map.zonesFor('chest', [], 'Fondos en paralelas'), { main: ['pechoInf'], sec: ['pechoSup'] });
  assert.deepEqual(map.zonesFor('chest', [], 'Press de banca plano'), { main: ['pechoSup', 'pechoInf'], sec: [] });
  assert.deepEqual(map.zonesFor('triceps', ['chest'], 'Fondos'), { main: ['triceps'], sec: ['pechoSup', 'pechoInf'] });
});

test('mapa: si una zona trabaja y ayuda, gana trabaja; sin duplicados', () => {
  assert.deepEqual(map.zonesFor('upper_back', ['mid_back', 'lats', 'biceps', 'biceps', 'rear_delts'], 'Remo'), { main: ['espaldaMedia'], sec: ['dorsales', 'hombros', 'biceps'] });
  assert.deepEqual(map.zonesFor('chest', ['triceps', 'front_delts'], 'Press inclinado'), { main: ['pechoSup'], sec: ['pechoInf', 'hombros', 'triceps'] });
});

test('día: trabaja = principales; ayuda = secundarias que no son principales; texto con las más repetidas', () => {
  const day = map.dayZones([
    { name: 'Remo con barra', primaryMuscle: 'mid_back', secondaryMuscles: ['lats', 'biceps'] },
    { name: 'Jalón al pecho', primaryMuscle: 'lats', secondaryMuscles: ['biceps'] },
    { name: 'Remo en máquina', primaryMuscle: 'mid_back', secondaryMuscles: [] },
    { name: 'Curl', primaryMuscle: 'biceps', secondaryMuscles: ['forearms'] },
    { name: 'Facepull', primaryMuscle: 'rear_delts', secondaryMuscles: ['traps'] },
    { name: 'Sin galería' }
  ]);
  assert.deepEqual(day.main, ['espaldaMedia', 'dorsales', 'hombros', 'biceps']);
  assert.deepEqual(day.sec, ['trapecio']);
  assert.deepEqual(day.top, ['espaldaMedia', 'dorsales', 'hombros']);
  assert.equal(map.joinLabels(day.top), 'Espalda media, Dorsales y Hombros');
  assert.deepEqual(map.dayZones([{ name: 'Sin galería' }]), { main: [], sec: [], top: [] });
});

test('etiquetas, aria-label y lugar de la figura', () => {
  assert.equal(map.mainLabel(map.zonesFor('mid_back', [], 'Remo')), 'ESPALDA MEDIA');
  assert.equal(map.mainLabel(map.zonesFor('chest', [], 'Press plano')), 'PECHO');
  assert.equal(map.mainLabel(map.zonesFor('abductors', [], 'Abducción')), 'GLÚTEO MEDIO');
  const zones = map.zonesFor('chest', ['triceps'], 'Press inclinado');
  assert.equal(map.ariaText(zones), 'Trabaja: Pecho superior; ayudan: Pecho inferior y Tríceps');
  const html = map.figureHtml(zones, 'lg');
  assert.match(html, /class="vk-fig vk-fig--lg"/);
  assert.match(html, /role="img" aria-label="Trabaja: Pecho superior; ayudan: Pecho inferior y Tríceps"/);
  assert.match(html, /data-vk-main="pechoSup" data-vk-sec="pechoInf triceps"/);
  assert.deepEqual(Object.keys(map.ZONE_LABELS), map.ZONES);
});

test('el SVG trae las 15 zonas y se limpia de metadatos y estilo al insertarlo', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'assets', 'images', 'figura-esculpida.svg'), 'utf8');
  const zones = new Set([...raw.matchAll(/data-zona="([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...zones].sort(), map.ZONES.slice().sort());
  const clean = map.cleanSvg(raw);
  assert.equal(/<metadata|<style|c2pa|role="img"/.test(clean), false);
  assert.match(clean, /^<svg aria-hidden="true" focusable="false" class="vk-musculos"/);
  assert.equal((clean.match(/data-zona=/g) || []).length, (raw.match(/data-zona=/g) || []).length);
});

const publishedExercise = (exercise, library) => publish.buildPublishedProgram({ id: 'a', days: [{ id: 'd', exercises: [exercise] }] }, library).days[0].exercises[0];

test('publicación: músculos del ejercicio enlazado (id y, si no, nombre), solo claves conocidas', () => {
  const library = [
    { id: 'lib-1', name: 'Remo renombrado', primaryMuscle: 'mid_back', secondaryMuscles: ['lats', 'inventado', 'lats', 'forearms'] },
    { id: 'lib-2', name: 'Press inclinado', primaryMuscle: 'chest', secondaryMuscles: ['triceps'], description: 'Privado' }
  ];
  const byId = publishedExercise({ libraryExerciseId: 'lib-1', exerciseName: 'Remo' }, library);
  assert.equal(byId.primaryMuscle, 'mid_back');
  assert.deepEqual(byId.secondaryMuscles, ['lats']); // forearms no tiene zona: no se publica
  const byName = publishedExercise({ exerciseName: 'press INCLINADO' }, library);
  assert.equal(byName.primaryMuscle, 'chest');
  assert.equal('description' in byName, false);
});

test('publicación: sin galería, inactivo o sin zonas, las claves no existen (programa igual que antes)', () => {
  const exercise = { libraryExerciseId: 'lib-1', exerciseName: 'Antebrazo' };
  [
    [],
    [{ id: 'lib-1', name: 'Antebrazo', primaryMuscle: 'forearms', secondaryMuscles: ['adductors'] }],
    [{ id: 'lib-1', name: 'Antebrazo', primaryMuscle: 'full_body' }],
    [{ id: 'lib-1', name: 'Antebrazo', primaryMuscle: 'biceps', active: false }],
    [{ id: 'otro', name: 'Otro', primaryMuscle: 'biceps' }]
  ].forEach((library) => {
    const picked = publishedExercise(exercise, library);
    assert.equal('primaryMuscle' in picked, false);
    assert.equal('secondaryMuscles' in picked, false);
  });
});

const viewFormat = globalThis.VALHALLA.studentView.format;
const ctx = { canLog: false, date: '2026-10-20', dates: ['2026-10-20'], setRows: [], outbox: [], progress: [] };
function todayHtml(exercises) {
  const day = { id: 'd-1', name: 'Día A', exercises };
  const program = { assignment_id: 'a-1', title: 'Programa falso', data: { days: [day] } };
  return viewFormat.renderToday(ctx, { progress: [] }, { program, days: [day], day, exercises }, [program]);
}
const exerciseHtml = (exercise) => viewFormat.renderExerciseScreen(ctx, { program: { assignment_id: 'a-1' }, day: { id: 'd-1', name: 'Día A', exercises: [exercise] }, exercises: [exercise], exerciseIndex: 0, exercise });
const remo = { id: 'e1', name: 'Remo falso', sets: 3, primaryMuscle: 'mid_back', secondaryMuscles: ['lats', 'biceps'] };
const sinGaleria = { id: 'e2', name: 'Sin galería falso', sets: 3 };

test('vista del alumno: tarjeta "Hoy trabajas", figura chica con etiqueta y figura grande en Ejercicio', () => {
  const today = todayHtml([remo, sinGaleria]);
  assert.match(today, /data-sv-muscles-day/);
  assert.match(today, /Hoy trabajas<\/span>\s*<strong class="sv-muscles-names">Espalda media<\/strong>/);
  assert.equal((today.match(/vk-fig--sm/g) || []).length, 1);
  assert.match(today, /data-sv-zone-tag>ESPALDA MEDIA</);
  const screen = exerciseHtml(remo);
  assert.match(screen, /vk-fig--lg/);
  assert.match(screen, /<span>Trabaja:<\/span> Espalda media/);
  assert.match(screen, /<span>Ayudan:<\/span> Dorsales y Bíceps/);
});

test('vista del alumno: sin zonas no hay figura, tarjeta ni etiqueta (programas antiguos iguales)', () => {
  const today = todayHtml([sinGaleria, { ...sinGaleria, id: 'e3', primaryMuscle: 'forearms' }]);
  assert.equal(/vk-fig|sv-muscles|sv-zone-tag|has-fig/.test(today), false);
  assert.equal(/vk-fig|sv-muscles/.test(exerciseHtml(sinGaleria)), false);
});
