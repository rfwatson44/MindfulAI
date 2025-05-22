// User types
export type UserRole = "admin" | "user";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "inactive" | "pending";
  lastActive: string; // ISO date string
}

// Ad Account types
export interface AdAccount {
  id: string;
  name: string;
  status: "active" | "inactive" | "paused";
  metrics: {
    spend: number;
    conversions: number;
    adCount: number;
    cpa: number;
  };
}

// Ad types
export type AdType = "static" | "video";

export interface Ad {
  id: string;
  accountId: string;
  campaignId: string;
  campaignName: string;
  name: string;
  type: AdType;
  previewUrl?: string;
  thumbnail_url?: string;
  // Default metrics (always displayed)
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number | { mobile_app_install?: number | string };
  costPerResult: number;
  cost_per_conversion?: number;
  // Optional metrics (can be added/removed from table)
  reach?: number;
  roas?: number;
  purchases?: number;
  costPerPurchase?: number;
  addToCart?: number;
  appInstalls?: number;
  costPerAppInstall?: number;
  leads?: number;
  costPerLead?: number;
}

// Table selection types
export interface Metric {
  id: string;
  name: string;
}

export interface FilterState {
  adType: AdType | null;
  minSpend: number;
  maxSpend: number;
  campaigns: string[];
}

// Selection range types
export type SelectedRange =
  | {
      type: "cell";
      adId: string;
      adName: string;
      metricId: string;
      metricName: string;
      value: any;
      additionalSelections?: {
        adId: string;
        adName: string;
        metricId: string;
        metricName: string;
        value: any;
      }[];
    }
  | {
      type: "row";
      adId: string;
      adName: string;
      values: {
        adId: string;
        adName: string;
        metricId: string;
        metricName: string;
        value: any;
      }[];
    }
  | {
      type: "column";
      metricId: string;
      metricName: string;
      values: {
        adId: string;
        adName: string;
        metricId: string;
        metricName: string;
        value: any;
      }[];
    };
