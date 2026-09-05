import type { ManaAnalysis } from '@mtg/shared';
import BarChart from './BarChart';

const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

export default function ManaPanel({ mana }: { mana: ManaAnalysis }) {
  return (
    <section className="panel">
      <h2>Mana analysis</h2>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{mana.avgManaValue}</span>
          <span className="stat-label">avg mana value</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {mana.landCount}
            <small>
              {' '}
              / {mana.recommendedLandRange[0]}–{mana.recommendedLandRange[1]} rec.
            </small>
          </span>
          <span className="stat-label">lands</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {mana.ramp.count}
            <small>
              {' '}
              / {mana.ramp.recommendedRange[0]}–{mana.ramp.recommendedRange[1]} rec.
            </small>
          </span>
          <span className="stat-label">ramp (avg MV {mana.ramp.avgManaValue})</span>
        </div>
        <div className="stat">
          <span className="stat-value">{mana.manaSourceCount}</span>
          <span className="stat-label">total mana sources</span>
        </div>
      </div>

      <h3>Mana curve (nonland)</h3>
      <BarChart
        bars={mana.curve.map((b) => ({
          label: b.manaValue === 7 ? '7+' : String(b.manaValue),
          value: b.count,
        }))}
      />

      {mana.colorBalance.length > 0 && (
        <>
          <h3>Color pips vs. mana sources</h3>
          <table>
            <thead>
              <tr>
                <th>Color</th>
                <th>Pips</th>
                <th>Pip %</th>
                <th>Sources</th>
                <th>Source %</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {mana.colorBalance.map((row) => (
                <tr key={row.color}>
                  <td>
                    <span className={`mana-dot mana-${row.color}`} /> {COLOR_NAMES[row.color]}
                  </td>
                  <td>{row.pips}</td>
                  <td>{row.pipPct}%</td>
                  <td>{row.sources}</td>
                  <td>{row.sourcePct}%</td>
                  <td className={row.deltaPct < -8 ? 'neg' : row.deltaPct > 8 ? 'pos' : ''}>
                    {row.deltaPct > 0 ? '+' : ''}
                    {row.deltaPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {mana.ramp.cards.length > 0 && (
        <p className="muted">Ramp package: {mana.ramp.cards.join(', ')}</p>
      )}
      {mana.notes.map((n, i) => (
        <p key={i} className="note">
          💡 {n}
        </p>
      ))}
    </section>
  );
}
