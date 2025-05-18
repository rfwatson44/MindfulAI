import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, MousePointer, BarChart2 } from "lucide-react";

export function OverviewMetrics() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Spend"
        value="$12,457.35"
        description="Last 30 days"
        icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        trend={{ value: "+12.5%", positive: true }}
      />
      <MetricCard
        title="Impressions"
        value="1.4M"
        description="Last 30 days"
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
        trend={{ value: "+8.2%", positive: true }}
      />
      <MetricCard
        title="Clicks"
        value="87,429"
        description="Last 30 days"
        icon={<MousePointer className="h-4 w-4 text-muted-foreground" />}
        trend={{ value: "+3.1%", positive: true }}
      />
      <MetricCard
        title="Conversions"
        value="4,294"
        description="Last 30 days"
        icon={<BarChart2 className="h-4 w-4 text-muted-foreground" />}
        trend={{ value: "-2.3%", positive: false }}
      />
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    positive: boolean;
  };
}

function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
}: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center text-xs text-muted-foreground">
          {description}
          {trend && (
            <span
              className={`ml-2 flex items-center text-xs font-medium ${
                trend.positive ? "text-green-500" : "text-red-500"
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}