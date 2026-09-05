import { useEffect, useRef, useState } from 'react';
import { autocomplete } from '../api';
import { SAMPLE_DECK } from '../sampleDeck';

interface Props {
  onAnalyze: (decklist: string) => void;
  loading: boolean;
}

export default function DeckInput({ onAnalyze, loading }: Props) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Debounced Scryfall autocomplete for manual card entry.
  useEffect(() => {
    clearTimeout(debounce.current);
    if (search.length < 2) {
      setSuggestions([]);
      return;
    }
    debounce.current = setTimeout(() => {
      autocomplete(search)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [search]);

  function addCard(name: string) {
    setText((t) => (t.endsWith('\n') || t === '' ? t : t + '\n') + `1 ${name}\n`);
    setSearch('');
    setSuggestions([]);
  }

  const lineCount = text.split('\n').filter((l) => l.trim()).length;

  return (
    <section className="panel deck-input">
      <div className="input-header">
        <h2>Decklist</h2>
        <button className="link-btn" type="button" onClick={() => setText(SAMPLE_DECK)}>
          Load sample deck (Krenko goblins)
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={
          'Paste a decklist — plain, Moxfield, Archidekt, or MTGA formats:\n\n1 Krenko, Mob Boss *CMDR*\n1 Sol Ring (C21) 263\n1x Skirk Prospector [Sacrifice]\n35 Mountain'
        }
        rows={12}
      />
      <div className="input-row">
        <div className="autocomplete">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Add a card by name…"
            aria-label="Card search"
          />
          {suggestions.length > 0 && (
            <ul className="suggestions" role="listbox">
              {suggestions.slice(0, 8).map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => addCard(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="line-count">{lineCount} lines</span>
        <button
          className="primary"
          type="button"
          disabled={loading || text.trim().length === 0}
          onClick={() => onAnalyze(text)}
        >
          {loading ? 'Analyzing…' : 'Analyze deck'}
        </button>
      </div>
    </section>
  );
}
