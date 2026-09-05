import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecklist, normalizeCardName } from '../src/parser.js';

test('plain format with and without x', () => {
  const { entries, issues } = parseDecklist('1x Sol Ring\n1 Arcane Signet\n10 Forest');
  assert.equal(issues.length, 0);
  assert.deepEqual(
    entries.map((e) => [e.quantity, e.name]),
    [[1, 'Sol Ring'], [1, 'Arcane Signet'], [10, 'Forest']],
  );
});

test('moxfield/MTGA export: sections, printings, foil markers', () => {
  const text = [
    'Commander',
    '1 Atraxa, Praetors’ Voice (2X2) 190',
    '',
    'Deck',
    '1 Sol Ring (C21) 263 *F*',
    '1 Fellwar Stone (CMM) 379',
  ].join('\n');
  const { entries, issues } = parseDecklist(text);
  assert.equal(issues.length, 0);
  const cmdr = entries.find((e) => e.isCommander);
  assert.ok(cmdr);
  assert.equal(cmdr.name, 'Atraxa, Praetors’ Voice');
  assert.equal(cmdr.setCode, '2x2');
  const solRing = entries.find((e) => e.name === 'Sol Ring');
  assert.ok(solRing);
  assert.equal(solRing.collectorNumber, '263');
  assert.equal(solRing.section, 'mainboard');
});

test('archidekt categories and TappedOut CMDR marker', () => {
  const text = [
    '1x Krenko, Mob Boss (dmr) 135 [Commander{top}]',
    '1x Skirk Prospector (dmr) 122 [Sacrifice]',
    '1x Mountain (unf) 240 [Land]',
    '1 Purphoros, God of the Forge *CMDR*',
    '1x Shatter (m20) 22 [Maybeboard{noDeck}]',
  ].join('\n');
  const { entries } = parseDecklist(text);
  assert.deepEqual(
    entries.filter((e) => e.isCommander).map((e) => e.name).sort(),
    ['Krenko, Mob Boss', 'Purphoros, God of the Forge'],
  );
  assert.equal(entries.find((e) => e.name === 'Shatter')?.section, 'maybeboard');
  assert.equal(entries.find((e) => e.name === 'Skirk Prospector')?.section, 'mainboard');
});

test('comments, blank lines, deckstats markers', () => {
  const text = [
    '// my deck',
    '# scribbles',
    '1 Krenko, Mob Boss #!Commander',
    '1 Goblin Chieftain # all hail',
    '',
    'Sideboard',
    '1 Pyroblast',
  ].join('\n');
  const { entries, issues } = parseDecklist(text);
  assert.equal(issues.length, 0);
  assert.equal(entries.find((e) => e.name === 'Krenko, Mob Boss')?.isCommander, true);
  assert.equal(entries.find((e) => e.name === 'Goblin Chieftain')?.section, 'mainboard');
  assert.equal(entries.find((e) => e.name === 'Pyroblast')?.section, 'sideboard');
});

test('double-faced card names are not treated as comments', () => {
  const { entries } = parseDecklist('1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki');
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.name, 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki');
});

test('duplicate lines merge; names normalize', () => {
  const { entries } = parseDecklist('1 Sol Ring\n1 sol ring');
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.quantity, 2);
  assert.equal(normalizeCardName('Séance'), 'seance');
});

test('quantity-less lines default to 1', () => {
  const { entries } = parseDecklist('Sol Ring');
  assert.equal(entries[0]?.quantity, 1);
});
