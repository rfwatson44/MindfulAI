"use client";

<<<<<<< HEAD
import { useState, useEffect } from "react";
=======
import { useState, useEffect, useMemo } from "react";
>>>>>>> main
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Ad, AdType, FilterState } from "@/lib/types";
import { Slider } from "@/components/ui/slider";

interface TableFiltersProps {
  data: Ad[];
  onFiltersChange: (filtered: Ad[]) => void;
}

export function TableFilters({ data, onFiltersChange }: TableFiltersProps) {
  const [searchValue, setSearchValue] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    adType: null,
    minSpend: 0,
    maxSpend: 5000,
    campaigns: [],
  });
  const [activeFilterCount, setActiveFilterCount] = useState(0);
<<<<<<< HEAD
  
  // Extract unique campaign names
  const allCampaigns = Array.from(
    new Set(data.map((ad) => ad.campaignName))
  ).sort();
  
  // Get max spend value from data for slider
  const maxDataSpend = Math.max(...data.map((ad) => ad.spend), 0);
  
  useEffect(() => {
    // Apply filters
    let filtered = [...data];
    
    // Search filter
=======

  // Extract unique campaign names
  const allCampaigns = useMemo(() => Array.from(
    new Set(data.map((ad) => ad.campaignName))
  ).sort(), [data]);

  // Get max spend value from data for slider
  const maxDataSpend = useMemo(() => Math.max(...data.map((ad) => ad.spend), 0), [data]);

  // Memoize filtered data
  const filteredData = useMemo(() => {
    let filtered = [...data];
>>>>>>> main
    if (searchValue) {
      filtered = filtered.filter((ad) =>
        ad.name.toLowerCase().includes(searchValue.toLowerCase())
      );
    }
<<<<<<< HEAD
    
    // Ad type filter
    if (filters.adType) {
      filtered = filtered.filter((ad) => ad.type === filters.adType);
    }
    
    // Spend range filter
    filtered = filtered.filter(
      (ad) => ad.spend >= filters.minSpend && ad.spend <= filters.maxSpend
    );
    
    // Campaign filter
=======
    if (filters.adType) {
      filtered = filtered.filter((ad) => ad.type === filters.adType);
    }
    filtered = filtered.filter(
      (ad) => ad.spend >= filters.minSpend && ad.spend <= filters.maxSpend
    );
>>>>>>> main
    if (filters.campaigns.length > 0) {
      filtered = filtered.filter((ad) =>
        filters.campaigns.includes(ad.campaignName)
      );
    }
<<<<<<< HEAD
    
    // Count active filters
    let count = 0;
    if (searchValue) count++;
    if (filters.adType) count++;
    if (filters.minSpend > 0 || filters.maxSpend < maxDataSpend) count++;
    if (filters.campaigns.length > 0) count++;
    setActiveFilterCount(count);
    
    // Send filtered data to parent
    onFiltersChange(filtered);
  }, [searchValue, filters, data, onFiltersChange, maxDataSpend]);
  
=======
    return filtered;
  }, [data, searchValue, filters]);

// Only update activeFilterCount if it actually changes
useEffect(() => {
  let count = 0;
  if (searchValue) count++;
  if (filters.adType) count++;
  if (filters.minSpend > 0 || filters.maxSpend < maxDataSpend) count++;
  if (filters.campaigns.length > 0) count++;
  setActiveFilterCount((prev) => (prev !== count ? count : prev));
}, [searchValue, filters, maxDataSpend]);

// Only call onFiltersChange if filteredData changes
useEffect(() => {
  onFiltersChange(filteredData);
}, [filteredData, onFiltersChange]);

>>>>>>> main
  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };
<<<<<<< HEAD
  
=======

>>>>>>> main
  // Handle spend range filter change
  const handleSpendRangeChange = (values: number[]) => {
    setFilters({
      ...filters,
      minSpend: values[0],
      maxSpend: values[1] || maxDataSpend,
    });
  };
<<<<<<< HEAD
  
=======

>>>>>>> main
  // Handle campaign filter change
  const handleCampaignChange = (campaign: string, checked: boolean) => {
    const updatedCampaigns = checked
      ? [...filters.campaigns, campaign]
      : filters.campaigns.filter((c) => c !== campaign);
<<<<<<< HEAD
    
=======

>>>>>>> main
    setFilters({
      ...filters,
      campaigns: updatedCampaigns,
    });
  };
<<<<<<< HEAD
  
=======

>>>>>>> main
  // Reset all filters
  const resetFilters = () => {
    setSearchValue("");
    setFilters({
      adType: null,
      minSpend: 0,
      maxSpend: maxDataSpend,
      campaigns: [],
    });
  };

  return (
<<<<<<< HEAD
    <div className="flex w-[300px] items-center gap-2">
=======
    <div className="flex items-center gap-2">
>>>>>>> main
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search ads..."
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>
<<<<<<< HEAD
      
=======

>>>>>>> main
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
<<<<<<< HEAD
              <Badge variant="secondary" className="absolute -right-1 -top-1 h-4 w-4 p-0 text-xs">
=======
              <Badge
                variant="secondary"
                className="absolute -right-1 -top-1 h-4 w-4 p-0 text-xs"
              >
>>>>>>> main
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filter Options</SheetTitle>
            <SheetDescription>
              Refine the ad performance data view
            </SheetDescription>
          </SheetHeader>
<<<<<<< HEAD
          
=======

>>>>>>> main
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="spend-range">Amount Spent Range</Label>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  ${filters.minSpend.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">
                  ${filters.maxSpend.toLocaleString()}
                </span>
              </div>
              <Slider
                id="spend-range"
                defaultValue={[filters.minSpend, filters.maxSpend]}
                min={0}
                max={maxDataSpend}
                step={100}
                onValueChange={handleSpendRangeChange}
              />
            </div>
<<<<<<< HEAD
            
            <div className="space-y-2">
              <Label>Campaigns</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {allCampaigns.map((campaign) => (
                  <div
                    key={campaign}
                    className="flex items-center space-x-2"
                  >
=======

            <div className="space-y-2">
              <Label>Campaigns</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {allCampaigns.map((campaign, idx) => (
                  <div key={`${campaign}-${idx}`} className="flex items-center space-x-2">
>>>>>>> main
                    <Checkbox
                      id={`campaign-${campaign}`}
                      checked={filters.campaigns.includes(campaign)}
                      onCheckedChange={(checked) =>
<<<<<<< HEAD
                        handleCampaignChange(
                          campaign,
                          checked as boolean
                        )
=======
                        handleCampaignChange(campaign, checked as boolean)
>>>>>>> main
                      }
                    />
                    <label
                      htmlFor={`campaign-${campaign}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {campaign}
                    </label>
                  </div>
                ))}
              </div>
            </div>
<<<<<<< HEAD
            
=======

>>>>>>> main
            <Button
              variant="secondary"
              onClick={resetFilters}
              className="w-full"
            >
              Reset Filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
<<<<<<< HEAD
}
=======
}
>>>>>>> main
