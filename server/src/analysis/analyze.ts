import type {
  CommanderResearch,
  DeckAnalysis,
  DeckCardView,
  DeckEntry,
  ResolvedCard,
} from '@mtg/shared';
import { normalizeCardName, parseDecklist } from '@mtg/shared';
import { getCommanderCardPool, getCommanderResearch } from '../clients/edhrec.js';
import { findCombos } from '../clients/spellbook.js';
import { fuzzySuggestion, resolveCards } from '../clients/scryfall.js';
import type { DeckCard } from './mana.js';
import { analyzeMana } from './mana.js';
import { simulateHands } from './simulate.js';
import { suggestUpgrades } from './upgrades.js';
import { validateDeck } from './validate.js';

/** Degraded mode when EDHREC is unreachable: derive what we can from Scryfall data. */
function fallbackResearch(commanders: ResolvedCard[]): CommanderResearch | null {
  const primary = commanders[0];
  if (!primary) return null;
  const themes = primary.keywords.slice(0, 6).map((k) => ({ name: k }));
  return {
    source: 'scryfall-fallback',
    commanderName: commanders.map((c) => c.name).join(' + '),
    themes,
    topSynergyCards: [],
    notes: [
      'EDHREC was unreachable — showing Scryfall-only data. Synergy cards and upgrade suggestions are unavailable in this mode.',
    ],
  };
}

export async function analyzeDeck(decklist: string): Promise<DeckAnalysis> {
  const { entries, issues: parseIssues } = parseDecklist(decklist);

  const playable = entries.filter(
    (e) => e.section === 'mainboard' || e.section === 'commander',
  );
  const resolveResult = await resolveCards(playable.map((e) => e.name));

  // Best-effort spelling suggestions for anything Scryfall couldn't resolve.
  const unresolvedNames = playable
    .map((e) => e.name)
    .filter((n) => !resolveResult.cards.has(normalizeCardName(n)));
  const unresolved = await Promise.all(
    unresolvedNames.map(async (name) => ({ name, suggestion: await fuzzySuggestion(name) })),
  );

  const validation = validateDeck({
    entries,
    resolved: resolveResult.cards,
    unresolved,
  });

  const cardOf = (e: DeckEntry) => resolveResult.cards.get(normalizeCardName(e.name));
  const commanderKeys = new Set(validation.commanderNames.map(normalizeCardName));
  const commanders = validation.commanderNames
    .map((n) => resolveResult.cards.get(normalizeCardName(n)))
    .filter((c): c is ResolvedCard => !!c);

  // The 99 (or fewer): resolved mainboard cards, commanders excluded.
  const deck: DeckCard[] = [];
  for (const e of playable) {
    const card = cardOf(e);
    if (!card || commanderKeys.has(normalizeCardName(card.name))) continue;
    deck.push({ card, quantity: e.quantity });
  }

  const commanderNames = commanders.map((c) => c.name);
  // External research calls run concurrently; each degrades to null on failure.
  const [research, pool, combos] = await Promise.all([
    getCommanderResearch(commanderNames).catch(() => null),
    getCommanderCardPool(commanderNames).catch(() => new Set<string>()),
    findCombos(
      commanderNames,
      deck.map((d) => d.card.name),
    ).catch(() => null),
  ]);

  const effectiveResearch = research ?? fallbackResearch(commanders);

  const mana = analyzeMana(deck, commanders);
  const synergyInDeck = (effectiveResearch?.topSynergyCards ?? [])
    .map((s) => s.name)
    .filter((n) => deck.some((d) => normalizeCardName(d.card.name) === normalizeCardName(n)));
  const hands = simulateHands(deck, synergyInDeck);

  const upgrades = await suggestUpgrades(deck, commanders, research, pool).catch(() => null);

  const cards: DeckCardView[] = deck.map((d) => ({
    name: d.card.name,
    quantity: d.quantity,
    manaValue: d.card.manaValue,
    typeLine: d.card.typeLine,
    colorIdentity: d.card.colorIdentity,
    priceUsd: d.card.priceUsd,
    imageNormal: d.card.imageNormal,
  }));

  const deckPriceUsd =
    deck.reduce((n, d) => n + (d.card.priceUsd ?? 0) * d.quantity, 0) +
    commanders.reduce((n, c) => n + (c.priceUsd ?? 0), 0);

  return {
    commanders,
    validation,
    parseIssues,
    unresolved,
    cards,
    mana,
    hands,
    research: effectiveResearch,
    combos,
    upgrades,
    deckPriceUsd: Math.round(deckPriceUsd * 100) / 100,
  };
}
