import type { ResolvedCard } from '@mtg/shared';

/** Front face is a land — counts toward the deck's land slot. */
export function isFrontLand(card: ResolvedCard): boolean {
  const front = card.faces?.[0]?.typeLine ?? card.typeLine.split('//')[0] ?? '';
  return /\bLand\b/.test(front);
}

/** Any face is a land (MDFC spell//land counts) — playable as a land drop. */
export function hasLandFace(card: ResolvedCard): boolean {
  if (isFrontLand(card)) return true;
  return (card.faces ?? []).some((f) => /\bLand\b/.test(f.typeLine ?? ''));
}

export function isBasicLand(card: ResolvedCard): boolean {
  return /\bBasic\b/.test(card.typeLine);
}

/** Cards exempt from singleton by their own rules text (Relentless Rats etc.). */
export function isSingletonExempt(card: ResolvedCard): boolean {
  return (
    isBasicLand(card) ||
    /any number of cards named/i.test(card.oracleText ?? '')
  );
}

export function canBeCommander(card: ResolvedCard): boolean {
  const oracle = card.oracleText ?? '';
  if (/can be your commander/i.test(oracle)) return true;
  const front = card.faces?.[0];
  const frontType = front?.typeLine ?? card.typeLine;
  if (/can be your commander/i.test(front?.oracleText ?? '')) return true;
  return /\bLegendary\b/.test(frontType) && /\bCreature\b/.test(frontType);
}

/** Legal two-commander pairings share one of these mechanics. */
export function partnerMechanic(card: ResolvedCard): string | undefined {
  const kw = card.keywords.map((k) => k.toLowerCase());
  const oracle = (card.oracleText ?? '').toLowerCase();
  if (kw.includes('friends forever')) return 'friends forever';
  if (kw.includes("doctor's companion")) return "doctor's companion";
  if (oracle.includes('partner with')) return 'partner with';
  if (kw.includes('partner')) return 'partner';
  if (oracle.includes('choose a background')) return 'background-pairer';
  if (/\bBackground\b/.test(card.typeLine)) return 'background';
  if (/time lord/i.test(card.typeLine)) return 'time lord';
  return undefined;
}

export function isValidCommanderPair(a: ResolvedCard, b: ResolvedCard): boolean {
  const ma = partnerMechanic(a);
  const mb = partnerMechanic(b);
  if (!ma || !mb) return false;
  if (ma === 'partner' && mb === 'partner') return true;
  if (ma === 'friends forever' && mb === 'friends forever') return true;
  if (ma === 'partner with' && mb === 'partner with') {
    // Each must name the other.
    const aNames = (a.oracleText ?? '').toLowerCase().includes(b.name.split('//')[0]!.trim().toLowerCase());
    const bNames = (b.oracleText ?? '').toLowerCase().includes(a.name.split('//')[0]!.trim().toLowerCase());
    return aNames && bNames;
  }
  const pair = new Set([ma, mb]);
  if (pair.has('background-pairer') && pair.has('background')) return true;
  if (pair.has("doctor's companion") && pair.has('time lord')) return true;
  return false;
}

/**
 * Ramp heuristic: nonland cards that accelerate mana — rocks/dorks
 * (produce mana), land-fetch effects, treasure makers, cost reducers.
 */
export function isRamp(card: ResolvedCard): boolean {
  if (isFrontLand(card)) return false;
  const oracle = card.oracleText ?? '';
  // Rocks/dorks tap to add mana. producedMana alone misses colorless-only
  // producers (Sol Ring adds {C}, which isn't a WUBRG color).
  if (/\{T\}[^:.\n]*: add \{/i.test(oracle)) return true;
  if (card.producedMana && card.producedMana.length > 0 && /\badd\b/i.test(oracle)) return true;
  if (/search your library for .{0,60}land.{0,120}onto the battlefield/is.test(oracle)) return true;
  if (/create .{0,40}Treasure token/i.test(oracle)) return true;
  if (/spells? .{0,40}cost \{?\d\}? less to cast/i.test(oracle)) return true;
  return false;
}

export function isCardDraw(card: ResolvedCard): boolean {
  return /draw (a card|two|three|\d+ cards|cards equal)/i.test(card.oracleText ?? '');
}

export function isRemoval(card: ResolvedCard): boolean {
  const oracle = card.oracleText ?? '';
  return /\b(destroy|exile) (target|each|all|any)/i.test(oracle) || /deals? \d+ damage to (target|any)/i.test(oracle);
}
