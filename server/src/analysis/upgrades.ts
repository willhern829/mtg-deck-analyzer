import type {
  CommanderResearch,
  ResolvedCard,
  SynergyCard,
  UpgradePlan,
  UpgradeSuggestion,
} from '@mtg/shared';
import { normalizeCardName } from '@mtg/shared';
import { resolveCards } from '../clients/scryfall.js';
import { isCardDraw, isFrontLand, isRamp, isRemoval } from './cardUtils.js';
import type { DeckCard } from './mana.js';

const MAX_SUGGESTIONS = 10;
// Resolve extra addition candidates so role-matching has options to pick from.
const CANDIDATE_POOL = 30;
// Cards this popular globally are format staples; don't suggest cutting them.
const STAPLE_RANK = 600;

const COLOR_WORDS: Record<string, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

/** Functional slot a card occupies, for like-for-like swap pairing. */
function roleOf(card: ResolvedCard): string {
  if (isRamp(card)) return 'ramp';
  if (isRemoval(card)) return 'removal';
  if (isCardDraw(card)) return 'card draw';
  const front = card.typeLine.split('//')[0]!;
  for (const t of ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land']) {
    if (front.includes(t)) return t.toLowerCase();
  }
  return 'utility';
}

/** "red", "blue-red", or "these colors" for wider identities. */
function colorPhrase(commanders: ResolvedCard[]): string {
  const identity = [...new Set(commanders.flatMap((c) => c.colorIdentity))];
  if (identity.length === 0) return 'colorless';
  if (identity.length > 2) return 'these colors';
  return identity.map((c) => COLOR_WORDS[c]).join('-');
}

interface CutCandidate {
  card: ResolvedCard;
  role: string;
  score: number;
}

function cutReason(card: ResolvedCard, research: CommanderResearch): string {
  const parts: string[] = [
    `Rarely played with ${research.commanderName} — it doesn't appear on the commander's EDHREC page`,
  ];
  const rank = card.edhrecRank;
  if (rank !== undefined) {
    if (rank > 20_000) {
      parts.push(`and sees almost no Commander play anywhere (#${rank.toLocaleString()} most-played card overall)`);
    } else if (rank > 8_000) {
      parts.push(`and is a fringe pick across Commander as a whole (#${rank.toLocaleString()} most-played)`);
    } else {
      parts.push(`even though it sees play in other decks (#${rank.toLocaleString()} most-played overall)`);
    }
  }
  let reason = parts.join(', ') + '.';
  if (card.manaValue >= 5) {
    reason += ` At ${card.manaValue} mana it also ties up one of your biggest turns for little payoff here.`;
  }
  return reason;
}

function addReason(
  add: SynergyCard,
  resolved: ResolvedCard | undefined,
  research: CommanderResearch,
  colors: string,
  cut: CutCandidate,
  addRole: string,
): string {
  const sentences: string[] = [];

  const inclusionPct = add.inclusionRate !== undefined ? Math.round(add.inclusionRate * 100) : undefined;
  const deckCount = research.deckCount ? `${research.deckCount.toLocaleString()} ` : '';
  if (inclusionPct !== undefined) {
    sentences.push(`Played in ${inclusionPct}% of the ${deckCount}${research.commanderName} decks on EDHREC`);
  } else {
    sentences.push(`A top EDHREC card for ${research.commanderName}`);
  }

  // EDHREC "synergy" = inclusion here minus inclusion in all decks of this
  // identity — translate it instead of printing the raw score.
  if (add.synergy !== undefined && add.synergy > 0.05) {
    sentences.push(
      `that's ${Math.round(add.synergy * 100)} points above its play rate in other ${colors} decks, so it's a ${research.commanderName}-specific pick, not just a staple`,
    );
  }

  let reason = sentences.join(' — ') + '.';
  if (addRole === cut.role) {
    reason += ` Same job as ${cut.card.name} (${addRole}), done better.`;
  } else if (resolved) {
    reason += ` It's ${article(addRole)} ${addRole} piece replacing ${article(cut.role)} ${cut.role} slot.`;
  }
  return reason;
}

function article(word: string): string {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

/**
 * Upgrade engine: cut candidates are nonland cards that neither appear in the
 * commander's EDHREC card pool nor rank as global staples; additions are the
 * highest-synergy EDHREC cards the deck isn't running. Cuts and adds are
 * paired by functional role where possible, priced via Scryfall, and totalled.
 */
export async function suggestUpgrades(
  deck: DeckCard[],
  commanders: ResolvedCard[],
  research: CommanderResearch | null,
  commanderPool: Set<string>,
): Promise<UpgradePlan | null> {
  if (!research || research.topSynergyCards.length === 0) return null;

  const notes: string[] = [];
  const deckNames = new Set(deck.map((d) => normalizeCardName(d.card.name)));
  for (const c of commanders) deckNames.add(normalizeCardName(c.name));

  const cuts: CutCandidate[] = [];
  for (const { card } of deck) {
    if (isFrontLand(card)) continue; // land-base tuning is out of scope here
    const inPool = commanderPool.has(card.name.toLowerCase());
    const rank = card.edhrecRank ?? 99_999;
    if (inPool || rank < STAPLE_RANK) continue;

    // Less-played globally and absent from this commander's meta = likely weak slot.
    let score = Math.min(rank / 10_000, 4);
    if (card.manaValue >= 5) score += 1; // expensive off-meta cards hurt most
    cuts.push({ card, role: roleOf(card), score });
  }
  cuts.sort((a, b) => b.score - a.score);

  const candidates = research.topSynergyCards
    .filter((s) => !deckNames.has(normalizeCardName(s.name)))
    .sort((a, b) => (b.synergy ?? 0) - (a.synergy ?? 0))
    .slice(0, CANDIDATE_POOL);

  if (cuts.length === 0 || candidates.length === 0) {
    notes.push('No obvious weak slots found — the deck already lines up with the EDHREC meta for this commander.');
    return { suggestions: [], totalUsd: 0, notes };
  }

  // One batched lookup gives every candidate's role and price up front.
  const lookup = await resolveCards(candidates.map((a) => a.name));
  const enriched = candidates.map((add) => {
    const resolved = lookup.cards.get(normalizeCardName(add.name));
    return { add, resolved, role: resolved ? roleOf(resolved) : 'utility' };
  });

  const colors = colorPhrase(commanders);
  const used = new Set<number>();
  const suggestions: UpgradeSuggestion[] = [];
  let runningTotal = 0;

  for (const cut of cuts.slice(0, MAX_SUGGESTIONS * 2)) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    // Prefer an addition that fills the same functional slot as the cut.
    let idx = enriched.findIndex((e, i) => !used.has(i) && e.role === cut.role);
    if (idx === -1) idx = enriched.findIndex((_, i) => !used.has(i));
    if (idx === -1) break;
    used.add(idx);

    const { add, resolved, role } = enriched[idx]!;
    const price = resolved?.priceUsd ?? null;
    if (price !== null) runningTotal += price;

    suggestions.push({
      cut: cut.card.name,
      cutReason: cutReason(cut.card, research),
      add: add.name,
      addReason: addReason(add, resolved, research, colors, cut, role),
      slot: role,
      priceUsd: price,
      runningTotalUsd: Math.round(runningTotal * 100) / 100,
    });
  }

  const unpriced = suggestions.filter((s) => s.priceUsd === null).length;
  if (unpriced > 0) {
    notes.push(`${unpriced} suggestion(s) had no Scryfall USD price and are excluded from the total.`);
  }
  notes.push(
    'Cuts are heuristic: a card can be a deliberate pet/theme choice even if the EDHREC meta skips it. Treat these as review flags, not verdicts.',
  );

  return {
    suggestions,
    totalUsd: Math.round(runningTotal * 100) / 100,
    notes,
  };
}
