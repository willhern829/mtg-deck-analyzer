import type { ComboInfo, ComboReport } from '@mtg/shared';
import { TtlCache } from '../lib/cache.js';
import { fetchJson } from '../lib/http.js';

/**
 * Commander Spellbook — an officially open, documented REST API
 * (https://backend.commanderspellbook.com/schema/redoc/). Used for combo
 * detection ("you're one card away from infinite mana") and WotC Commander
 * Bracket estimation. Best-effort: failures return null.
 */
const BASE = 'https://backend.commanderspellbook.com';
const MIN_GAP_MS = 300;

interface VariantCard {
  card?: { name?: string } | string;
  name?: string;
}

interface Variant {
  id?: string | number;
  uses?: VariantCard[];
  produces?: { feature?: { name?: string }; name?: string }[];
  description?: string;
}

interface FindMyCombosResponse {
  results?: {
    included?: Variant[];
    almostIncluded?: Variant[];
  };
}

const comboCache = new TtlCache<ComboReport | null>(1000 * 60 * 60, 200);

// BracketTagEnum from the Spellbook OpenAPI schema (/schema/).
const BRACKET_LABELS: Record<string, string> = {
  E: 'Exhibition',
  C: 'Core',
  O: 'Oddball',
  P: 'Powerful',
  S: 'Spicy',
  R: 'Ruthless',
  B: 'Contains banned cards',
};

function cardName(c: VariantCard): string | undefined {
  if (typeof c.card === 'string') return c.card;
  return c.card?.name ?? c.name;
}

function toComboInfo(v: Variant, deckNames?: Set<string>): ComboInfo {
  const cards = (v.uses ?? []).map(cardName).filter((n): n is string => !!n);
  return {
    id: String(v.id ?? cards.join('+')),
    cards,
    produces: (v.produces ?? [])
      .map((p) => p.feature?.name ?? p.name)
      .filter((n): n is string => !!n),
    description: v.description,
    missing: deckNames ? cards.filter((c) => !deckNames.has(c.toLowerCase())) : undefined,
  };
}

export async function findCombos(
  commanders: string[],
  mainboard: string[],
): Promise<ComboReport | null> {
  const key = [...commanders, ...mainboard].sort().join('|');
  return comboCache.getOrLoad(key, async () => {
    try {
      const deckNames = new Set(
        [...commanders, ...mainboard].map((n) => n.toLowerCase()),
      );
      const body = {
        commanders: commanders.map((card) => ({ card, quantity: 1 })),
        main: mainboard.slice(0, 600).map((card) => ({ card, quantity: 1 })),
      };
      const [combos, bracket] = await Promise.all([
        fetchJson<FindMyCombosResponse>(`${BASE}/find-my-combos`, {
          method: 'POST',
          body,
          minGapMs: MIN_GAP_MS,
          retries: 1,
        }),
        fetchJson<{ bracketTag?: string }>(`${BASE}/estimate-bracket`, {
          method: 'POST',
          body,
          minGapMs: MIN_GAP_MS,
          retries: 1,
        }).catch(() => null),
      ]);
      return {
        included: (combos.results?.included ?? []).slice(0, 25).map((v) => toComboInfo(v)),
        almostIncluded: (combos.results?.almostIncluded ?? [])
          .slice(0, 25)
          .map((v) => toComboInfo(v, deckNames)),
        bracket: bracket?.bracketTag
          ? { tag: bracket.bracketTag, label: BRACKET_LABELS[bracket.bracketTag] ?? bracket.bracketTag }
          : undefined,
      };
    } catch {
      return null;
    }
  });
}
