import type {
  Color,
  ColorBalanceRow,
  CurveBucket,
  ManaAnalysis,
  ResolvedCard,
} from '@mtg/shared';
import { COLORS } from '@mtg/shared';
import { hasLandFace, isFrontLand, isRamp } from './cardUtils.js';

export interface DeckCard {
  card: ResolvedCard;
  quantity: number;
}

/** Count colored pips in a mana cost; hybrid/Phyrexian halves split across colors. */
export function countPips(manaCost: string | undefined): Record<Color, number> {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (!manaCost) return pips;
  for (const sym of manaCost.match(/\{[^}]+\}/g) ?? []) {
    const inner = sym.slice(1, -1).toUpperCase();
    const parts = inner.split('/');
    const colorParts = parts.filter((p): p is Color => 'WUBRG'.includes(p));
    if (colorParts.length === 0) continue;
    // {W} -> 1.0 to W; {W/U} -> 0.5 each; {W/P}, {2/W} -> 1.0 to W.
    const weight = colorParts.length > 1 ? 1 / colorParts.length : 1;
    for (const c of colorParts) pips[c] += weight;
  }
  return pips;
}

// Frank Karsten's Commander land-count model (99-card deck, playing first):
// lands ≈ 31.42 + 3.13 × avgMV − 0.28 × (ramp + card-selection spells).
function recommendedLands(avgManaValue: number, rampCount: number): [number, number] {
  const mid = Math.round(31.42 + 3.13 * avgManaValue - 0.28 * rampCount);
  const clamped = Math.min(42, Math.max(30, mid));
  return [clamped - 1, clamped + 1];
}

export function analyzeMana(deck: DeckCard[], commanders: ResolvedCard[]): ManaAnalysis {
  const notes: string[] = [];
  const nonCommander = deck; // commanders live in the command zone
  const lands = nonCommander.filter((d) => isFrontLand(d.card));
  const spells = nonCommander.filter((d) => !isFrontLand(d.card));
  const landCount = lands.reduce((n, d) => n + d.quantity, 0);

  const mdfcLands = spells.filter((d) => hasLandFace(d.card));
  if (mdfcLands.length > 0) {
    notes.push(
      `${mdfcLands.length} modal double-faced card(s) with a land back (${mdfcLands
        .map((d) => d.card.name.split('//')[0]!.trim())
        .join(', ')}) — each plays as roughly half a land beyond the ${landCount} counted.`,
    );
  }

  // Curve buckets 0..6 and 7+ over nonland cards.
  const buckets = new Map<number, number>();
  let mvSum = 0;
  let spellCount = 0;
  for (const d of spells) {
    const mv = Math.min(7, Math.floor(d.card.manaValue));
    buckets.set(mv, (buckets.get(mv) ?? 0) + d.quantity);
    mvSum += d.card.manaValue * d.quantity;
    spellCount += d.quantity;
  }
  const curve: CurveBucket[] = [];
  for (let mv = 0; mv <= 7; mv++) curve.push({ manaValue: mv, count: buckets.get(mv) ?? 0 });
  const avgManaValue = spellCount > 0 ? mvSum / spellCount : 0;

  const rampCards = spells.filter((d) => isRamp(d.card));
  const rampCount = rampCards.reduce((n, d) => n + d.quantity, 0);
  const rampMvSum = rampCards.reduce((n, d) => n + d.card.manaValue * d.quantity, 0);

  const landRange = recommendedLands(avgManaValue, rampCount);
  if (landCount < landRange[0]) {
    notes.push(
      `Land count (${landCount}) is below the recommended ${landRange[0]}–${landRange[1]} for an average mana value of ${avgManaValue.toFixed(2)} with ${rampCount} ramp pieces.`,
    );
  } else if (landCount > landRange[1]) {
    notes.push(`Land count (${landCount}) is above the recommended ${landRange[0]}–${landRange[1]} — consider swapping a land for a spell.`);
  }

  const rampRange: [number, number] = [10, 14];
  if (rampCount < rampRange[0]) {
    notes.push(`Only ${rampCount} ramp pieces detected — most Commander decks want ${rampRange[0]}–${rampRange[1]}.`);
  }

  // Pips (nonland cards, commanders included — you cast them repeatedly).
  const pipTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const d of [...spells, ...commanders.map((card) => ({ card, quantity: 1 }))]) {
    const cost =
      d.card.manaCost ?? d.card.faces?.map((f) => f.manaCost).filter(Boolean).join('') ?? '';
    const pips = countPips(cost);
    for (const c of COLORS) pipTotals[c] += pips[c] * d.quantity;
  }

  // Sources: any card (land or spell) that can produce colored mana. Cards
  // like Arcane Signet list all five colors in Scryfall's produced_mana, so
  // clamp to the commander's identity — outside it they can't actually produce.
  const identity = new Set<Color>(commanders.flatMap((c) => c.colorIdentity));
  const sourceTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let manaSourceCount = 0;
  for (const d of nonCommander) {
    const produced = new Set<Color>(
      [
        ...(d.card.producedMana ?? []),
        ...(d.card.faces ?? []).flatMap((f) => f.producedMana ?? []),
      ].filter((c) => identity.size === 0 || identity.has(c)),
    );
    const isSource = isFrontLand(d.card) || hasLandFace(d.card) || isRamp(d.card);
    if (!isSource) continue;
    manaSourceCount += d.quantity;
    for (const c of COLORS) if (produced.has(c)) sourceTotals[c] += d.quantity;
  }

  const pipSum = COLORS.reduce((n, c) => n + pipTotals[c], 0) || 1;
  const sourceSum = COLORS.reduce((n, c) => n + sourceTotals[c], 0) || 1;
  const colorBalance: ColorBalanceRow[] = COLORS.filter(
    (c) => pipTotals[c] > 0 || sourceTotals[c] > 0,
  ).map((c) => {
    const pipPct = (100 * pipTotals[c]) / pipSum;
    const sourcePct = (100 * sourceTotals[c]) / sourceSum;
    return {
      color: c,
      pips: Math.round(pipTotals[c] * 10) / 10,
      pipPct: Math.round(pipPct * 10) / 10,
      sources: sourceTotals[c],
      sourcePct: Math.round(sourcePct * 10) / 10,
      deltaPct: Math.round((sourcePct - pipPct) * 10) / 10,
    };
  });

  for (const row of colorBalance) {
    if (row.deltaPct < -8 && row.pips > 0) {
      notes.push(
        `${row.color} is under-supported: ${row.pipPct}% of pips but only ${row.sourcePct}% of mana sources.`,
      );
    }
  }

  return {
    curve,
    avgManaValue: Math.round(avgManaValue * 100) / 100,
    landCount,
    recommendedLandRange: landRange,
    manaSourceCount,
    ramp: {
      count: rampCount,
      recommendedRange: rampRange,
      avgManaValue: rampCount > 0 ? Math.round((rampMvSum / rampCount) * 100) / 100 : 0,
      cards: rampCards.map((d) => d.card.name),
    },
    colorBalance,
    notes,
  };
}
