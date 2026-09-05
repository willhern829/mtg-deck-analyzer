# MTG Commander Deck Analyzer

A full-stack TypeScript web app that analyzes Commander (EDH) decklists: format validation, mana-base math, Monte Carlo opening-hand simulation, combo detection, and EDHREC-backed upgrade suggestions with pricing.

![Stack](https://img.shields.io/badge/stack-TypeScript%20%C2%B7%20React%20%C2%B7%20Express-blue)

## Features

- **Decklist import** — paste plain text (`1 Sol Ring` / `1x Sol Ring`), Moxfield/MTGA exports (section headers, `(SET) 263` printings, `*F*` foil markers), Archidekt exports (`[Category{top}]` tags), TappedOut (`*CMDR*`), and deckstats (`#!Commander`) formats. Manual entry with Scryfall-powered autocomplete.
- **Validation** — exactly 100 cards, singleton rule (basics and "any number" cards exempt), commander color identity, Commander legality, partner/Background/Friends Forever pairing rules. Misspelled names get "did you mean…" suggestions via Scryfall fuzzy match.
- **Commander research** — EDHREC deck counts, common strategies/themes, average deck composition, and top synergy cards with synergy scores.
- **Opening-hand analysis** — 20,000-hand Monte Carlo simulation: land distribution, keepable-hand rate against explicit keep criteria, probability of seeing ramp/draw/removal/key-synergy pieces in the opener, example keep and mulligan hands, and generated mulligan guidance.
- **Mana analysis** — curve, average mana value, land count vs. Frank Karsten's Commander benchmark, ramp package (count + average MV), and color pip distribution vs. mana-source distribution with under-supported color warnings.
- **Combos & power level** — combos already in the deck, "one card away" combo suggestions, and a power-level estimate via Commander Spellbook's open API.
- **Upgrade suggestions** — flags low-synergy cards (absent from the commander's EDHREC meta and unpopular globally) and pairs each with a high-synergy replacement filling the same functional slot (ramp→ramp, removal→removal, creature→creature) where possible. Each swap explains its evidence in plain English — how many of the commander's decks play the card and how far that is above its play rate in comparable decks — with the Scryfall/TCGplayer USD price and a running total for the full package.

## Quick start

```bash
npm install
npm run dev        # server on :3001, web on :5173 (proxied)
```

Open http://localhost:5173, click **Load sample deck**, then **Analyze deck**.

Production build (single origin — Express serves the built frontend):

```bash
npm run build
npm start          # http://localhost:3001
```

Run tests (decklist parser, validator, mana math, simulation — no network needed):

```bash
npm test
```

Requires Node ≥ 20. No API keys or environment variables needed.

## Architecture

npm workspaces monorepo:

```
shared/   @mtg/shared — domain types + decklist parser (pure, unit-tested, used by both sides)
server/   @mtg/server — Express API + analysis engine
  src/clients/    scryfall.ts   batched card resolution, autocomplete, fuzzy suggestions
                  edhrec.ts     commander page JSON (unofficial), defensive parsing
                  spellbook.ts  find-my-combos + estimate-bracket (official open API)
  src/analysis/   validate.ts, mana.ts, simulate.ts, upgrades.ts, analyze.ts (orchestrator)
  src/lib/        http.ts (per-host rate limiting + retry), cache.ts (TTL LRU)
web/      @mtg/web — React + Vite UI, dependency-free SVG charts
```

Data flow: decklist text → parser → Scryfall `POST /cards/collection` (75-name batches) → validator → mana/simulation (pure computation) → EDHREC + Commander Spellbook (concurrent, each degrades gracefully) → upgrade engine → single `DeckAnalysis` JSON payload.

### Data sources and rate limits

| Source | Used for | Access | Politeness |
|---|---|---|---|
| [Scryfall API](https://scryfall.com/docs/api) | Card data, prices, autocomplete, fuzzy match | Official, no key | ≥120 ms between requests, `User-Agent` + `Accept` headers (required since 2024), 24 h card cache |
| [EDHREC](https://edhrec.com) `json.edhrec.com` | Themes, synergy scores, avg composition | **Unofficial** (the JSON behind their frontend) | ≥500 ms between requests, 12 h cache, degrades to Scryfall-only mode on failure |
| [Commander Spellbook](https://backend.commanderspellbook.com/schema/redoc/) | Combos, power-level estimate | Official, documented, no key | ≥300 ms between requests, 1 h cache |

Prices come from Scryfall's `prices.usd` (sourced from TCGplayer). The TCGplayer API itself stopped accepting new developer applications, so Scryfall is the practical free source.

## Stated assumptions & edge-case handling

- **Web app, TypeScript end-to-end, local-first.** One language across the stack with shared types; deployable anywhere Node runs (Dockerfile-free by design — `npm run build && npm start`).
- **Commander detection**: explicit markers win (`*CMDR*`, `Commander` section, `[Commander]` category). If nothing is marked, the first card in the list that can legally be a commander is inferred and flagged with an info-level notice.
- **Partner commanders**: two commanders are accepted when they share a legal pairing mechanic (Partner, matching "Partner with", Friends Forever, Choose a Background + Background, Doctor's Companion + Time Lord Doctor). Color identity is the union. EDHREC partner pages are looked up by combined slug, falling back to the primary commander's page.
- **MDFCs / split / adventure cards**: resolved by front-face name (Scryfall's collection endpoint doesn't accept full `A // B` names), mana value from Scryfall's top-level `cmc`, oracle text and produced mana merged across faces. Spell//land MDFCs count as spells in the curve but as mana sources, with a note quantifying the "half a land" effect.
- **Colorless producers**: Sol Ring et al. produce `{C}`, which isn't in Scryfall's `produced_mana` color set — ramp detection reads the oracle text (`{T}: Add …`) instead of relying on that field.
- **"Any color" producers**: Arcane Signet lists all five colors in Scryfall data; mana sources are clamped to the commander's color identity before the pip-vs-source comparison.
- **Invalid decklists**: unparseable lines, wrong card counts, singleton violations, off-color and banned cards are all reported as structured issues with severities — analysis still runs on whatever resolved so you always get feedback.
- **Missing cards**: unresolved names get fuzzy "did you mean" suggestions and an error issue; they're excluded from the math rather than aborting.
- **API failures**: every external call has retry with exponential backoff (429/5xx), timeouts, per-host request spacing, and an in-memory TTL cache. EDHREC being down degrades research/upgrades to a labeled fallback mode; Spellbook being down hides the combos panel; Scryfall being down fails the analysis with a clear 502 message.
- **Keep criteria** (documented in the UI): 2–5 lands with early action — on 3+ lands at least one on-curve play; on exactly 2 lands, cheap ramp or a very low-curve hand. Heuristic by design; deck-specific nuances (e.g., all-in combo hands) aren't modeled.
- **Land benchmark**: Frank Karsten's Commander formula (`31.42 + 3.13 × avgMV − 0.28 × ramp`), clamped to 30–42, shown as a ±1 range.

## Prior-art research (what existing tools do, and what was borrowed)

Research was done against live APIs in July 2026:

- **Moxfield** — best-in-class import/export and a hypergeometric probability tab. No official API; its internal `api2.moxfield.com` sits behind Cloudflare (they whitelist User-Agents by email request). *Decision: don't build on it — accept its export formats instead.* Its probability tab inspired the key-group odds table.
- **Archidekt** — tolerated-but-undocumented API; category-based deck organization and a pips-vs-sources mana view. *Borrowed: the `[Category]` export syntax support and the pip/source comparison table.*
- **EDHREC** — the de-facto synergy dataset. No official API; `json.edhrec.com/pages/...` powers their frontend and is widely used by community tools (pyedhrec etc.). Synergy = inclusion % for this commander minus inclusion % across that color identity. *Used (cached, rate-limited, clearly labeled unofficial, with fallback).*
- **Commander Spellbook** — fully open Django REST API with OpenAPI schema, including `find-my-combos` (with an `almostIncluded` "one card away" group) and `estimate-bracket`. *Adopted wholesale — highest wow-per-effort feature found in the research.*
- **deckstats / MTGGoldfish** — classic hand simulator and turn-by-turn draw probability tables; price history. *Inspired the Monte Carlo panel; price history noted as future work (MTGJSON `AllPrices` keeps 90 days).*

Worthwhile future additions surfaced by the research, in rough value order: turn-by-turn hypergeometric draw tables, a salt score meter (`json.edhrec.com/pages/top/salt.json`), auto-categorization via Scryfall's `oracle_tags` bulk file (`otag:ramp` etc.), cheapest-printing price optimization via the `default_cards` bulk file, and an interactive goldfish playtester.

## Known limitations

- **EDHREC endpoints are unofficial** and can change or be blocked without notice; the app degrades but loses synergy/upgrade features when that happens.
- **Upgrade cuts are heuristics.** A card missing from the EDHREC meta may be a deliberate theme/pet choice; the UI says so explicitly. Slot pairing uses coarse functional roles (ramp/removal/draw/type), so a swap can occasionally cross roles when no same-slot candidate remains.
- **In-memory cache only** — restarts refetch; a multi-instance deployment would want Redis or the Scryfall bulk files instead of live lookups.
- **Prices are the default printing's `usd`** (falling back to foil/etched); cheapest-printing hunting across all versions isn't implemented.
- **Singleton "any number" and ramp/draw/removal detection are oracle-text heuristics** — English-language card names only, and edge cases (e.g., unusual ramp like Burgeoning) can be missed.
- The hand simulator models card *categories*, not sequenced gameplay — it won't detect "this hand is a turn-3 win."

## Legal

Unaffiliated with Wizards of the Coast. Card data © Scryfall; Magic: The Gathering © Wizards of the Coast. EDHREC and Commander Spellbook data belong to their respective owners.
