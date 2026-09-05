import type { CommanderResearch, SynergyCard } from '@mtg/shared';
import { TtlCache } from '../lib/cache.js';
import { fetchJson } from '../lib/http.js';

/**
 * EDHREC has no official API. These are the JSON endpoints that power the
 * edhrec.com frontend (json.edhrec.com) — widely used by community tools but
 * undocumented and subject to change, so everything here is parsed
 * defensively and cached aggressively. Callers must treat failures as
 * "degraded mode", never fatal.
 */
const BASE = 'https://json.edhrec.com/pages';
const MIN_GAP_MS = 500;

interface EdhrecCardView {
  name?: string;
  synergy?: number;
  inclusion?: number;
  num_decks?: number;
  potential_decks?: number;
}

interface EdhrecPage {
  container?: {
    json_dict?: {
      card?: { name?: string; num_decks?: number };
      cardlists?: { tag?: string; header?: string; cardviews?: EdhrecCardView[] }[];
    };
  };
  panels?: {
    taglinks?: { value?: string; slug?: string; count?: number }[];
  };
  // Top-level average type counts (creature, land, instant, ...).
  [key: string]: unknown;
}

const pageCache = new TtlCache<EdhrecPage | null>(1000 * 60 * 60 * 12, 500);

/** EDHREC slug: lowercase, accents stripped, punctuation dropped, spaces to hyphens. */
export function edhrecSlug(commanderName: string): string {
  return commanderName
    .split('//')[0]! // partner "A // B" style names and DFC fronts
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["'’.,]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Partner pages live at the two slugs joined in alphabetical order. */
export function partnerSlug(names: string[]): string {
  return names.map(edhrecSlug).sort().join('-');
}

async function fetchPage(path: string): Promise<EdhrecPage | null> {
  return pageCache.getOrLoad(path, async () => {
    try {
      return await fetchJson<EdhrecPage>(`${BASE}/${path}.json`, {
        minGapMs: MIN_GAP_MS,
        retries: 2,
      });
    } catch {
      return null;
    }
  });
}

function toSynergyCards(views: EdhrecCardView[] | undefined): SynergyCard[] {
  return (views ?? [])
    .filter((v) => v.name)
    .map((v) => ({
      name: v.name!,
      synergy: v.synergy,
      inclusionRate:
        v.num_decks && v.potential_decks ? v.num_decks / v.potential_decks : undefined,
    }));
}

const AVG_COMPOSITION_KEYS = [
  'creature',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'planeswalker',
  'battle',
  'land',
  'basic',
  'nonbasic',
];

/**
 * Fetch commander research from the EDHREC commander page. Returns null when
 * the page cannot be fetched or parsed — callers fall back to Scryfall-only.
 */
export async function getCommanderResearch(
  commanderNames: string[],
): Promise<CommanderResearch | null> {
  if (commanderNames.length === 0) return null;
  const slug =
    commanderNames.length > 1 ? partnerSlug(commanderNames) : edhrecSlug(commanderNames[0]!);

  let page = await fetchPage(`commanders/${slug}`);
  // Partner page missing (e.g. rare pairing) — fall back to the primary commander.
  if (!page && commanderNames.length > 1) {
    page = await fetchPage(`commanders/${edhrecSlug(commanderNames[0]!)}`);
  }
  const dict = page?.container?.json_dict;
  if (!dict?.cardlists) return null;

  const byTag = new Map(dict.cardlists.map((l) => [l.tag ?? l.header ?? '', l]));
  const highSynergy = toSynergyCards(byTag.get('highsynergycards')?.cardviews);
  const topCards = toSynergyCards(byTag.get('topcards')?.cardviews);

  const merged = new Map<string, SynergyCard>();
  for (const c of [...highSynergy, ...topCards]) {
    if (!merged.has(c.name)) merged.set(c.name, c);
  }

  const avgComposition: Record<string, number> = {};
  for (const key of AVG_COMPOSITION_KEYS) {
    const v = (page as Record<string, unknown>)[key];
    if (typeof v === 'number') avgComposition[key] = v;
  }

  return {
    source: 'edhrec',
    commanderName: dict.card?.name ?? commanderNames.join(' + '),
    deckCount: dict.card?.num_decks,
    themes: (page?.panels?.taglinks ?? [])
      .filter((t) => t.value)
      .slice(0, 8)
      .map((t) => ({
        name: t.value!,
        url: t.slug ? `https://edhrec.com/commanders/${slug}/${t.slug}` : undefined,
      })),
    avgComposition: Object.keys(avgComposition).length ? avgComposition : undefined,
    topSynergyCards: [...merged.values()].slice(0, 40),
    notes: [
      `Data from EDHREC's unofficial JSON endpoints (edhrec.com/commanders/${slug}); cached for 12h.`,
    ],
  };
}

/** All cardlists on the page (creatures, lands, ...) — the commander-meta card pool. */
export async function getCommanderCardPool(commanderNames: string[]): Promise<Set<string>> {
  const pool = new Set<string>();
  if (commanderNames.length === 0) return pool;
  const slug =
    commanderNames.length > 1 ? partnerSlug(commanderNames) : edhrecSlug(commanderNames[0]!);
  const page =
    (await fetchPage(`commanders/${slug}`)) ??
    (commanderNames.length > 1
      ? await fetchPage(`commanders/${edhrecSlug(commanderNames[0]!)}`)
      : null);
  for (const list of page?.container?.json_dict?.cardlists ?? []) {
    for (const v of list.cardviews ?? []) {
      if (v.name) pool.add(v.name.toLowerCase());
    }
  }
  return pool;
}
