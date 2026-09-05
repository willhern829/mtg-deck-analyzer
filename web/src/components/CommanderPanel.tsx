import type { DeckAnalysis } from '@mtg/shared';

export default function CommanderPanel({ analysis }: { analysis: DeckAnalysis }) {
  const { commanders, research } = analysis;
  if (commanders.length === 0) return null;

  return (
    <section className="panel">
      <h2>
        Commander research{' '}
        {research?.source === 'scryfall-fallback' && (
          <span className="badge warn">degraded — EDHREC unavailable</span>
        )}
      </h2>
      <div className="commander-row">
        {commanders.map((c) => (
          <div key={c.scryfallId} className="commander-card">
            {c.imageNormal && <img src={c.imageNormal} alt={c.name} loading="lazy" />}
            <div>
              <h3>{c.name}</h3>
              <p className="muted">{c.typeLine}</p>
              <p className="oracle">{c.oracleText}</p>
            </div>
          </div>
        ))}
      </div>

      {research && (
        <>
          {research.deckCount !== undefined && (
            <p className="muted">
              {research.deckCount.toLocaleString()} decks on EDHREC for {research.commanderName}.
            </p>
          )}
          {research.themes.length > 0 && (
            <div className="tag-row">
              <strong>Common strategies:</strong>
              {research.themes.map((t) =>
                t.url ? (
                  <a key={t.name} className="tag" href={t.url} target="_blank" rel="noreferrer">
                    {t.name}
                  </a>
                ) : (
                  <span key={t.name} className="tag">
                    {t.name}
                  </span>
                ),
              )}
            </div>
          )}
          {research.avgComposition && (
            <p className="muted">
              Average deck composition:{' '}
              {Object.entries(research.avgComposition)
                .map(([type, count]) => `${count} ${type}s`)
                .join(' · ')}
            </p>
          )}
          {research.topSynergyCards.length > 0 && (
            <>
              <h3>Top synergy cards</h3>
              <div className="tag-row">
                {research.topSynergyCards.slice(0, 15).map((s) => (
                  <span key={s.name} className="tag synergy" title={
                    s.synergy !== undefined ? `+${Math.round(s.synergy * 100)}% synergy` : undefined
                  }>
                    {s.name}
                    {s.synergy !== undefined && <em> +{Math.round(s.synergy * 100)}%</em>}
                  </span>
                ))}
              </div>
            </>
          )}
          {research.notes.map((note, i) => (
            <p key={i} className="footnote">
              {note}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
