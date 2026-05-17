import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IS_DEV_MODE } from "@/lib/devMode";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  subtitle?: string;
  /** Plain-language formula shown on the "i" hover (for operators). */
  formula?: string;
  /** Tables, columns, and API fields shown on the "D" hover (for developers). */
  dataSource?: string;
}

export function KPICard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  subtitle,
  formula,
  dataSource,
}: KPICardProps) {
  const hasTooltips = Boolean(formula || dataSource);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card border rounded-lg p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</span>
          {hasTooltips && (
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center shrink-0 gap-0.5">
                {formula && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`How ${title} is calculated`}
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed whitespace-pre-line">
                      {formula}
                    </TooltipContent>
                  </Tooltip>
                )}
                {dataSource && IS_DEV_MODE && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-sm border border-transparent text-[8px] font-bold font-mono leading-none text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                        aria-label={`Data sources for ${title} (developer)`}
                      >
                        D
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-md text-xs leading-relaxed whitespace-pre-line">
                      {dataSource}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <div className="flex items-center gap-2">
          {change && (
            <span
              className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground",
              )}
            >
              {change}
            </span>
          )}
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
    </motion.div>
  );
}
