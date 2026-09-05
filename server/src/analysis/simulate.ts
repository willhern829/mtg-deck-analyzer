import type { HandSimulation, ResolvedCard } from '@mtg/shared';
import { hasLandFace, isCardDraw, isRamp, isRemoval } from './cardUtils.js';
import type { DeckCard } from './mana.js';

const HAND_SIZE = 7;
const DEFAULT_ITERATIONS = 20_000;

interface SimCard {
  name: string;
  land: boolean; // any land face — playable as the land drop
  manaValue: number;
  cheapRamp: boolean; // mana acceleration at MV <= 3
  draw: boolean;
  removal: boolean;
  synergy: boolean; // flagged key piece (EDHREC high-synergy card in the deck)
}

function toSimDeck(deck: DeckCard[], synergyNames: Set<string>): SimCard[] {
  const cards: SimCard[] = [];
  for (const { card, quantity } of deck) {
    const sim: SimCard = {
      name: card.name,
      land: hasLandFace(card),
      manaValue: card.manaValue,
      cheapRamp: isRamp(card) && card.manaValue <= 3,
      draw: isCardDraw(card),
      removal: isRemoval(card),
      synergy: synergyNames.has(card.name.toLowerCase()),
    };
    for (let i = 0; i < quantity; i++) cards.push(sim);
  }
  return cards;
}

/** Partial Fisher-Yates: shuffles just the first `count` positions. */
function drawHand(deck: SimCard[], count: number, rng: () => number): SimCard[] {
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck.slice(0, count);
}

/**
 * A hand is "keepable" when it can develop: 2-5 lands, plus early action —
 * with 3+ lands any two castable spells will do; on exactly 2 lands we
 * require cheap ramp or a very low curve draw to forgive the risk.
 */
function isKeepable(hand: SimCard[]): boolean {
  const lands = hand.filter((c) => c.land).length;
  if (lands < 2 || lands > 5) return false;
  const spells = hand.filter((c) => !c.land);
  const earlyPlays = spells.filter((c) => c.manaValue <= 3).length;
  if (lands === 2) {
    const cheapRamp = spells.some((c) => c.cheapRamp);
    return cheapRamp || earlyPlays >= 3;
  }
  return earlyPlays >= 1 || spells.some((c) => c.manaValue <= lands);
}

export function simulateHands(
  deck: DeckCard[],
  synergyCardNames: string[] = [],
  iterations = DEFAULT_ITERATIONS,
  rng: () => number = Math.random,
): HandSimulation {
  const synergyNames = new Set(synergyCardNames.map((n) => n.toLowerCase()));
  const simDeck = toSimDeck(deck, synergyNames);

  const landDist = new Array<number>(HAND_SIZE + 1).fill(0);
  let keepable = 0;
  let landSum = 0;
  const groupHits = { ramp: 0, draw: 0, removal: 0, synergy: 0 };
  let exampleKeep: string[] = [];
  let exampleMull: string[] = [];

  if (simDeck.length < HAND_SIZE) {
    return emptySimulation('Deck has fewer than 7 cards; simulation skipped.');
  }

  for (let i = 0; i < iterations; i++) {
    const hand = drawHand(simDeck, HAND_SIZE, rng);
    const lands = hand.filter((c) => c.land).length;
    landDist[lands] = (landDist[lands] ?? 0) + 1;
    landSum += lands;
    const keep = isKeepable(hand);
    if (keep) keepable++;
    if (keep && exampleKeep.length === 0) exampleKeep = hand.map((c) => c.name);
    if (!keep && exampleMull.length === 0) exampleMull = hand.map((c) => c.name);
    if (hand.some((c) => c.cheapRamp)) groupHits.ramp++;
    if (hand.some((c) => c.draw)) groupHits.draw++;
    if (hand.some((c) => c.removal)) groupHits.removal++;
    if (synergyNames.size > 0 && hand.some((c) => c.synergy)) groupHits.synergy++;
  }

  const uniqueNames = (pred: (c: SimCard) => boolean) =>
    [...new Set(simDeck.filter(pred).map((c) => c.name))];

  const keyGroups = [
    { label: 'Cheap ramp (MV ≤ 3)', cards: uniqueNames((c) => c.cheapRamp), hits: groupHits.ramp },
    { label: 'Card draw', cards: uniqueNames((c) => c.draw), hits: groupHits.draw },
    { label: 'Removal / interaction', cards: uniqueNames((c) => c.removal), hits: groupHits.removal },
    ...(synergyNames.size > 0
      ? [{ label: 'Key synergy pieces', cards: uniqueNames((c) => c.synergy), hits: groupHits.synergy }]
      : []),
  ]
    .filter((g) => g.cards.length > 0)
    .map((g) => ({
      label: g.label,
      cards: g.cards.slice(0, 12),
      pctInOpener: Math.round((1000 * g.hits) / iterations) / 10,
    }));

  const avgLands = landSum / iterations;
  const keepRate = keepable / iterations;
  const landCount = simDeck.filter((c) => c.land).length;

  const guidance: string[] = [
    `Keep 3-4 land hands with at least one play in the first three turns; ~${Math.round(
      ((landDist[3]! + landDist[4]!) / iterations) * 100,
    )}% of your hands have exactly 3-4 lands.`,
    `Two-land hands are keepable only with cheap ramp (${keyGroups[0]?.cards.slice(0, 4).join(', ') || 'none detected'}) or a very low-curve draw.`,
    `About ${Math.round(keepRate * 100)}% of your openers meet the keep criteria — ${
      keepRate < 0.7
        ? 'below the ~75% comfort zone; more lands or cheap ramp would smooth your starts.'
        : 'a healthy rate; mulligan aggressively for hands that advance your game plan.'
    }`,
  ];
  if (landCount / simDeck.length < 0.35) {
    guidance.push('Your land density is on the low side — prioritize land-heavy hands over spell-heavy ones.');
  }

  return {
    iterations,
    landDistribution: landDist.map((n) => Math.round((10000 * n) / iterations) / 10000),
    avgLandsInHand: Math.round(avgLands * 100) / 100,
    keepableRate: Math.round(keepRate * 1000) / 1000,
    keepCriteria:
      '2-5 lands with early action: on 3+ lands, at least one spell castable on curve; on exactly 2 lands, cheap ramp or 3+ plays at MV ≤ 3.',
    keyGroups,
    exampleKeepableHand: exampleKeep,
    exampleMulligan: exampleMull,
    mulliganGuidance: guidance,
  };
}

function emptySimulation(note: string): HandSimulation {
  return {
    iterations: 0,
    landDistribution: [],
    avgLandsInHand: 0,
    keepableRate: 0,
    keepCriteria: note,
    keyGroups: [],
    exampleKeepableHand: [],
    exampleMulligan: [],
    mulliganGuidance: [note],
  };
}
