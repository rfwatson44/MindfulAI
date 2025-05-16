import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AdAccountCard } from "@/components/dashboard/ad-account-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OverviewMetrics } from "@/components/dashboard/overview-metrics";
import { mockAdAccounts } from "@/lib/mock-data";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto w-full p-6 md:p-8">
        <DashboardHeader />
        
        <div className="mt-8">
          <OverviewMetrics />
        </div>
        
        <div className="mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">Ad Accounts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an ad account to view detailed analytics
          </p>
          
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {mockAdAccounts.map((account) => (
              <AdAccountCard key={account.id} account={account} />
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}