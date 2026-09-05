import type { UpgradePlan } from '@mtg/shared';

export default function UpgradesPanel({ upgrades }: { upgrades: UpgradePlan | null }) {
  if (!upgrades) return null;

  return (
    <section className="panel">
      <h2>
        Upgrade suggestions{' '}
        {upgrades.suggestions.length > 0 && (
          <span className="badge">${upgrades.totalUsd.toFixed(2)} total</span>
        )}
      </h2>
      {upgrades.suggestions.length === 0 ? (
        <p className="muted">No swaps suggested.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cut</th>
              <th>Add</th>
              <th>Slot</th>
              <th>Why</th>
              <th>Price</th>
              <th>Running total</th>
            </tr>
          </thead>
          <tbody>
            {upgrades.suggestions.map((s) => (
              <tr key={`${s.cut}->${s.add}`}>
                <td className="cut">− {s.cut}</td>
                <td className="add">+ {s.add}</td>
                <td>
                  <span className="tag">{s.slot}</span>
                </td>
                <td className="muted small">
                  <div>{s.addReason}</div>
                  <div className="footnote">{s.cutReason}</div>
                </td>
                <td>{s.priceUsd !== null ? `$${s.priceUsd.toFixed(2)}` : '—'}</td>
                <td>${s.runningTotalUsd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {upgrades.notes.map((n, i) => (
        <p key={i} className="footnote">
          {n}
        </p>
      ))}
    </section>
  );
}
