import { SupabaseClient } from "@supabase/supabase-js";
import {
  InsightCapableEntity,
  InsightResult,
  delay,
  mapToValidStatus,
  saveAdToDatabase,
  safeParseInt,
  safeParseFloat,
} from "./helpers";
import {
  fetchCreativeDetails,
  determineActualCreativeType,
} from "./creative-management";

/**
 * Process an ad and save it to the database
 */
export async function processAd(
  ad: any,
  adSet: any,
  campaign: any,
  accountId: string,
  supabase: SupabaseClient,
  dateRange: { since: string; until: string },
  getInsights: (
    entity: InsightCapableEntity,
    supabase: SupabaseClient,
    accountId: string,
    dateRange: { since: string; until: string }
  ) => Promise<InsightResult | null>,
  processedAds: any[]
) {
  try {
    console.log(`Processing ad ${ad.id}...`);

    // Get ad insights to check for activity
    const adInsights = await getInsights(
      ad as InsightCapableEntity,
      supabase,
      accountId,
      dateRange
    );

    // Check if this ad had activity
    const adHasActivity =
      adInsights &&
      (safeParseInt(adInsights.impressions) > 0 ||
        safeParseInt(adInsights.clicks) > 0 ||
        safeParseFloat(adInsights.spend) > 0);

    console.log(
      `Ad ${ad.id} activity: ${adHasActivity ? "Active" : "Inactive"}`
    );

    if (!adHasActivity) {
      console.log(`Skipping ad ${ad.id} - no activity in last 24 hours`);
      return;
    }

    // Get creative details if creative exists using enhanced fetching
    let creativeDetails = null;
    if (ad.creative && ad.creative.id) {
      // Use the enhanced fetching with intelligent fallbacks
      creativeDetails = await fetchCreativeDetails(ad);
    }

    // First add to processedAds collection so it's returned to the client
    // This ensures the ad is included in the API response even if database operations fail
    const simpleAdRecord = {
      ad_id: ad.id,
      name: ad.name,
      ad_set_id: adSet.id,
      campaign_id: campaign.id,
      status: mapToValidStatus(ad.status || "PAUSED"),
      impressions: safeParseInt(adInsights?.impressions),
      clicks: safeParseInt(adInsights?.clicks),
      reach: safeParseInt(adInsights?.reach),
      spend: safeParseFloat(adInsights?.spend),
    };

    // Add to the collection that will be returned to the client
    processedAds.push(simpleAdRecord);

    // Log that we're trying to save to the database
    console.log(`Saving ad ${ad.id} to meta_ads table...`);

    // Now try to save to the database
    const success = await saveAdToDatabase(
      supabase,
      ad,
      accountId,
      campaign.id,
      adSet.id,
      adInsights,
      creativeDetails
    );

    if (success) {
      console.log(`Successfully saved ad ${ad.id} to database`);
    } else {
      console.warn(
        `Failed to save ad ${ad.id} to database, but it will still be returned in API response`
      );
    }

    // No need for additional delay since fetchCreativeDetails already adds appropriate delays
  } catch (adError) {
    console.error(`Error processing ad ${ad.id}:`, adError);
    if (adError instanceof Error) {
      console.error(`Error stack: ${adError.stack}`);
    }
  }
}
