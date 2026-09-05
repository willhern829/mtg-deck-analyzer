import type { DeckAnalysis } from '@mtg/shared';
import { useState } from 'react';
import { analyzeDeck } from './api';
import CombosPanel from './components/CombosPanel';
import CommanderPanel from './components/CommanderPanel';
import DeckInput from './components/DeckInput';
import HandsPanel from './components/HandsPanel';
import ManaPanel from './components/ManaPanel';
import UpgradesPanel from './components/UpgradesPanel';
import ValidationPanel from './components/ValidationPanel';

export default function App() {
  const [analysis, setAnalysis] = useState<DeckAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAnalyze(decklist: string) {
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await analyzeDeck(decklist));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Commander Deck Analyzer</h1>
        <p className="tagline">
          Paste a decklist, get validation, mana math, opening-hand odds, combos, and
          EDHREC-backed upgrade suggestions.
        </p>
      </header>

      <DeckInput onAnalyze={onAnalyze} loading={loading} />

      {error && <div className="panel error-banner">⚠ {error}</div>}

      {analysis && (
        <div className="results">
          <ValidationPanel analysis={analysis} />
          <CommanderPanel analysis={analysis} />
          <ManaPanel mana={analysis.mana} />
          <HandsPanel hands={analysis.hands} />
          <CombosPanel combos={analysis.combos} />
          <UpgradesPanel upgrades={analysis.upgrades} />
        </div>
      )}

      <footer>
        Card data © Scryfall · synergy data via EDHREC (unofficial) · combos via Commander
        Spellbook. Unaffiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}
