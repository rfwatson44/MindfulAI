
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
        <OverviewMetrics />
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {mockAdAccounts.map((account) => (
            <AdAccountCard key={account.id} account={account} />
          ))}
        </div>
      </div>
    </DashboardLayout>

  );
}