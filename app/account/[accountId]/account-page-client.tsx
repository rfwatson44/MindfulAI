"use client";

import { useState, useEffect } from "react";

// --- DEBUG: Top-level logs
console.log('[AccountPageClient] TOP-LEVEL');

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AccountHeader } from "@/components/account/account-header";
import { AccountTabs } from "@/components/account/account-tabs";
import { AdTable } from "@/components/account/ad-table";
import { AIPanel } from "@/components/account/ai-panel";

import { Ad, AdType, SelectedRange } from "@/lib/types";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from "@/components/ui/pagination"; // Pagination UI

interface AccountPageClientProps {
  account: any; // Replace with your account type
  initialAdsData: Ad[];
}

export function AccountPageClient({ account, initialAdsData }: AccountPageClientProps) {
  // Pagination state
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);

  // --- DEBUG: Log account and initialAdsData at component start
  console.log('[AccountPageClient] MOUNT/RENDER');
  console.log('[AccountPageClient] account:', account);
  console.log('[AccountPageClient] initialAdsData:', initialAdsData);

  const [analyzeButton, setAnalyzeButton] = useState<React.ReactNode>(null);
  const [activeTab, setActiveTab] = useState<AdType>("static");
  const [adsData, setAdsData] = useState<Ad[]>(initialAdsData || []);

  // Pagination: compute current page data
  const totalPages = Math.ceil(adsData.length / PAGE_SIZE);
  const paginatedAds = adsData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
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
  
  
  // Handle tab change
  const handleTabChange = (type: AdType) => {
    setActiveTab(type);
    // Filter adsData by type
    const filtered = (initialAdsData || []).filter((ad) => ad.type === type);
    setAdsData(filtered);
    setSelectedRange(null);
    setCurrentPage(1); // Reset to first page on tab change
  };

  // Show empty state if no ads
  const isEmpty = adsData.length === 0;

  
  // Handle selection change
  const handleSelectionChange = (selection: SelectedRange | null) => {
    // console.log('[AdTable] onSelectionChange called with:', selection);
    setSelectedRange(selection);
    // Do NOT auto-open the panel; let AdTable control it via Analyze Selected button
  };
  
  // Toggle AI panel
  const toggleAIPanel = () => {
    setIsAIPanelOpen(!isAIPanelOpen);
  };

  return (
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
            data={paginatedAds} 
            onSelectionChange={handleSelectionChange}
            showAnalyzeButton={showAnalyzeButton}
            setShowAnalyzeButton={setShowAnalyzeButton}
            aiPanelOpen={isAIPanelOpen}
            setAIPanelOpen={setIsAIPanelOpen}
          />
          {/* Pagination Controls */}
          {adsData.length > PAGE_SIZE && (
            <div className="flex justify-center my-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      aria-disabled={currentPage === 1}
                      tabIndex={currentPage === 1 ? -1 : 0}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <PaginationItem key={idx}>
                      <PaginationLink
                        isActive={currentPage === idx + 1}
                        onClick={() => setCurrentPage(idx + 1)}
                        href="#"
                      >
                        {idx + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      aria-disabled={currentPage === totalPages}
                      tabIndex={currentPage === totalPages ? -1 : 0}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
        <AIPanel 
          isOpen={isAIPanelOpen} 
          onOpenChange={setIsAIPanelOpen} 
          selectedRange={selectedRange}
          adsData={adsData}
        />
      </div>
    </div>
  );
}