import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface CountryRow {
  name: string;
  cc: string;
  learners: number;
  completionRate: number;
  avgScore: number;
  passRate: number;
}

const PALETTE = [
  "hsl(217 91% 55%)",
  "hsl(158 64% 42%)",
  "hsl(38 92% 55%)",
  "hsl(346 84% 56%)",
  "hsl(271 76% 60%)",
  "hsl(190 80% 45%)",
  "hsl(15 85% 60%)",
  "hsl(120 50% 45%)",
];

/** Horizontal bar chart: completion % per country */
export const CountryCompletionBar = ({ data }: { data: CountryRow[] }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
      <Tooltip
        formatter={(value: number) => [`${value}%`, "수료율"]}
        contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
      />
      <Bar dataKey="completionRate" name="수료율" radius={[0, 6, 6, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

/** Donut: learner distribution by country */
export const LearnerDistributionDonut = ({ data }: { data: CountryRow[] }) => {
  const filtered = data.filter((d) => d.learners > 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Pie
          data={filtered}
          dataKey="learners"
          nameKey="name"
          cx="50%"
          cy="42%"
          innerRadius="38%"
          outerRadius="68%"
          paddingAngle={2}
        >
          {filtered.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [`${value}명`, "학습자"]}
          contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, lineHeight: "14px", paddingTop: 4 }}
          iconSize={8}
          verticalAlign="bottom"
          height={36}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

/** Quiz score vs pass rate per country (grouped bars) */
export const CountryQuizCompare = ({ data, scoreLabel, passLabel }: { data: CountryRow[]; scoreLabel: string; passLabel: string }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={36} />
      <Tooltip
        formatter={(value: number) => [`${value}%`, ""]}
        contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
      <Bar dataKey="avgScore" name={scoreLabel} fill="hsl(217 91% 55%)" radius={[4, 4, 0, 0]} />
      <Bar dataKey="passRate" name={passLabel} fill="hsl(158 64% 42%)" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

interface TrackRow { name: string; rate: number; completed: number; possible: number; }

/** Track-level completion comparison */
export const TrackCompletionBar = ({ data }: { data: TrackRow[] }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
      <Tooltip
        formatter={(value: number, _key, item: any) => [
          `${value}% (${item?.payload?.completed}/${item?.payload?.possible})`,
          "수료율",
        ]}
        contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
      />
      <Bar dataKey="rate" name="수료율" radius={[0, 6, 6, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);
