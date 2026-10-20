const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

// Extrae una función con nombre de app.js (llaves balanceadas) para probar el código real.
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

const { getGroupSuggestedDecision, getGroupProposedWeight, applyGroupSuggestedDecision } = new Function(`
  ${extractFunction('getGroupSuggestedDecision')}
  ${extractFunction('getGroupProposedWeight')}
  ${extractFunction('applyGroupSuggestedDecision')}
  return { getGroupSuggestedDecision, getGroupProposedWeight, applyGroupSuggestedDecision };`)();

test('RIR final -> sugerencia: 3 o más Subir; 0, 1 y 2 Mantener; nunca Bajar', () => {
  assert.equal(getGroupSuggestedDecision('3'), 'up');
  assert.equal(getGroupSuggestedDecision('5'), 'up');
  assert.equal(getGroupSuggestedDecision('2'), 'keep');
  assert.equal(getGroupSuggestedDecision('1'), 'keep');
  assert.equal(getGroupSuggestedDecision('0'), 'keep');
  assert.equal(getGroupSuggestedDecision(''), '');
  assert.equal(getGroupSuggestedDecision('abc'), '');
  assert.equal(getGroupSuggestedDecision(undefined), '');
});

test('próxima carga: la misma regla de siempre (sube 3,5 %, baja 10 %, a 2,5 kg)', () => {
  const plan = { targetWeight: 70 };
  assert.equal(getGroupProposedWeight(plan, 'up'), 72.5);
  assert.equal(getGroupProposedWeight(plan, 'keep'), 70);
  assert.equal(getGroupProposedWeight(plan, 'down'), 62.5);
});

test('preselección: vacía o sugerida se actualiza; elegida a mano se respeta; "solo hoy" no decide', () => {
  const plan = { targetWeight: 100 };
  const draft = { rir: '3', decision: '', proposedWeight: '100' };
  applyGroupSuggestedDecision(plan, draft, '', null);
  assert.deepEqual([draft.decision, draft.proposedWeight], ['up', '102.5']);
  draft.rir = '1';
  applyGroupSuggestedDecision(plan, draft, '3', null);
  assert.deepEqual([draft.decision, draft.proposedWeight], ['keep', '100']);
  const manual = { rir: '4', decision: 'down', proposedWeight: '90' };
  applyGroupSuggestedDecision(plan, manual, '2', null);
  assert.deepEqual([manual.decision, manual.proposedWeight], ['down', '90']);
  const today = { rir: '4', decision: '', proposedWeight: '100' };
  applyGroupSuggestedDecision({ targetWeight: 100, overrideScope: 'today' }, today, '', null);
  assert.equal(today.decision, '');
});
