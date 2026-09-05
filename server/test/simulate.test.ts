import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateHands } from '../src/analysis/simulate.js';
import { FOREST, ISLAND, RAMPANT_GROWTH, SOL_RING, card } from './fixtures.js';

/** Deterministic LCG so simulation tests can't flake. */
function seededRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function standardDeck() {
  return [
    { card: FOREST, quantity: 19 },
    { card: ISLAND, quantity: 19 },
    { card: SOL_RING, quantity: 1 },
    { card: RAMPANT_GROWTH, quantity: 1 },
    { card: card({ name: 'Filler Creature', manaValue: 3, manaCost: '{2}{G}' }), quantity: 40 },
    { card: card({ name: 'Top End', manaValue: 6, manaCost: '{4}{G}{U}' }), quantity: 19 },
  ];
}

test('simulation results are internally consistent', () => {
  const sim = simulateHands(standardDeck(), [], 5000, seededRng());
  assert.equal(sim.iterations, 5000);
  const distSum = sim.landDistribution.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(distSum - 1) < 0.001, 'land distribution sums to 1');
  // 38 lands in 99 cards -> expected ~2.7 lands per 7-card hand.
  assert.ok(sim.avgLandsInHand > 2.3 && sim.avgLandsInHand < 3.1, `avg ${sim.avgLandsInHand}`);
  assert.ok(sim.keepableRate > 0.4 && sim.keepableRate < 1);
  assert.equal(sim.exampleKeepableHand.length, 7);
  assert.ok(sim.mulliganGuidance.length >= 3);
});

test('key groups report ramp presence probability', () => {
  const sim = simulateHands(standardDeck(), ['Filler Creature'], 5000, seededRng(7));
  const ramp = sim.keyGroups.find((g) => g.label.includes('ramp'));
  assert.ok(ramp);
  // 2 cheap ramp cards in 99: P(>=1 in 7) ≈ 13.4%.
  assert.ok(ramp.pctInOpener > 8 && ramp.pctInOpener < 20, `${ramp.pctInOpener}%`);
  const synergy = sim.keyGroups.find((g) => g.label.includes('synergy'));
  assert.ok(synergy && synergy.pctInOpener > 90); // 40 copies — nearly always seen
});

test('tiny decks skip simulation gracefully', () => {
  const sim = simulateHands([{ card: FOREST, quantity: 3 }], [], 100, seededRng());
  assert.equal(sim.iterations, 0);
});
