const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../assets/js/decimal-core.js');
require('../assets/js/group-round-core.js');
require('../assets/js/self-log-core.js');
require('../assets/js/client-overrides-core.js');

const decimal = globalThis.VALHALLA.decimal;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('punto o coma valen lo mismo: "7.5", "7,5", "22.5", "100"', () => {
  assert.equal(decimal.parse('7.5'), 7.5);
  assert.equal(decimal.parse('7,5'), 7.5);
  assert.equal(decimal.parse('22.5'), 22.5);
  assert.equal(decimal.parse('22,5'), 22.5);
  assert.equal(decimal.parse('100'), 100);
  assert.equal(decimal.parse(' 7,5 '), 7.5);
  assert.equal(decimal.parse(',5'), 0.5);
  assert.equal(decimal.parse('22.'), 22);
  assert.equal(decimal.parse(40), 40);
});

test('el punto nunca es separador de miles; lo inválido es NaN y lo vacío null', () => {
  assert.equal(decimal.parse(''), null);
  assert.equal(decimal.parse('   '), null);
  assert.equal(decimal.parse(null), null);
  assert.equal(decimal.parse(undefined), null);
  ['1.000,5', '7,5,5', '7.5.5', 'abc', '-3', '1e3', '7 kg'].forEach((text) => {
    assert.ok(Number.isNaN(decimal.parse(text)), text);
  });
  assert.equal(decimal.parse('1.000'), 1, '"1.000" es 1 (decimal), nunca 1000');
});

test('parseOr, isValid y format (con coma)', () => {
  assert.equal(decimal.parseOr('7.5', 0), 7.5);
  assert.equal(decimal.parseOr('', 0), 0);
  assert.equal(decimal.parseOr('abc', 3), 3);
  assert.equal(decimal.isValid('7,5'), true);
  assert.equal(decimal.isValid(''), true);
  assert.equal(decimal.isValid('7,5,5'), false);
  assert.equal(decimal.format(7.5), '7,5');
  assert.equal(decimal.format('22.5'), '22,5');
  assert.equal(decimal.format(100), '100');
  assert.equal(decimal.format(''), '');
  assert.equal(decimal.format(7.499999), '7,5');
});

test('los lectores que ya existían usan el mismo parser', () => {
  const round = globalThis.VALHALLA.groupRoundCore;
  const selfLog = globalThis.VALHALLA.selfLogCore;
  const overrides = globalThis.VALHALLA.clientOverrides;
  ['7.5', '7,5', '22.5', '100'].forEach((text) => {
    assert.equal(round.parseNumber(text), decimal.parse(text), `groupRoundCore ${text}`);
    assert.equal(selfLog.parseDecimal(text), decimal.parse(text), `selfLogCore ${text}`);
    assert.equal(overrides.validateInput({ sets: '3', reps: '8-10', weight: text }).values.targetWeight, decimal.parse(text), `clientOverrides ${text}`);
  });
  assert.equal(round.parseNumber('7,5,5'), null);
  assert.ok(Number.isNaN(selfLog.parseDecimal('7,5,5')));
  assert.ok(overrides.validateInput({ sets: '3', reps: '8', weight: '7,5,5' }).error);
});

test('ningún campo de peso o decimales queda como type="number"', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  // Pesos de index.html: programa, sesión (objetivo y serie) y plantillas.
  ['weight', 'setWeightInput', 'templateExerciseWeight', 'programExerciseWeight'].forEach((id) => {
    const tag = html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] || '';
    assert.match(tag, /type="text"/, id);
    assert.match(tag, /inputmode="decimal"/, id);
  });
  // En app.js: ningún input de peso/decimales con type="number" o step con decimales.
  const numberInputs = [...app.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((match) => match[0]);
  const decimalNumber = numberInputs.filter((tag) => /step="0\.|step="2\.5"|inputmode="decimal"|[Ww]eight|1rm|[Ww]ater/.test(tag));
  assert.deepEqual(decimalNumber, [], 'inputs type="number" de pesos o decimales');
  const htmlNumber = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((match) => match[0])
    .filter((tag) => /step="0\.|inputmode="decimal"|[Ww]eight/.test(tag));
  assert.deepEqual(htmlNumber, [], 'index.html: inputs type="number" de pesos o decimales');
});
