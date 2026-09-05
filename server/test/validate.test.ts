import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DeckEntry, ResolvedCard } from '@mtg/shared';
import { normalizeCardName } from '@mtg/shared';
import { validateDeck } from '../src/analysis/validate.js';
import { FOREST, ISLAND, LIGHTNING_BOLT, RAMPANT_GROWTH, SOL_RING, TATYOVA, card } from './fixtures.js';

function entry(name: string, quantity = 1, opts: Partial<DeckEntry> = {}): DeckEntry {
  return {
    name,
    quantity,
    section: 'mainboard',
    isCommander: false,
    line: 1,
    ...opts,
  };
}

function resolvedMap(cards: ResolvedCard[]): Map<string, ResolvedCard> {
  return new Map(cards.map((c) => [normalizeCardName(c.name), c]));
}

function tatyovaDeck(): { entries: DeckEntry[]; resolved: Map<string, ResolvedCard> } {
  const entries = [
    entry('Tatyova, Benthic Druid', 1, { isCommander: true, section: 'commander' }),
    entry('Sol Ring'),
    entry('Rampant Growth'),
    entry('Forest', 49),
    entry('Island', 48),
  ];
  return { entries, resolved: resolvedMap([TATYOVA, SOL_RING, RAMPANT_GROWTH, FOREST, ISLAND]) };
}

test('a legal 100-card deck validates', () => {
  const { entries, resolved } = tatyovaDeck();
  const result = validateDeck({ entries, resolved, unresolved: [] });
  assert.equal(result.valid, true);
  assert.equal(result.cardCount, 100);
  assert.deepEqual(result.commanderNames, ['Tatyova, Benthic Druid']);
  assert.deepEqual(result.colorIdentity, ['U', 'G']);
});

test('wrong card count is an error', () => {
  const { entries, resolved } = tatyovaDeck();
  entries[3] = entry('Forest', 40); // 91 cards total
  const result = validateDeck({ entries, resolved, unresolved: [] });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'card_count' && i.message.includes('91')));
});

test('singleton violations flagged; basics exempt', () => {
  const { entries, resolved } = tatyovaDeck();
  entries.push(entry('Sol Ring', 2));
  const result = validateDeck({ entries, resolved, unresolved: [] });
  const singleton = result.issues.filter((i) => i.code === 'singleton');
  assert.equal(singleton.length, 1);
  assert.equal(singleton[0]?.cardName, 'Sol Ring');
});

test('off-color cards are rejected', () => {
  const { entries, resolved } = tatyovaDeck();
  entries[1] = entry('Lightning Bolt');
  resolved.set(normalizeCardName('Lightning Bolt'), LIGHTNING_BOLT);
  const result = validateDeck({ entries, resolved, unresolved: [] });
  assert.ok(result.issues.some((i) => i.code === 'color_identity' && i.cardName === 'Lightning Bolt'));
});

test('unmarked commander is inferred from first legal candidate', () => {
  const { entries, resolved } = tatyovaDeck();
  entries[0] = entry('Tatyova, Benthic Druid'); // no commander mark
  const result = validateDeck({ entries, resolved, unresolved: [] });
  assert.deepEqual(result.commanderNames, ['Tatyova, Benthic Druid']);
  assert.ok(result.issues.some((i) => i.code === 'commander_inferred'));
});

test('illegal partner pairing is an error', () => {
  const a = card({ name: 'Tatyova, Benthic Druid', typeLine: 'Legendary Creature — Merfolk Druid' });
  const b = card({ name: 'Krenko, Mob Boss', typeLine: 'Legendary Creature — Goblin Warrior', colorIdentity: ['R'] });
  const entries = [
    entry(a.name, 1, { isCommander: true, section: 'commander' }),
    entry(b.name, 1, { isCommander: true, section: 'commander' }),
    entry('Forest', 98),
  ];
  const result = validateDeck({
    entries,
    resolved: resolvedMap([a, b, FOREST]),
    unresolved: [],
  });
  assert.ok(result.issues.some((i) => i.code === 'invalid_commander'));
});

test('true partners are accepted', () => {
  const a = card({
    name: 'Thrasios, Triton Hero',
    typeLine: 'Legendary Creature — Merfolk Wizard',
    keywords: ['Partner'],
    colorIdentity: ['G', 'U'],
  });
  const b = card({
    name: 'Tymna the Weaver',
    typeLine: 'Legendary Creature — Human Cleric',
    keywords: ['Partner'],
    colorIdentity: ['W', 'B'],
  });
  const entries = [
    entry(a.name, 1, { isCommander: true, section: 'commander' }),
    entry(b.name, 1, { isCommander: true, section: 'commander' }),
    entry('Forest', 49),
    entry('Island', 49),
  ];
  const result = validateDeck({ entries, resolved: resolvedMap([a, b, FOREST, ISLAND]), unresolved: [] });
  assert.equal(result.issues.filter((i) => i.code === 'invalid_commander').length, 0);
  assert.deepEqual(result.colorIdentity, ['W', 'U', 'B', 'G']);
});

test('banned cards are flagged', () => {
  const { entries, resolved } = tatyovaDeck();
  const banned = card({ name: 'Banned Thing', legalInCommander: false, colorIdentity: [] });
  entries[1] = entry('Banned Thing');
  resolved.set(normalizeCardName('Banned Thing'), banned);
  const result = validateDeck({ entries, resolved, unresolved: [] });
  assert.ok(result.issues.some((i) => i.code === 'not_legal'));
});
