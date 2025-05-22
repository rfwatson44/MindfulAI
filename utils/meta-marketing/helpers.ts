import { SupabaseClient } from "@supabase/supabase-js";

// Interface for entities that support the getInsights method
export interface InsightCapableEntity {
  id: string;
  getInsights: (
    fields: string[],
    options: Record<string, unknown>
  ) => Promise<unknown[]>;
}

// Interface for processed insights results
export interface InsightResult {
  impressions?: string;
  clicks?: string;
  reach?: string;
  spend?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  objective?: string;
  action_values?: Array<{ action_type: string; value: string }>;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  cost_per_unique_click?: string;
  outbound_clicks?: Array<{ action_type: string; value: string }>;
  outbound_clicks_ctr?: Array<{ action_type: string; value: string }>;
  website_ctr?: Array<{ action_type: string; value: string }>;
  website_purchase_roas?: Array<{ action_type: string; value: string }>;
  [key: string]: unknown;
}

export interface RateLimitInfo {
  usage_percent: number;
  call_count: number;
  total_cputime: number;
  total_time: number;
  estimated_time_to_regain_access: number;
  business_use_case?: string;
  reset_time_duration?: number;
}

// Enhanced rate limiting configuration based on Meta's documentation
export const RATE_LIMIT_CONFIG = {
  // API Tier limits
  DEVELOPMENT: {
    MAX_SCORE: 60,
    DECAY_TIME: 300, // 300 seconds
    BLOCK_TIME: 300, // 300 seconds
    ADS_MANAGEMENT_HOURLY: 300, // 300 calls per hour in dev tier
    INSIGHTS_HOURLY: 600, // 600 calls per hour in dev tier
  },
  STANDARD: {
    MAX_SCORE: 9000,
    DECAY_TIME: 300, // 300 seconds
    BLOCK_TIME: 60, // 60 seconds
    ADS_MANAGEMENT_HOURLY: 100000, // 100k calls per hour in standard tier
    INSIGHTS_HOURLY: 190000, // 190k calls per hour in standard tier
  },
  // Operation costs
  POINTS: {
    READ: 1,
    WRITE: 3,
    INSIGHTS: 2, // Insights calls are more expensive
  },
  // Batch and delay settings
  BATCH_SIZE: 25, // Reduced from 50 to ensure smaller batches
  MIN_DELAY: 1000, // 1 second minimum delay
  BURST_DELAY: 2000, // 2 seconds for potential burst
  INSIGHTS_DELAY: 3000, // 3 seconds for insights calls
};

// Helper functions to safely parse strings to numbers
export function safeParseInt(
  value: string | undefined,
  defaultValue = 0
): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function safeParseFloat(
  value: string | undefined,
  defaultValue = 0
): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Helper function to delay execution
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to get date range for last 24 hours
export function getLast24HoursDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - 24);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// Helper function to get date range for last 6 months
export function getLast6MonthsDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// Helper function to map Meta API status to our database enum values
export function mapToValidStatus(status: string): string {
  // Valid values in our database enum
  const validStatuses = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"];

  // Direct mapping
  const statusMap: Record<string, string> = {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    DELETED: "DELETED",
    ARCHIVED: "ARCHIVED",
  };

  // If we have a direct mapping, use it
  if (status.toUpperCase() in statusMap) {
    return statusMap[status.toUpperCase()];
  }

  // If the status is already a valid enum value, return it
  if (validStatuses.includes(status)) {
    return status;
  }

  // Default fallback if we can't map it
  console.warn(
    `Could not map status '${status}' to a valid enum value, using PAUSED as default`
  );
  return "PAUSED";
}

// Helper function to map Meta API objectives to our database enum values
export function mapToValidObjective(objective: string): string {
  // Valid values in our database enum
  const validObjectives = [
    "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_SALES",
    "OUTCOME_LEADS",
    "OUTCOME_TRAFFIC",
    "OUTCOME_APP_PROMOTION",
    "OUTCOME_CONVERSIONS",
  ];

  // Direct mapping
  const objectiveMap: Record<string, string> = {
    AWARENESS: "OUTCOME_AWARENESS",
    REACH: "OUTCOME_AWARENESS",
    BRAND_AWARENESS: "OUTCOME_AWARENESS",
    ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    POST_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    PAGE_LIKES: "OUTCOME_ENGAGEMENT",
    EVENT_RESPONSES: "OUTCOME_ENGAGEMENT",
    VIDEO_VIEWS: "OUTCOME_ENGAGEMENT",
    SALES: "OUTCOME_SALES",
    PRODUCT_CATALOG_SALES: "OUTCOME_SALES",
    STORE_TRAFFIC: "OUTCOME_SALES",
    LINK_CLICKS: "OUTCOME_TRAFFIC",
    WEBSITE_TRAFFIC: "OUTCOME_TRAFFIC",
    LEAD_GENERATION: "OUTCOME_LEADS",
    LEADS: "OUTCOME_LEADS",
    APP_INSTALLS: "OUTCOME_APP_PROMOTION",
    MOBILE_APP_INSTALLS: "OUTCOME_APP_PROMOTION",
    APP_ENGAGEMENT: "OUTCOME_APP_PROMOTION",
    MOBILE_APP_ENGAGEMENT: "OUTCOME_APP_PROMOTION",
    CONVERSIONS: "OUTCOME_CONVERSIONS",
    WEBSITE_CONVERSIONS: "OUTCOME_CONVERSIONS",
    OUTCOME_AWARENESS: "OUTCOME_AWARENESS",
    OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    OUTCOME_SALES: "OUTCOME_SALES",
    OUTCOME_LEADS: "OUTCOME_LEADS",
    OUTCOME_TRAFFIC: "OUTCOME_TRAFFIC",
    OUTCOME_APP_PROMOTION: "OUTCOME_APP_PROMOTION",
    OUTCOME_CONVERSIONS: "OUTCOME_CONVERSIONS",
  };

  // If we have a direct mapping, use it
  if (objective in objectiveMap) {
    return objectiveMap[objective];
  }

  // If the objective is already a valid enum value, return it
  if (validObjectives.includes(objective)) {
    return objective;
  }

  // Default fallback if we can't map it
  console.warn(
    `Could not map objective '${objective}' to a valid enum value, using OUTCOME_AWARENESS as default`
  );
  return "OUTCOME_AWARENESS";
}

// Save ads to meta_ads table with better error handling
export async function saveAdToDatabase(
  supabase: SupabaseClient,
  ad: any,
  accountId: string,
  campaignId: string,
  adSetId: string,
  adInsights: InsightResult | null,
  creativeDetails: any = null
) {
  try {
    console.log(`Directly storing ad ${ad.id} to meta_ads...`);

    // Create a simple record with only the essential fields
    const adRecord = {
      ad_id: ad.id,
      name: ad.name,
      status: mapToValidStatus(ad.status || "PAUSED"),
      account_id: accountId,
      campaign_id: campaignId,
      ad_set_id: adSetId,
      impressions: safeParseInt(adInsights?.impressions),
      clicks: safeParseInt(adInsights?.clicks),
      reach: safeParseInt(adInsights?.reach),
      spend: safeParseFloat(adInsights?.spend),
      last_updated: new Date(),
      // Add creative data if available
      ...(creativeDetails
        ? {
            thumbnail_url: creativeDetails.thumbnail_url,
            creative_type: creativeDetails.creative_type,
            asset_feed_spec: creativeDetails.asset_feed_spec || "FETCH_FAILED",
            url_tags: creativeDetails.url_tags,
            template_url: creativeDetails.template_url,
            instagram_permalink_url: creativeDetails.instagram_permalink_url,
            effective_object_story_id:
              creativeDetails.effective_object_story_id,
            video_id: creativeDetails.video_id,
            image_url: creativeDetails.image_url,
          }
        : {
            // If ad has a creative ID but no creative details, set a fallback
            ...(ad.creative?.id ? { asset_feed_spec: "FETCH_FAILED" } : {}),
          }),
    };

    // Direct insertion
    console.log(`Saving ad ${ad.id} with record:`, {
      id: adRecord.ad_id,
      name: adRecord.name,
    });

    const { error } = await supabase.from("meta_ads").upsert([adRecord], {
      onConflict: "ad_id",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`Error storing ad ${ad.id}:`, error);

      // Final fallback - try with absolute minimum fields
      const bareMinimumRecord = {
        ad_id: ad.id,
        name: ad.name,
        account_id: accountId,
        // If ad has a creative ID, ensure we include asset_feed_spec
        ...(ad.creative?.id ? { asset_feed_spec: "FETCH_FAILED" } : {}),
      };

      const { error: minError } = await supabase
        .from("meta_ads")
        .upsert([bareMinimumRecord], {
          onConflict: "ad_id",
          ignoreDuplicates: false,
        });

      if (minError) {
        console.error(`Even minimal insert failed for ad ${ad.id}:`, minError);
        return false;
      } else {
        console.log(`Successfully stored minimal data for ad ${ad.id}`);
        return true;
      }
    } else {
      console.log(`Successfully stored ad ${ad.id}`);
      return true;
    }
  } catch (error) {
    console.error(`Exception saving ad ${ad.id}:`, error);
    return false;
  }
}
