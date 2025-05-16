"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AccountHeader } from "@/components/account/account-header";
import { AccountTabs } from "@/components/account/account-tabs";
import { AdTable } from "@/components/account/ad-table";
import { AIPanel } from "@/components/account/ai-panel";
import { filterAccountAds } from "@/lib/mock-data";
import { Ad, AdType, SelectedRange } from "@/lib/types";

interface AccountPageClientProps {
  account: any; // Replace with your account type
}

export function AccountPageClient({ account }: AccountPageClientProps) {
  const [activeTab, setActiveTab] = useState<AdType>("static");
  const [adsData, setAdsData] = useState<Ad[]>(
    filterAccountAds(account.id, activeTab)
  );
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  
  // Handle tab change
  const handleTabChange = (type: AdType) => {
    setActiveTab(type);
    setAdsData(filterAccountAds(account.id, type));
    setSelectedRange(null);
  };
  
  // Handle selection change
  const handleSelectionChange = (selection: SelectedRange | null) => {
    setSelectedRange(selection);
    if (selection) {
      setIsAIPanelOpen(true);
    }
  };
  
  // Toggle AI panel
  const toggleAIPanel = () => {
    setIsAIPanelOpen(!isAIPanelOpen);
  };

  return (
    <DashboardLayout>
      <div className="flex h-screen flex-col">
        <div className="border-b border-border p-6 md:p-8">
          <AccountHeader account={account} />
          <AccountTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
        
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <AdTable 
              data={adsData} 
              onSelectionChange={handleSelectionChange}
            />
          </div>
          
          <AIPanel 
            isOpen={isAIPanelOpen} 
            onToggle={toggleAIPanel} 
            selectedRange={selectedRange}
            adsData={adsData}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}