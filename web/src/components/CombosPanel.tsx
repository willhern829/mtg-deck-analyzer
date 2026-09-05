import type { ComboReport } from '@mtg/shared';

export default function CombosPanel({ combos }: { combos: ComboReport | null }) {
  if (!combos) return null;
  const { included, almostIncluded, bracket } = combos;
  if (included.length === 0 && almostIncluded.length === 0 && !bracket) return null;

  return (
    <section className="panel">
      <h2>
        Combos & power level{' '}
        {bracket && <span className="badge">Power level: {bracket.label}</span>}
      </h2>

      {included.length > 0 && (
        <>
          <h3>Combos in your deck ({included.length})</h3>
          <ul className="combo-list">
            {included.map((c) => (
              <li key={c.id}>
                <strong>{c.cards.join(' + ')}</strong>
                {c.produces.length > 0 && <span className="muted"> → {c.produces.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {almostIncluded.length > 0 && (
        <>
          <h3>One card away</h3>
          <ul className="combo-list">
            {almostIncluded.slice(0, 10).map((c) => (
              <li key={c.id}>
                Add <strong>{(c.missing ?? []).join(', ') || '?'}</strong> to complete{' '}
                {c.cards.join(' + ')}
                {c.produces.length > 0 && <span className="muted"> → {c.produces.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="footnote">Combo data from Commander Spellbook.</p>
    </section>
  );
}
