import type { DeckEntry, DeckSection, ParsedDeck, ParseIssue } from './types.js';

const SECTION_HEADERS: Record<string, DeckSection> = {
  commander: 'commander',
  commanders: 'commander',
  deck: 'mainboard',
  main: 'mainboard',
  mainboard: 'mainboard',
  maindeck: 'mainboard',
  creatures: 'mainboard',
  side: 'sideboard',
  sideboard: 'sideboard',
  maybe: 'maybeboard',
  maybeboard: 'maybeboard',
  considering: 'maybeboard',
  token: 'maybeboard',
  tokens: 'maybeboard',
  companion: 'companion',
};

// "1 Sol Ring", "1x Sol Ring", "12x Relentless Rats" — quantity is optional.
const LINE_RE = /^(?:(\d+)\s*[xX]?\s+)?(.+)$/;

// Trailing "(C21) 263" / "(c21)" set + optional collector number (Moxfield/Archidekt).
const SET_RE = /\s*\(([A-Za-z0-9]{2,6})\)(?:\s+([\w★†-]+))?\s*$/;

/**
 * Parse a decklist in the common text formats: plain ("1 Card" / "1x Card"),
 * Moxfield/MTGA (section headers, "(SET) 123" printings, *F* foil markers),
 * Archidekt ("[Category{flags}]" tags), TappedOut (*CMDR*), and deckstats
 * ("#!Commander", "# comment"). Unparseable lines become issues, not failures.
 */
export function parseDecklist(text: string): ParsedDeck {
  const entries: DeckEntry[] = [];
  const issues: ParseIssue[] = [];
  let section: DeckSection = 'mainboard';

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = (lines[i] ?? '').trim();
    if (!line || line.startsWith('//')) continue;
    // MTGA export metadata lines.
    if (/^(about|name)\s/i.test(line) && !/^\d/.test(line)) continue;

    const header = SECTION_HEADERS[line.replace(/:$/, '').trim().toLowerCase()];
    if (header) {
      section = header;
      continue;
    }
    if (line.startsWith('#') && !line.startsWith('#!')) continue;

    let isCommander = section === 'commander';
    let lineSection: DeckSection | undefined;

    // deckstats: "1 Krenko, Mob Boss #!Commander"
    if (/#!commander/i.test(line)) {
      isCommander = true;
      line = line.replace(/#!commander/gi, '').trim();
    }
    line = line.replace(/\s+#(?!!).*$/, ''); // deckstats trailing comment
    if (/\*CMDR\*/i.test(line)) {
      isCommander = true;
      line = line.replace(/\*CMDR\*/gi, '').trim();
    }
    // Archidekt category tags: "[Ramp]", "[Commander{top}]", "[Land,Utility]"
    const catMatch = line.match(/\[([^\]]*)\]\s*$/);
    if (catMatch) {
      const category = catMatch[1] ?? '';
      if (/commander/i.test(category)) isCommander = true;
      else if (/maybeboard/i.test(category)) lineSection = 'maybeboard';
      else if (/sideboard/i.test(category)) lineSection = 'sideboard';
      line = line.slice(0, catMatch.index).trim();
    }
    line = line.replace(/\*[FE]\*/gi, '').replace(/\^[^^]*\^/g, '').trim(); // foil/etched + Archidekt tags

    const m = line.match(LINE_RE);
    if (!m || !m[2]) {
      issues.push({ line: lineNo, text: lines[i] ?? '', message: 'Could not parse line' });
      continue;
    }
    const quantity = m[1] ? parseInt(m[1], 10) : 1;
    let name = m[2].trim();

    let setCode: string | undefined;
    let collectorNumber: string | undefined;
    const setMatch = name.match(SET_RE);
    if (setMatch) {
      setCode = setMatch[1]?.toLowerCase();
      collectorNumber = setMatch[2];
      name = name.slice(0, setMatch.index).trim();
    }

    if (!name) {
      issues.push({ line: lineNo, text: lines[i] ?? '', message: 'Missing card name' });
      continue;
    }
    if (quantity < 1 || quantity > 200) {
      issues.push({ line: lineNo, text: lines[i] ?? '', message: `Implausible quantity ${quantity}` });
      continue;
    }

    entries.push({
      quantity,
      name,
      setCode,
      collectorNumber,
      section: isCommander ? 'commander' : lineSection ?? section,
      isCommander,
      line: lineNo,
    });
  }

  return { entries: mergeDuplicates(entries), issues };
}

/** Merge repeated lines of the same card within the same section. */
function mergeDuplicates(entries: DeckEntry[]): DeckEntry[] {
  const seen = new Map<string, DeckEntry>();
  for (const e of entries) {
    const key = `${e.section}::${normalizeCardName(e.name)}`;
    const existing = seen.get(key);
    if (existing) existing.quantity += e.quantity;
    else seen.set(key, { ...e });
  }
  return [...seen.values()];
}

/** Case/diacritic-insensitive key for card-name comparison. */
export function normalizeCardName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
