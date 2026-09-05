interface Bar {
  label: string;
  value: number;
  display?: string;
}

interface Props {
  bars: Bar[];
  height?: number;
  color?: string;
}

/** Dependency-free SVG bar chart. */
const VIEW_WIDTH = 400;

export default function BarChart({ bars, height = 140, color = 'var(--accent)' }: Props) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const barWidth = VIEW_WIDTH / bars.length;

  return (
    <svg className="bar-chart" viewBox={`0 0 ${VIEW_WIDTH} ${height}`} role="img">
      {bars.map((b, i) => {
        const h = (b.value / max) * (height - 34);
        const x = i * barWidth;
        return (
          <g key={b.label}>
            <rect
              x={x + barWidth * 0.12}
              y={height - 18 - h}
              width={barWidth * 0.76}
              height={h}
              rx={1}
              fill={color}
            >
              <title>{`${b.label}: ${b.display ?? b.value}`}</title>
            </rect>
            <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" className="chart-label">
              {b.label}
            </text>
            {b.value > 0 && (
              <text
                x={x + barWidth / 2}
                y={height - 22 - h}
                textAnchor="middle"
                className="chart-value"
              >
                {b.display ?? b.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
