import { Ad, AdType, AdAccount, Metric, User } from "@/lib/types";

// Mock users
export const mockUsers: User[] = [
  {
    id: "user-1",
    name: "John Doe",
    email: "john.doe@example.com",
    role: "admin",
    status: "active",
    lastActive: "2025-02-15T10:30:00Z",
  },
  {
    id: "user-2",
    name: "Jane Smith",
    email: "jane.smith@example.com",
    role: "user",
    status: "active",
    lastActive: "2025-02-14T16:45:00Z",
  },
  {
    id: "user-3",
    name: "Robert Johnson",
    email: "robert.j@example.com",
    role: "user",
    status: "inactive",
    lastActive: "2025-01-25T09:15:00Z",
  },
  {
    id: "user-4",
    name: "Emily Wilson",
    email: "emily.w@example.com",
    role: "admin",
    status: "active",
    lastActive: "2025-02-16T11:20:00Z",
  },
];

// Mock ad accounts
export const mockAdAccounts: AdAccount[] = [
  {
    id: "123",
    name: "Main Marketing Account",
    status: "active",
    metrics: {
      spend: 12457.35,
      conversions: 1245,
      adCount: 32,
      cpa: 10.01,
    },
  },
  {
    id: "456",
    name: "Product Launch Campaign",
    status: "active",
    metrics: {
      spend: 8925.62,
      conversions: 972,
      adCount: 18,
      cpa: 9.18,
    },
  },
  {
    id: "789",
    name: "Brand Awareness",
    status: "paused",
    metrics: {
      spend: 3150.80,
      conversions: 245,
      adCount: 12,
      cpa: 12.86,
    },
  },
];

// Define default and optional metrics
export const DEFAULT_METRICS: Metric[] = [
  { id: "spend", name: "Amount Spent" },
  { id: "impressions", name: "Impressions" },
  { id: "clicks", name: "Clicks" },
  { id: "ctr", name: "CTR" },
  { id: "conversions", name: "Conversions" },
<<<<<<< HEAD
  { id: "costPerResult", name: "Cost per Conversion" },
=======
  { id: "cost_per_conversion", name: "Cost per Conversion" },
>>>>>>> main
];

export const OPTIONAL_METRICS: Metric[] = [
  { id: "reach", name: "Reach" },
  { id: "roas", name: "ROAS" },
  { id: "purchases", name: "Purchases" },
  { id: "costPerPurchase", name: "Cost per Purchase" },
  { id: "addToCart", name: "Add to Cart" },
  { id: "appInstalls", name: "App Installs" },
  { id: "costPerAppInstall", name: "Cost per App Install" },
  { id: "leads", name: "Leads" },
  { id: "costPerLead", name: "Cost per Lead" },
];

// Generate mock ads
const staticAdImages = [
  "https://images.pexels.com/photos/6476587/pexels-photo-6476587.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  "https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  "https://images.pexels.com/photos/3756345/pexels-photo-3756345.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  "https://images.pexels.com/photos/5673488/pexels-photo-5673488.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  "https://images.pexels.com/photos/5082579/pexels-photo-5082579.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
];

const videoAdImages = [
  "https://images.pexels.com/photos/9017937/pexels-photo-9017937.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  "https://images.pexels.com/photos/7015034/pexels-photo-7015034.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
  "https://images.pexels.com/photos/8132802/pexels-photo-8132802.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
];

// Generate a mock ad
function generateMockAd(
  id: string,
  accountId: string,
  campaignId: string,
  campaignName: string,
  type: AdType,
  index: number
): Ad {
  const isStatic = type === "static";
  const name = `${isStatic ? "Static" : "Video"} Ad ${index + 1} - ${campaignName}`;
  
  // Base metrics
  const impressions = Math.floor(Math.random() * 150000) + 50000;
  const clicks = Math.floor(Math.random() * 5000) + 1000;
  const ctr = Number(((clicks / impressions) * 100).toFixed(2));
  const spend = Number((Math.random() * 1000 + 200).toFixed(2));
  const conversions = Math.floor(Math.random() * 100) + 10;
  const costPerResult = Number((spend / conversions).toFixed(2));
  
  // Additional metrics
  const reach = Math.floor(impressions * (Math.random() * 0.3 + 0.7));
  const roas = Number((Math.random() * 5 + 1).toFixed(2));
  const purchases = Math.floor(conversions * (Math.random() * 0.5 + 0.3));
  const costPerPurchase = Number((spend / (purchases || 1)).toFixed(2));
  const addToCart = Math.floor(purchases * (Math.random() * 3 + 1.5));
  const appInstalls = isStatic ? 0 : Math.floor(Math.random() * 50) + 5;
  const costPerAppInstall = isStatic ? 0 : Number((spend / (appInstalls || 1)).toFixed(2));
  const leads = Math.floor(Math.random() * 30) + 5;
  const costPerLead = Number((spend / leads).toFixed(2));
  
  // Get preview image
  const imagePool = isStatic ? staticAdImages : videoAdImages;
  const previewUrl = imagePool[Math.floor(Math.random() * imagePool.length)];
  
  return {
    id,
    accountId,
    campaignId,
    campaignName,
    name,
    type,
    previewUrl,
    spend,
    impressions,
    clicks,
    ctr,
    conversions,
    costPerResult,
    reach,
    roas,
    purchases,
    costPerPurchase,
    addToCart,
    appInstalls,
    costPerAppInstall,
    leads,
    costPerLead,
  };
}

// Generate mock ads for each account
const mockAds: Ad[] = [];

// Define campaign names
const campaigns = {
  "123": ["Spring Sale", "Customer Retention", "New Product"],
  "456": ["Mobile App Promotion", "Website Traffic"],
  "789": ["Brand Awareness", "Holiday Special"],
};

// Generate ads for each account
mockAdAccounts.forEach((account) => {
  const accountCampaigns = campaigns[account.id as keyof typeof campaigns] || ["Default Campaign"];
  let adCount = 0;
  
  accountCampaigns.forEach((campaign, i) => {
    const campaignId = `campaign-${account.id}-${i}`;
    
    // Generate static ads
    const staticCount = Math.floor(Math.random() * 5) + 3;
    for (let j = 0; j < staticCount; j++) {
      mockAds.push(
        generateMockAd(
          `ad-${account.id}-${adCount++}`,
          account.id,
          campaignId,
          campaign,
          "static",
          j
        )
      );
    }
    
    // Generate video ads
    const videoCount = Math.floor(Math.random() * 3) + 2;
    for (let j = 0; j < videoCount; j++) {
      mockAds.push(
        generateMockAd(
          `ad-${account.id}-${adCount++}`,
          account.id,
          campaignId,
          campaign,
          "video",
          j
        )
      );
    }
  });
  
  // Update the account's ad count
  account.metrics.adCount = adCount;
});

// Utility functions
export function getAccountById(accountId: string): AdAccount | undefined {
  return mockAdAccounts.find((account) => account.id === accountId);
}

export function getAdsByAccountId(accountId: string): Ad[] {
  return mockAds.filter((ad) => ad.accountId === accountId);
}

export function filterAccountAds(accountId: string, type?: AdType): Ad[] {
  const ads = getAdsByAccountId(accountId);
  return type ? ads.filter((ad) => ad.type === type) : ads;
}