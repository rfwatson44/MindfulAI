"use client";

import { useState, useEffect } from "react";
import { filterAccountAds } from "@/lib/mock-data";

// --- DEBUG: Top-level logs
console.log('[AccountPageClient] TOP-LEVEL');

// Fallback test ad (must match Ad type)
const FALLBACK_AD = {
  id: 'fallback',
  accountId: 'fallback-account',
  campaignId: 'fallback-campaign',
  campaignName: 'Fallback Campaign',
  name: 'Fallback Ad',
  status: 'active',
  type: "static" as Ad["type"],
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  metrics: {},
  imageUrl: '',
  adSetId: 'fallback-adset',
  spend: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  conversions: 0,
  revenue: 0,
  costPerResult: 0,
};

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AccountHeader } from "@/components/account/account-header";
import { AccountTabs } from "@/components/account/account-tabs";
import { AdTable } from "@/components/account/ad-table";
import { AIPanel } from "@/components/account/ai-panel";

import { Ad, AdType, SelectedRange } from "@/lib/types";

interface AccountPageClientProps {
  account: any; // Replace with your account type
  initialAdsData: Ad[];
}

export function AccountPageClient({ account, initialAdsData }: AccountPageClientProps) {
  // --- DEBUG: Log account and initialAdsData at component start
  console.log('[AccountPageClient] MOUNT/RENDER');
  console.log('[AccountPageClient] account:', account);
  console.log('[AccountPageClient] initialAdsData:', initialAdsData);
  // --- DEBUG: Log filterAccountAds result for static
  const staticFiltered = filterAccountAds(account.id, "static");
  console.log('[AccountPageClient] filterAccountAds(account.id, "static"):', staticFiltered);

  // Fallback for initialAdsData if empty or undefined
  const safeInitialAdsData: Ad[] = (Array.isArray(initialAdsData) && initialAdsData.length > 0) ? initialAdsData : [FALLBACK_AD];
  // --- DEBUG: Log initialAdsData on every mount/render
  console.log('[AccountPageClient] MOUNT/RENDER');
  console.log('[AccountPageClient] initialAdsData:', initialAdsData);

  const [analyzeButton, setAnalyzeButton] = useState<React.ReactNode>(null);
  const [activeTab, setActiveTab] = useState<AdType>("static");
  const [adsData, setAdsData] = useState<Ad[]>(safeInitialAdsData);
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null);
  const [showAnalyzeButton, setShowAnalyzeButton] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

  console.log("[AccountPageClient] Rendered. adsData.length:", adsData.length, "activeTab:", activeTab);
  // Only update adsData on tab change, not on every render
  // Do NOT sync adsData to initialAdsData in a useEffect, as that causes infinite loops if initialAdsData changes frequently.

  const handleAnalyzeClick = () => {
    setIsAIPanelOpen(true);
  };

  // Debug: log whenever selectedRange changes
  useEffect(() => {
    // console.log('[AccountPageClient] selectedRange updated:', selectedRange);
  }, [selectedRange]);
  
>>>>>>> main
  
  // Handle tab change
  const handleTabChange = (type: AdType) => {
    setActiveTab(type);
<<<<<<< HEAD
    setAdsData(filterAccountAds(account.id, type));
    setSelectedRange(null);
  };
  
  // Handle selection change
  const handleSelectionChange = (selection: SelectedRange | null) => {
    setSelectedRange(selection);
    if (selection) {
      setIsAIPanelOpen(true);
    }
=======
    const filtered = filterAccountAds(account.id, type);
    console.log('[AccountPageClient] filterAccountAds result:', filtered);
    // Prevent infinite loop: only setAdsData if different
    setAdsData(prev => {
      if (Array.isArray(filtered) && filtered.length === 0) {
        return [FALLBACK_AD as Ad];
      }
      if (Array.isArray(filtered) && Array.isArray(prev) && filtered.length === prev.length && filtered.every((ad, i) => ad === prev[i])) {
        return prev;
      }
      return filtered as Ad[];
    });
    setSelectedRange(null);
  };

  
  // Handle selection change
  const handleSelectionChange = (selection: SelectedRange | null) => {
    // console.log('[AdTable] onSelectionChange called with:', selection);
    setSelectedRange(selection);
    // Do NOT auto-open the panel; let AdTable control it via Analyze Selected button
>>>>>>> main
  };
  
  // Toggle AI panel
  const toggleAIPanel = () => {
    setIsAIPanelOpen(!isAIPanelOpen);
  };

  return (
<<<<<<< HEAD
    <DashboardLayout>
      <div className="flex h-screen flex-col">
        <div className="border-b border-border p-6 md:p-8">
          <AccountHeader account={account} />
          <AccountTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
        
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
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
=======
    <div>
      <div className="border-b border-border p-6 md:p-8">
        <AccountHeader account={account} />
        <div className="flex flex-row items-center gap-4 mt-4">
          <AccountTabs activeTab={activeTab} onTabChange={handleTabChange} />
          {showAnalyzeButton && !isAIPanelOpen && (
            <Button className="ml-auto" onClick={handleAnalyzeClick}>
              <Sparkles className="mr-2 h-4 w-4" /> Analyze Selected
            </Button>
          )}
        </div>
      </div>
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <AdTable 
            data={adsData} 
            onSelectionChange={handleSelectionChange}
            showAnalyzeButton={showAnalyzeButton}
            setShowAnalyzeButton={setShowAnalyzeButton}
            aiPanelOpen={isAIPanelOpen}
            setAIPanelOpen={setIsAIPanelOpen}
          />
        </div>
        <AIPanel 
          isOpen={isAIPanelOpen} 
          onOpenChange={setIsAIPanelOpen} 
          selectedRange={selectedRange}
          adsData={adsData}
        />
      </div>
    </div>
>>>>>>> main
  );
}