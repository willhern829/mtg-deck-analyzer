import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMana, countPips } from '../src/analysis/mana.js';
import { FOREST, ISLAND, RAMPANT_GROWTH, SOL_RING, TATYOVA, card } from './fixtures.js';

test('countPips handles plain, hybrid, and phyrexian symbols', () => {
  assert.deepEqual(countPips('{1}{G}{G}'), { W: 0, U: 0, B: 0, R: 0, G: 2 });
  const hybrid = countPips('{W/U}');
  assert.equal(hybrid.W, 0.5);
  assert.equal(hybrid.U, 0.5);
  const phyrexian = countPips('{G/P}');
  assert.equal(phyrexian.G, 1);
  assert.deepEqual(countPips(undefined), { W: 0, U: 0, B: 0, R: 0, G: 0 });
});

test('curve, lands, and ramp are computed from the 99', () => {
  const deck = [
    { card: FOREST, quantity: 20 },
    { card: ISLAND, quantity: 18 },
    { card: SOL_RING, quantity: 1 },
    { card: RAMPANT_GROWTH, quantity: 1 },
    { card: card({ name: 'Big Spell', manaCost: '{6}{G}{U}', manaValue: 8 }), quantity: 1 },
  ];
  const mana = analyzeMana(deck, [TATYOVA]);
  assert.equal(mana.landCount, 38);
  assert.equal(mana.ramp.count, 2);
  assert.ok(mana.ramp.cards.includes('Sol Ring'));
  assert.ok(mana.ramp.cards.includes('Rampant Growth'));
  const sevenPlus = mana.curve.find((b) => b.manaValue === 7);
  assert.equal(sevenPlus?.count, 1); // MV 8 lands in the 7+ bucket
});

test('MDFC land backs are noted and counted as sources, not lands', () => {
  const mdfc = card({
    name: 'Bala Ged Recovery // Bala Ged Sanctuary',
    layout: 'modal_dfc',
    manaValue: 3,
    typeLine: 'Sorcery // Land',
    faces: [
      { name: 'Bala Ged Recovery', typeLine: 'Sorcery', manaCost: '{2}{G}' },
      { name: 'Bala Ged Sanctuary', typeLine: 'Land', producedMana: ['G'] },
    ],
  });
  const deck = [
    { card: FOREST, quantity: 37 },
    { card: mdfc, quantity: 1 },
  ];
  const mana = analyzeMana(deck, [TATYOVA]);
  assert.equal(mana.landCount, 37);
  assert.ok(mana.notes.some((n) => n.includes('Bala Ged Recovery')));
  const green = mana.colorBalance.find((r) => r.color === 'G');
  assert.equal(green?.sources, 38); // 37 forests + the MDFC land face
});

test('under-supported colors produce a note', () => {
  const blueSpell = card({ name: 'Counterspell', manaCost: '{U}{U}', manaValue: 2, colorIdentity: ['U'] });
  const deck = [
    { card: FOREST, quantity: 37 },
    { card: blueSpell, quantity: 20 },
  ];
  const mana = analyzeMana(deck, [TATYOVA]);
  assert.ok(mana.notes.some((n) => n.startsWith('U is under-supported')));
});
