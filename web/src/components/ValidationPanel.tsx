import type { DeckAnalysis, IssueSeverity } from '@mtg/shared';

const ICONS: Record<IssueSeverity, string> = { error: '✕', warning: '⚠', info: 'ℹ' };

export default function ValidationPanel({ analysis }: { analysis: DeckAnalysis }) {
  const { validation, parseIssues, deckPriceUsd } = analysis;
  const issues = [...validation.issues].sort(
    (a, b) => ['error', 'warning', 'info'].indexOf(a.severity) - ['error', 'warning', 'info'].indexOf(b.severity),
  );

  return (
    <section className="panel">
      <h2>
        Validation{' '}
        <span className={validation.valid ? 'badge ok' : 'badge bad'}>
          {validation.valid ? 'Legal deck' : 'Issues found'}
        </span>
      </h2>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{validation.cardCount}</span>
          <span className="stat-label">cards (incl. commander)</span>
        </div>
        <div className="stat">
          <span className="stat-value">{validation.colorIdentity.join('') || 'C'}</span>
          <span className="stat-label">color identity</span>
        </div>
        <div className="stat">
          <span className="stat-value">${deckPriceUsd.toLocaleString()}</span>
          <span className="stat-label">deck value (Scryfall USD)</span>
        </div>
      </div>
      {issues.length === 0 && parseIssues.length === 0 ? (
        <p className="muted">No problems found: 100 cards, singleton, and color identity all check out.</p>
      ) : (
        <ul className="issue-list">
          {parseIssues.map((p, i) => (
            <li key={`p${i}`} className="issue warning">
              <span>{ICONS.warning}</span> Line {p.line}: {p.message} — “{p.text.trim()}”
            </li>
          ))}
          {issues.map((issue, i) => (
            <li key={i} className={`issue ${issue.severity}`}>
              <span>{ICONS[issue.severity]}</span> {issue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
