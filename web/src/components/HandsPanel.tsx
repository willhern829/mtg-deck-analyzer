import type { HandSimulation } from '@mtg/shared';
import BarChart from './BarChart';

export default function HandsPanel({ hands }: { hands: HandSimulation }) {
  if (hands.iterations === 0) return null;

  return (
    <section className="panel">
      <h2>Opening hands ({hands.iterations.toLocaleString()} simulated)</h2>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{Math.round(hands.keepableRate * 100)}%</span>
          <span className="stat-label">keepable hands</span>
        </div>
        <div className="stat">
          <span className="stat-value">{hands.avgLandsInHand}</span>
          <span className="stat-label">avg lands in opener</span>
        </div>
      </div>
      <p className="footnote">Keep criteria: {hands.keepCriteria}</p>

      <h3>Lands in opening hand</h3>
      <BarChart
        bars={hands.landDistribution.map((p, lands) => ({
          label: String(lands),
          value: p,
          display: `${Math.round(p * 1000) / 10}%`,
        }))}
        color="var(--accent-2)"
      />

      {hands.keyGroups.length > 0 && (
        <>
          <h3>What to look for</h3>
          <table>
            <thead>
              <tr>
                <th>Card group</th>
                <th>≥1 in opener</th>
                <th>Cards</th>
              </tr>
            </thead>
            <tbody>
              {hands.keyGroups.map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td>{g.pctInOpener}%</td>
                  <td className="muted small">
                    {g.cards.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Mulligan guidance</h3>
      <ul className="guidance">
        {hands.mulliganGuidance.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ul>

      <div className="hand-examples">
        <div>
          <h4>Example keep</h4>
          <ol>
            {hands.exampleKeepableHand.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
        <div>
          <h4>Example mulligan</h4>
          <ol>
            {hands.exampleMulligan.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
