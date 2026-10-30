import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../components/ui.jsx";
import { compactMoney, formatMoney } from "../utils/money.js";

export function CashFlowChart({ data, currency }) {
  const hasActivity = data.some((month) => month.incomeMinor > 0 || month.expensesMinor > 0);
  if (!data.length || !hasActivity) {
    return <EmptyState title="No activity in this range" description="Income and expense totals will appear here when you add transactions." />;
  }

  return (
    <div aria-label={`Monthly income and expenses in ${currency}`} className="h-72 w-full sm:h-80" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#e8eff0" strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
          <YAxis
            axisLine={false}
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickFormatter={(value) => compactMoney(value, currency)}
            tickLine={false}
            width={74}
          />
          <Tooltip formatter={(value, name) => [formatMoney(Number(value), currency), name]} />
          <Legend />
          <Bar dataKey="incomeMinor" fill="#25aaa4" name="Income" radius={[5, 5, 0, 0]} />
          <Bar dataKey="expensesMinor" fill="#6ba6e8" name="Expenses" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDoughnut({ categories, currency }) {
  if (!categories.length || !categories.some((category) => category.amountMinor > 0)) {
    return <EmptyState title="No expense categories yet" description="Category totals appear here when expenses are recorded in this currency." />;
  }

  return (
    <div>
      <div aria-label={`Expense categories in ${currency}`} className="h-64 w-full" role="img">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              accessibilityLayer
              data={categories}
              dataKey="amountMinor"
              innerRadius={62}
              nameKey="name"
              outerRadius={98}
              paddingAngle={2}
            >
              {categories.map((category, index) => (
                <Cell fill={category.color || "#94a3b8"} key={`${category.categoryId}-${index}`} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul aria-label="Expense totals by category" className="mt-2 max-h-52 space-y-2 overflow-y-auto">
        {categories.map((category) => (
          <li className="flex items-center justify-between gap-3 text-sm" key={`${category.categoryId}-${category.currency}`}>
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="truncate">{category.name}</span>
            </span>
            <span className="shrink-0 font-medium text-slate-800">{formatMoney(category.amountMinor, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
