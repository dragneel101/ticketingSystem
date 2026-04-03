import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

function StatusTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="dash-chart-tooltip">
      <span className="dash-chart-tooltip-label">{name}</span>
      <span className="dash-chart-tooltip-value">{value}</span>
    </div>
  );
}

function PriorityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="dash-chart-tooltip">
      <span className="dash-chart-tooltip-label">{name}</span>
      <span className="dash-chart-tooltip-value">{value}</span>
    </div>
  );
}

export default function DashboardCharts({ statusChartData, priorityChartData }) {
  return (
    <div className="dash-charts-row">

      {/* By Status — horizontal bar chart */}
      <section className="dash-card dash-chart-card--status" aria-label="Tickets by status">
        <h2 className="dash-card-title">By Status</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={statusChartData}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--gray-400)', fontFamily: 'var(--sans)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 11, fill: 'var(--gray-600)', fontFamily: 'var(--sans)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<StatusTooltip />} cursor={{ fill: 'var(--gray-50)' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {statusChartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* By Priority — vertical bar chart */}
      <section className="dash-card dash-chart-card--priority" aria-label="Tickets by priority">
        <h2 className="dash-card-title">By Priority</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={priorityChartData}
            margin={{ top: 0, right: 8, left: -16, bottom: 0 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--gray-600)', fontFamily: 'var(--sans)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--gray-400)', fontFamily: 'var(--sans)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<PriorityTooltip />} cursor={{ fill: 'var(--gray-50)' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {priorityChartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

    </div>
  );
}
