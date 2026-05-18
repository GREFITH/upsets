import { ForecastMonth } from "@/types/dashboard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface ForecastChartProps {
  data: ForecastMonth[];
  title?: string;
}

export function ForecastChart({ data, title = "Revenue Forecast" }: ForecastChartProps) {
  const safeData = Array.isArray(data) ? data : [];
  const firstProjected = safeData.findIndex((d) => d.projected);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, notation: "compact" }).format(value);

  if (safeData.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-5 min-h-[260px] flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
          No forecast months loaded yet. Revenue forecast data can be wired from your planning model later.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-5 min-h-[280px] min-w-0 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="font-semibold text-sm">{title}</h3>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-secondary" /> Revenue
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent" /> Net Revenue
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1 w-3 border-t border-dashed border-muted-foreground" /> Projected
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-[400px] min-w-[200px] w-full relative">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={safeData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(204, 60%, 76%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(204, 60%, 76%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(56, 94%, 48%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(56, 94%, 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 14%, 89%)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(0, 0%, 40%)" />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} stroke="hsl(0, 0%, 40%)" width={50} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: "hsl(0, 0%, 100%)",
                border: "1px solid hsl(210, 14%, 89%)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
            {firstProjected > 0 && safeData[firstProjected] && (
              <ReferenceLine
                x={safeData[firstProjected].month}
                stroke="hsl(0, 0%, 60%)"
                strokeDasharray="4 4"
                label={{ value: "Projected →", position: "top", fontSize: 10, fill: "hsl(0, 0%, 40%)" }}
              />
            )}
            <Area type="monotone" dataKey="netRevenue" stroke="hsl(56, 94%, 48%)" fill="url(#netGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="revenue" stroke="hsl(204, 60%, 76%)" fill="url(#revenueGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
