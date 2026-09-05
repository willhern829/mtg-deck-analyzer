import type {
  Color,
  DeckEntry,
  ResolvedCard,
  ValidationIssue,
  ValidationResult,
} from '@mtg/shared';
import { normalizeCardName } from '@mtg/shared';
import { canBeCommander, isSingletonExempt, isValidCommanderPair } from './cardUtils.js';

export interface ValidationInput {
  entries: DeckEntry[];
  resolved: Map<string, ResolvedCard>;
  unresolved: { name: string; suggestion?: string }[];
}

/**
 * Commander deck rules: exactly 100 cards including commander(s), singleton
 * (basics and self-exempting cards aside), every card within the commander's
 * color identity, and everything legal in the format.
 */
export function validateDeck(input: ValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { entries, resolved, unresolved } = input;

  const playable = entries.filter(
    (e) => e.section === 'mainboard' || e.section === 'commander',
  );
  const ignored = entries.filter((e) => e.section !== 'mainboard' && e.section !== 'commander');
  if (ignored.length > 0) {
    issues.push({
      severity: 'info',
      code: 'sideboard_ignored',
      message: `${ignored.length} sideboard/maybeboard entr${ignored.length === 1 ? 'y' : 'ies'} excluded from analysis.`,
    });
  }

  for (const u of unresolved) {
    issues.push({
      severity: 'error',
      code: 'unresolved_card',
      cardName: u.name,
      message: u.suggestion
        ? `"${u.name}" not found on Scryfall — did you mean "${u.suggestion}"?`
        : `"${u.name}" not found on Scryfall.`,
    });
  }

  const cardOf = (e: DeckEntry) => resolved.get(normalizeCardName(e.name));

  // --- Commander identification -------------------------------------------
  let commanderEntries = playable.filter((e) => e.isCommander);
  if (commanderEntries.length === 0) {
    // Unmarked list: infer. Pasted lists usually put the commander first, so
    // prefer the first entry that is a legal commander.
    const candidate = playable.find((e) => {
      const c = cardOf(e);
      return c && canBeCommander(c);
    });
    if (candidate) {
      commanderEntries = [candidate];
      issues.push({
        severity: 'info',
        code: 'commander_inferred',
        cardName: candidate.name,
        message: `No commander was marked; assuming "${candidate.name}" (first legal commander in the list). Mark yours with *CMDR* or a "Commander" section if this is wrong.`,
      });
    } else {
      issues.push({
        severity: 'error',
        code: 'no_commander',
        message: 'No commander found. Mark it with *CMDR* or a "Commander" section header.',
      });
    }
  }

  const commanders = commanderEntries
    .map(cardOf)
    .filter((c): c is ResolvedCard => !!c);

  for (const c of commanders) {
    if (!canBeCommander(c)) {
      issues.push({
        severity: 'error',
        code: 'invalid_commander',
        cardName: c.name,
        message: `"${c.name}" cannot be your commander (not a legendary creature and no "can be your commander" text).`,
      });
    }
  }
  if (commanders.length === 2 && !isValidCommanderPair(commanders[0]!, commanders[1]!)) {
    issues.push({
      severity: 'error',
      code: 'invalid_commander',
      message: `"${commanders[0]!.name}" and "${commanders[1]!.name}" are not a legal pairing (Partner, Partner With, Friends Forever, Background, or Doctor's Companion required).`,
    });
  }
  if (commanders.length > 2) {
    issues.push({
      severity: 'error',
      code: 'invalid_commander',
      message: `${commanders.length} commanders marked — a deck can have at most two.`,
    });
  }

  // --- Card count -----------------------------------------------------------
  const cardCount = playable.reduce((n, e) => n + e.quantity, 0);
  if (cardCount !== 100) {
    issues.push({
      severity: 'error',
      code: 'card_count',
      message: `Deck has ${cardCount} cards (including commander); Commander requires exactly 100.`,
    });
  }

  // --- Singleton -------------------------------------------------------------
  for (const e of playable) {
    if (e.quantity === 1) continue;
    const card = cardOf(e);
    if (card && isSingletonExempt(card)) continue;
    if (!card) continue; // already reported as unresolved
    issues.push({
      severity: 'error',
      code: 'singleton',
      cardName: e.name,
      message: `${e.quantity}x "${e.name}" violates the singleton rule.`,
    });
  }

  // --- Color identity ----------------------------------------------------------
  const identity = new Set<Color>(commanders.flatMap((c) => c.colorIdentity));
  for (const e of playable) {
    const card = cardOf(e);
    if (!card || commanderEntries.includes(e)) continue;
    const off = card.colorIdentity.filter((c) => !identity.has(c));
    if (off.length > 0 && commanders.length > 0) {
      issues.push({
        severity: 'error',
        code: 'color_identity',
        cardName: card.name,
        message: `"${card.name}" (${card.colorIdentity.join('')}) is outside the commander's color identity (${[...identity].join('') || 'colorless'}).`,
      });
    }
  }

  // --- Format legality -----------------------------------------------------------
  for (const e of playable) {
    const card = cardOf(e);
    if (card && !card.legalInCommander) {
      issues.push({
        severity: 'error',
        code: 'not_legal',
        cardName: card.name,
        message: `"${card.name}" is not legal in Commander (banned or not yet legal).`,
      });
    }
  }

  const order: Color[] = ['W', 'U', 'B', 'R', 'G'];
  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
    cardCount,
    commanderNames: commanders.map((c) => c.name),
    colorIdentity: order.filter((c) => identity.has(c)),
  };
}
