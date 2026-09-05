import type { ResolvedCard } from '@mtg/shared';

let n = 0;
export function card(overrides: Partial<ResolvedCard> & { name: string }): ResolvedCard {
  n++;
  return {
    scryfallId: `fixture-${n}`,
    oracleId: `oracle-${n}`,
    manaCost: '{1}',
    manaValue: 1,
    typeLine: 'Creature — Test',
    oracleText: '',
    colors: [],
    colorIdentity: [],
    layout: 'normal',
    keywords: [],
    legalInCommander: true,
    ...overrides,
  };
}

export const FOREST = card({
  name: 'Forest',
  typeLine: 'Basic Land — Forest',
  manaCost: undefined,
  manaValue: 0,
  producedMana: ['G'],
  oracleText: '({T}: Add {G}.)',
});

export const ISLAND = card({
  name: 'Island',
  typeLine: 'Basic Land — Island',
  manaCost: undefined,
  manaValue: 0,
  producedMana: ['U'],
  oracleText: '({T}: Add {U}.)',
});

export const SOL_RING = card({
  name: 'Sol Ring',
  typeLine: 'Artifact',
  manaValue: 1,
  manaCost: '{1}',
  producedMana: [],
  oracleText: '{T}: Add {C}{C}.',
  edhrecRank: 1,
});

export const RAMPANT_GROWTH = card({
  name: 'Rampant Growth',
  typeLine: 'Sorcery',
  manaCost: '{1}{G}',
  manaValue: 2,
  colorIdentity: ['G'],
  oracleText:
    'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
});

export const TATYOVA = card({
  name: 'Tatyova, Benthic Druid',
  typeLine: 'Legendary Creature — Merfolk Druid',
  manaCost: '{3}{G}{U}',
  manaValue: 5,
  colors: ['G', 'U'],
  colorIdentity: ['G', 'U'],
  oracleText: 'Whenever a land you control enters, you gain 1 life and draw a card.',
});

export const LIGHTNING_BOLT = card({
  name: 'Lightning Bolt',
  typeLine: 'Instant',
  manaCost: '{R}',
  manaValue: 1,
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Lightning Bolt deals 3 damage to any target.',
});
