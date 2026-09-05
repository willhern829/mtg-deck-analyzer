import type { CardFace, Color, ResolvedCard } from '@mtg/shared';
import { normalizeCardName } from '@mtg/shared';
import { TtlCache } from '../lib/cache.js';
import { fetchJson, HttpError } from '../lib/http.js';

const API = 'https://api.scryfall.com';
// Scryfall asks for 50-100ms between requests; we stay conservative.
const MIN_GAP_MS = 120;
const COLLECTION_BATCH = 75; // documented max identifiers per /cards/collection call

interface ScryfallFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  produced_mana?: string[];
  image_uris?: { normal?: string; art_crop?: string };
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  layout: string;
  card_faces?: ScryfallFace[];
  keywords?: string[];
  produced_mana?: string[];
  legalities?: Record<string, string>;
  edhrec_rank?: number;
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
  image_uris?: { normal?: string; art_crop?: string };
}

interface CollectionResponse {
  data: ScryfallCard[];
  not_found: { name?: string }[];
}

const cardCache = new TtlCache<ResolvedCard>(1000 * 60 * 60 * 24);
const autocompleteCache = new TtlCache<string[]>(1000 * 60 * 60);

function asColors(values?: string[]): Color[] {
  return (values ?? []).filter((c): c is Color => 'WUBRG'.includes(c));
}

function toFace(f: ScryfallFace): CardFace {
  return {
    name: f.name,
    manaCost: f.mana_cost,
    typeLine: f.type_line,
    oracleText: f.oracle_text,
    producedMana: f.produced_mana ? asColors(f.produced_mana) : undefined,
    imageNormal: f.image_uris?.normal,
  };
}

export function toResolvedCard(c: ScryfallCard): ResolvedCard {
  const faces = c.card_faces?.map(toFace);
  // Multi-face cards keep oracle text / images on the faces, not the root.
  const oracleText =
    c.oracle_text ?? faces?.map((f) => f.oracleText).filter(Boolean).join('\n//\n');
  return {
    scryfallId: c.id,
    oracleId: c.oracle_id ?? c.id,
    name: c.name,
    manaCost: c.mana_cost ?? faces?.[0]?.manaCost,
    manaValue: c.cmc ?? 0,
    typeLine: c.type_line ?? faces?.map((f) => f.typeLine).join(' // ') ?? '',
    oracleText: oracleText || undefined,
    colors: asColors(c.colors),
    colorIdentity: asColors(c.color_identity),
    layout: c.layout,
    faces,
    keywords: c.keywords ?? [],
    producedMana: c.produced_mana ? asColors(c.produced_mana) : undefined,
    legalInCommander: c.legalities?.commander === 'legal',
    edhrecRank: c.edhrec_rank,
    priceUsd: parsePrice(c.prices),
    imageNormal: c.image_uris?.normal ?? faces?.[0]?.imageNormal,
    imageArtCrop: c.image_uris?.art_crop,
  };
}

function parsePrice(prices?: ScryfallCard['prices']): number | undefined {
  const raw = prices?.usd ?? prices?.usd_foil ?? prices?.usd_etched;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export interface ResolveResult {
  cards: Map<string, ResolvedCard>; // keyed by normalized requested name
  notFound: string[];
}

/**
 * Resolve card names in bulk via POST /cards/collection (75 identifiers per
 * request). Names already in cache are skipped entirely.
 */
export async function resolveCards(names: string[]): Promise<ResolveResult> {
  const result: ResolveResult = { cards: new Map(), notFound: [] };
  const misses: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const key = normalizeCardName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const cached = cardCache.get(key);
    if (cached) result.cards.set(key, cached);
    else misses.push(name);
  }

  // The collection "name" identifier doesn't accept full "Front // Back"
  // names, so query multi-face names by their front face.
  const requests = misses.map((requested) => ({
    requested,
    query: requested.includes('//') ? requested.split('//')[0]!.trim() : requested,
  }));

  for (let i = 0; i < requests.length; i += COLLECTION_BATCH) {
    const batch = requests.slice(i, i + COLLECTION_BATCH);
    const res = await fetchJson<CollectionResponse>(`${API}/cards/collection`, {
      method: 'POST',
      body: { identifiers: batch.map((r) => ({ name: r.query })) },
      minGapMs: MIN_GAP_MS,
    });
    for (const card of res.data) {
      const resolved = toResolvedCard(card);
      // Map back to what was asked for, so "Fire" and "Fire // Ice" both key correctly.
      const match = batch.find(
        (r) =>
          normalizeCardName(card.name) === normalizeCardName(r.query) ||
          normalizeCardName(card.name).startsWith(normalizeCardName(r.query) + ' //') ||
          card.card_faces?.some((f) => normalizeCardName(f.name) === normalizeCardName(r.query)),
      );
      const key = normalizeCardName(match?.requested ?? card.name);
      cardCache.set(key, resolved);
      cardCache.set(normalizeCardName(card.name), resolved);
      result.cards.set(key, resolved);
    }
    for (const missing of res.not_found) {
      const req = batch.find((r) => normalizeCardName(r.query) === normalizeCardName(missing.name ?? ''));
      result.notFound.push(req?.requested ?? missing.name ?? 'unknown');
    }
  }
  return result;
}

/** Fuzzy lookup used to suggest corrections for misspelled names. */
export async function fuzzySuggestion(name: string): Promise<string | undefined> {
  try {
    const card = await fetchJson<ScryfallCard>(
      `${API}/cards/named?fuzzy=${encodeURIComponent(name)}`,
      { minGapMs: MIN_GAP_MS, retries: 1 },
    );
    return card.name;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return undefined;
    return undefined; // suggestion is best-effort; never fail the analysis over it
  }
}

export async function autocomplete(query: string): Promise<string[]> {
  if (query.length < 2) return [];
  return autocompleteCache.getOrLoad(query.toLowerCase(), async () => {
    const res = await fetchJson<{ data: string[] }>(
      `${API}/cards/autocomplete?q=${encodeURIComponent(query)}`,
      { minGapMs: MIN_GAP_MS, retries: 1 },
    );
    return res.data;
  });
}

export async function getCardByName(name: string): Promise<ResolvedCard | undefined> {
  const { cards } = await resolveCards([name]);
  return cards.get(normalizeCardName(name));
}
