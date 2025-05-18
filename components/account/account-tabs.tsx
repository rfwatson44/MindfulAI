import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdType } from "@/lib/types";

interface AccountTabsProps {
  activeTab: AdType;
  onTabChange: (type: AdType) => void;
}

export function AccountTabs({ activeTab, onTabChange }: AccountTabsProps) {
  return (
    <div className="mt-6">
      <Tabs 
        value={activeTab} 
        onValueChange={(value) => onTabChange(value as AdType)}
        className="w-full"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="static" className="flex-1 sm:flex-initial">
            Static Ads
          </TabsTrigger>
          <TabsTrigger value="video" className="flex-1 sm:flex-initial">
            Video Ads
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}