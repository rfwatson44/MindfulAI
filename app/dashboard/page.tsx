
"use client";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AdAccountCard } from "@/components/dashboard/ad-account-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OverviewMetrics } from "@/components/dashboard/overview-metrics";
import { supabase } from "@/utils/supabase/client";
import type { AdAccount } from "@/lib/types";

interface Account {
  account_id: string;
  account_name: string;
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    async function fetchAccounts() {
      const { data, error } = await supabase
        .from("accounts")
        .select("account_id, account_name");
      if (!error && data) setAccounts(data);
    }
    fetchAccounts();
  }, []);

  return (
    <DashboardLayout>
      <div className="w-full p-6 md:p-8">
        <DashboardHeader />
        <OverviewMetrics />
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map(account => {
            // Provide placeholder metrics and status for now
            const placeholder: AdAccount = {
              id: account.account_id,
              name: account.account_name,
              status: 'active', // valid placeholder
              metrics: {
                spend: 0,
                conversions: 0,
                adCount: 0,
                cpa: 0,
              },
            };
            return <AdAccountCard key={placeholder.id} account={placeholder} />;
          })}

        </div>
      </div>
    </DashboardLayout>
  );
}