/** WUBRG color letters as used by Scryfall. */
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

// ---------------------------------------------------------------------------
// Decklist parsing
// ---------------------------------------------------------------------------

export type DeckSection = 'commander' | 'mainboard' | 'sideboard' | 'maybeboard' | 'companion';

export interface DeckEntry {
  quantity: number;
  name: string;
  /** Set code from "(C21)"-style annotations, if present. */
  setCode?: string;
  collectorNumber?: string;
  section: DeckSection;
  /** True when explicitly marked (*CMDR*, [Commander] category, or Commander section). */
  isCommander: boolean;
  /** 1-based source line, for error reporting. */
  line: number;
}

export interface ParseIssue {
  line: number;
  text: string;
  message: string;
}

export interface ParsedDeck {
  entries: DeckEntry[];
  issues: ParseIssue[];
}

// ---------------------------------------------------------------------------
// Resolved card data (subset of Scryfall's card object)
// ---------------------------------------------------------------------------

export interface CardFace {
  name: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
  producedMana?: Color[];
  imageNormal?: string;
}

export interface ResolvedCard {
  scryfallId: string;
  oracleId: string;
  name: string;
  manaCost?: string;
  manaValue: number;
  typeLine: string;
  oracleText?: string;
  colors: Color[];
  colorIdentity: Color[];
  /** Scryfall layout, e.g. "normal", "modal_dfc", "transform", "adventure". */
  layout: string;
  faces?: CardFace[];
  keywords: string[];
  producedMana?: Color[];
  legalInCommander: boolean;
  /** Lower rank = more played on EDHREC. */
  edhrecRank?: number;
  priceUsd?: number;
  imageNormal?: string;
  imageArtCrop?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  code:
    | 'card_count'
    | 'singleton'
    | 'color_identity'
    | 'not_legal'
    | 'no_commander'
    | 'invalid_commander'
    | 'unresolved_card'
    | 'sideboard_ignored'
    | 'commander_inferred';
  message: string;
  cardName?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  cardCount: number;
  commanderNames: string[];
  colorIdentity: Color[];
}

// ---------------------------------------------------------------------------
// Mana analysis
// ---------------------------------------------------------------------------

export interface CurveBucket {
  /** Mana value; 7 means "7+". */
  manaValue: number;
  count: number;
}

export interface ColorBalanceRow {
  color: Color;
  pips: number;
  pipPct: number;
  sources: number;
  sourcePct: number;
  /** sourcePct - pipPct; negative means the color is under-supported. */
  deltaPct: number;
}

export interface ManaAnalysis {
  curve: CurveBucket[];
  avgManaValue: number;
  landCount: number;
  recommendedLandRange: [number, number];
  manaSourceCount: number;
  ramp: {
    count: number;
    recommendedRange: [number, number];
    avgManaValue: number;
    cards: string[];
  };
  colorBalance: ColorBalanceRow[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Opening-hand simulation
// ---------------------------------------------------------------------------

export interface HandSimulation {
  iterations: number;
  /** landsInHand -> fraction of hands (index 0..7). */
  landDistribution: number[];
  avgLandsInHand: number;
  /** Fraction of 7-card hands meeting the keep criteria. */
  keepableRate: number;
  keepCriteria: string;
  /** Probability of at least one card from each key group in the opener. */
  keyGroups: { label: string; cards: string[]; pctInOpener: number }[];
  exampleKeepableHand: string[];
  exampleMulligan: string[];
  mulliganGuidance: string[];
}

// ---------------------------------------------------------------------------
// Commander research (EDHREC-backed with Scryfall fallback)
// ---------------------------------------------------------------------------

export interface SynergyCard {
  name: string;
  /** EDHREC synergy score (-1..1) when available. */
  synergy?: number;
  /** Fraction of eligible decks running the card. */
  inclusionRate?: number;
  priceUsd?: number;
}

export interface CommanderResearch {
  source: 'edhrec' | 'scryfall-fallback';
  commanderName: string;
  deckCount?: number;
  themes: { name: string; url?: string }[];
  /** EDHREC average deck composition by card type. */
  avgComposition?: Record<string, number>;
  topSynergyCards: SynergyCard[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Combo detection (Commander Spellbook)
// ---------------------------------------------------------------------------

export interface ComboInfo {
  id: string;
  cards: string[];
  produces: string[];
  description?: string;
  /** For almost-included combos: the cards the deck is missing. */
  missing?: string[];
}

export interface ComboReport {
  included: ComboInfo[];
  almostIncluded: ComboInfo[];
  /** WotC Commander Bracket estimate from Commander Spellbook (tag + display label). */
  bracket?: { tag: string; label: string };
}

// ---------------------------------------------------------------------------
// Upgrade suggestions
// ---------------------------------------------------------------------------

export interface UpgradeSuggestion {
  cut: string;
  cutReason: string;
  add: string;
  addReason: string;
  /** Functional slot the swap fills, e.g. "ramp", "removal", "creature". */
  slot: string;
  priceUsd: number | null;
  /** Cumulative cost including this suggestion. */
  runningTotalUsd: number;
}

export interface UpgradePlan {
  suggestions: UpgradeSuggestion[];
  totalUsd: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Full analysis payload returned by POST /api/analyze
// ---------------------------------------------------------------------------

export interface DeckCardView {
  name: string;
  quantity: number;
  manaValue: number;
  typeLine: string;
  colorIdentity: Color[];
  priceUsd?: number;
  imageNormal?: string;
}

export interface DeckAnalysis {
  commanders: ResolvedCard[];
  validation: ValidationResult;
  parseIssues: ParseIssue[];
  unresolved: { name: string; suggestion?: string }[];
  cards: DeckCardView[];
  mana: ManaAnalysis;
  hands: HandSimulation;
  research: CommanderResearch | null;
  combos: ComboReport | null;
  upgrades: UpgradePlan | null;
  deckPriceUsd: number;
}
