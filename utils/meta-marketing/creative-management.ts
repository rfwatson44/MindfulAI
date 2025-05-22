import { AdCreative } from "facebook-nodejs-business-sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import { delay } from "./helpers";

// Cache for creative data to reduce API calls
interface CreativeCache {
  [creativeId: string]: {
    data: any;
    timestamp: number;
    expiresAt: number;
  };
}

// In-memory cache with 15-minute expiration
const creativeCache: CreativeCache = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// API fetch result with error handling
interface FetchResult {
  success: boolean;
  data?: any;
  error?: string;
  errorType?: string;
}

/**
 * Enhanced creative fetching with retries, timeouts, and error classification
 */
export async function fetchCreative(
  creativeId: string,
  maxRetries = 3
): Promise<FetchResult> {
  // Check cache first
  const cachedData = creativeCache[creativeId];
  if (cachedData && cachedData.expiresAt > Date.now()) {
    return {
      success: true,
      data: cachedData.data,
    };
  }

  // Fields to fetch from Facebook API
  const fields = [
    "id",
    "name",
    "title",
    "body",
    "object_type",
    "thumbnail_url",
    "image_url",
    "video_id",
    "url_tags",
    "template_url",
    "instagram_permalink_url",
    "effective_object_story_id",
    "asset_feed_spec",
    "object_story_spec",
    "platform_customizations",
  ];

  // Implement retries with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Set up timeout for API call
      const timeoutMs = 5000; // 5 seconds max per attempt
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Create and fetch creative
      const creative = new AdCreative(creativeId);

      // Wrap in promise race to handle timeouts
      const details = await Promise.race([
        creative.read(fields),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("API_TIMEOUT")), timeoutMs)
        ),
      ]);

      // Clear timeout
      clearTimeout(timeoutId);

      // If we have data, process and return it
      if (details) {
        // Cache the result
        creativeCache[creativeId] = {
          data: details,
          timestamp: Date.now(),
          expiresAt: Date.now() + CACHE_TTL_MS,
        };

        return {
          success: true,
          data: details,
        };
      }

      // No data returned but no error - treat as not found
      console.log(
        `No data returned for creative ID ${creativeId} on attempt ${attempt}`
      );

      if (attempt >= maxRetries) {
        return {
          success: false,
          error: "Failed to get creative data after multiple attempts",
          errorType: "DATA_MISSING",
        };
      }

      // Wait before retry with exponential backoff (1s, 2s, 4s)
      await delay(1000 * Math.pow(2, attempt - 1));
    } catch (error: any) {
      console.error(
        `Creative fetch attempt ${attempt}/${maxRetries} failed for creative ID ${creativeId}:`,
        error
      );

      // Classify error types
      let errorType = "API_ERROR";
      if (error.message === "API_TIMEOUT") {
        errorType = "API_TIMEOUT";
      } else if (
        error.response?.error?.code === 803 ||
        error.response?.error?.message?.includes("does not exist") ||
        error.response?.error?.message?.includes("not found")
      ) {
        errorType = "DELETED_CREATIVE";
      } else if (
        error.response?.error?.code === 10 ||
        error.response?.error?.code === 200
      ) {
        errorType = "PERMISSION_ERROR";
      } else if (
        error.response?.error?.code === 17 ||
        error.response?.error?.code === 80000
      ) {
        errorType = "RATE_LIMIT";
      }

      // If this was the last attempt, return the error info
      if (attempt >= maxRetries) {
        return {
          success: false,
          error: error.message || "Unknown error",
          errorType,
        };
      }

      // Exponential backoff for retries (1s, 2s, 4s)
      await delay(1000 * Math.pow(2, attempt - 1));
    }
  }

  // If we reach here, all attempts failed
  return {
    success: false,
    error: "All retry attempts failed",
    errorType: "MAX_RETRIES_EXCEEDED",
  };
}

/**
 * Extract creative asset information from object_story_spec as fallback
 */
export function extractCreativeAssetsFromStorySpec(spec: any): any {
  if (!spec) return null;

  let assetInfo: any = {
    source: "FALLBACK_FROM_STORY_SPEC",
  };

  // Handle link type
  if (spec.link_data) {
    const linkData = spec.link_data;

    // Extract image from link data
    if (linkData.image_hash || linkData.picture) {
      assetInfo.image = {
        image_hash: linkData.image_hash,
        picture: linkData.picture,
      };
    }

    // Extract video from link data
    if (linkData.video_id) {
      assetInfo.video = {
        video_id: linkData.video_id,
      };
    }

    // Extract other link properties
    if (linkData.call_to_action) {
      assetInfo.call_to_action = linkData.call_to_action;
    }

    if (linkData.description) {
      assetInfo.description = linkData.description;
    }

    if (linkData.caption) {
      assetInfo.caption = linkData.caption;
    }

    if (linkData.link || linkData.url) {
      assetInfo.url = linkData.link || linkData.url;
    }
  }

  // Handle photo type
  if (spec.photo_data) {
    assetInfo.image = {
      image_hash: spec.photo_data.image_hash,
      url: spec.photo_data.url,
    };
  }

  // Handle video type
  if (spec.video_data) {
    assetInfo.video = {
      video_id: spec.video_data.video_id,
      image_url: spec.video_data.image_url,
      thumbnail_url: spec.video_data.thumbnail_url,
    };
  }

  return Object.keys(assetInfo).length > 1 ? assetInfo : null;
}

/**
 * Create a best-effort asset_feed_spec from ad creative properties
 */
export function createFallbackAssetFeedSpec(creative: any): any {
  if (!creative) return null;

  const fallbackSpec: any = {
    _fallback_source: "SYNTHESIZED",
  };

  // Try to build from available parts
  if (creative.video_id) {
    fallbackSpec.videos = [
      {
        video_id: creative.video_id,
        thumbnail_url: creative.thumbnail_url,
      },
    ];
  } else if (creative.image_url) {
    fallbackSpec.images = [
      {
        url: creative.image_url,
      },
    ];
  }

  // Add any additional metadata we can find
  if (creative.title) {
    fallbackSpec.title = creative.title;
  }

  if (creative.body) {
    fallbackSpec.body = creative.body;
  }

  if (creative.link_url) {
    fallbackSpec.link_url = creative.link_url;
  }

  return Object.keys(fallbackSpec).length > 1 ? fallbackSpec : null;
}

/**
 * Process creative data with intelligent fallbacks
 */
export function processCreativeData(
  creativeData: any,
  ad: any,
  errorType?: string
): any {
  // Start with base structure
  const processedData = {
    thumbnail_url: null as string | null,
    creative_type: "UNKNOWN" as string,
    asset_feed_spec: null as any, // Change to 'any' type to allow various return types
    url_tags: null as string | null,
    template_url: null as string | null,
    instagram_permalink_url: null as string | null,
    effective_object_story_id: null as string | null,
    video_id: null as string | null,
    image_url: null as string | null,
  };

  // If we have creative data from the API
  if (creativeData) {
    // Fill in basic fields
    processedData.thumbnail_url =
      creativeData.thumbnail_url || creativeData.image_url;
    processedData.creative_type = determineActualCreativeType(creativeData);
    processedData.url_tags = creativeData.url_tags || null;
    processedData.template_url = creativeData.template_url || null;
    processedData.instagram_permalink_url =
      creativeData.instagram_permalink_url || null;
    processedData.effective_object_story_id =
      creativeData.effective_object_story_id || null;
    processedData.video_id = creativeData.video_id || null;
    processedData.image_url = creativeData.image_url || null;

    // Use direct asset_feed_spec if available
    if (creativeData.asset_feed_spec) {
      processedData.asset_feed_spec = creativeData.asset_feed_spec;
      return processedData;
    }

    // Try to extract from object_story_spec as first fallback
    if (creativeData.object_story_spec) {
      const extractedAssets = extractCreativeAssetsFromStorySpec(
        creativeData.object_story_spec
      );
      if (extractedAssets) {
        processedData.asset_feed_spec = extractedAssets;
        return processedData;
      }
    }

    // Create a synthetic asset_feed_spec as last resort
    const fallbackSpec = createFallbackAssetFeedSpec(creativeData);
    if (fallbackSpec) {
      processedData.asset_feed_spec = fallbackSpec;
      return processedData;
    }
  }

  // No direct creative data, try fallbacks from ad object
  if (ad) {
    // Try to use ad's effective_object_story_id for media hints
    if (ad.effective_object_story_id) {
      processedData.effective_object_story_id = ad.effective_object_story_id;

      // Extract media type from story ID format
      const storyIdParts = ad.effective_object_story_id.split("_");
      if (storyIdParts.length >= 2) {
        if (storyIdParts[1].startsWith("photo")) {
          processedData.creative_type = "IMAGE";
          processedData.asset_feed_spec = {
            _fallback_source: "STORY_ID_PHOTO",
            images: [{ id: storyIdParts[2] || "unknown" }],
          };
        } else if (storyIdParts[1].startsWith("video")) {
          processedData.creative_type = "VIDEO";
          processedData.asset_feed_spec = {
            _fallback_source: "STORY_ID_VIDEO",
            videos: [{ id: storyIdParts[2] || "unknown" }],
          };
        }
      }
    }

    // Try ad's object_story_spec
    if (ad.object_story_spec && !processedData.asset_feed_spec) {
      const extractedAssets = extractCreativeAssetsFromStorySpec(
        ad.object_story_spec
      );
      if (extractedAssets) {
        processedData.asset_feed_spec = extractedAssets;
      }
    }
  }

  // If we still don't have asset_feed_spec, use error type as marker
  if (!processedData.asset_feed_spec) {
    if (errorType) {
      processedData.asset_feed_spec = errorType;
    } else {
      processedData.asset_feed_spec = "FETCH_FAILED";
    }
  }

  return processedData;
}

/**
 * Determine the actual creative type based on content
 */
export function determineActualCreativeType(details: any): string {
  if (!details || !details.object_type) {
    return "UNKNOWN";
  }

  if (details.object_type === "SHARE") {
    // For SHARE type, use better classification based on content
    if (details.video_id) {
      return "VIDEO";
    } else if (details.image_url || details.thumbnail_url) {
      return "IMAGE";
    }
  }

  // Return original type if not SHARE or no better classification available
  return details.object_type;
}

/**
 * Enhanced creative fetching for ads with better fallbacks
 */
export async function fetchCreativeDetails(
  ad: any,
  delayBetweenRequests = 300 // Add delay between requests to prevent rate limiting
): Promise<any> {
  if (!ad.creative || !ad.creative.id) {
    return null;
  }

  // Add slight delay to prevent consecutive calls hitting rate limits
  if (delayBetweenRequests > 0) {
    await delay(delayBetweenRequests);
  }

  // Fetch creative with enhanced error handling
  const fetchResult = await fetchCreative(ad.creative.id);

  if (fetchResult.success) {
    return processCreativeData(fetchResult.data, ad);
  } else {
    // Process with fallbacks and errorType for better classification
    return processCreativeData(null, ad, fetchResult.errorType);
  }
}

/**
 * Background job to repair ads with missing/failed asset_feed_spec
 */
export async function repairFailedCreatives(
  supabase: SupabaseClient,
  batchSize = 100
): Promise<{
  processed: number;
  updated: number;
  failed: number;
  errors: any[];
}> {
  const results = {
    processed: 0,
    updated: 0,
    failed: 0,
    errors: [] as any[],
  };

  try {
    // Find ads with creative IDs but missing/failed asset_feed_spec
    const { data: failedAds, error: queryError } = await supabase
      .from("meta_ads")
      .select("ad_id, creative")
      .or("asset_feed_spec.is.null,asset_feed_spec.eq.FETCH_FAILED")
      .not("creative", "is", null)
      .limit(batchSize);

    if (queryError) {
      throw new Error(`Error querying failed ads: ${queryError.message}`);
    }

    if (!failedAds || failedAds.length === 0) {
      return results; // No ads to repair
    }

    results.processed = failedAds.length;
    console.log(
      `Found ${failedAds.length} ads with missing/failed asset_feed_spec to repair`
    );

    // Process each ad with delays to avoid rate limiting
    for (const ad of failedAds) {
      try {
        // Only process ads with creative IDs
        if (!ad.creative || !ad.creative.id) continue;

        // Fetch creative with enhanced error handling (300ms delay between requests)
        const creativeDetails = await fetchCreativeDetails(ad, 300);

        if (creativeDetails) {
          // Update the ad with new creative details
          const { error: updateError } = await supabase
            .from("meta_ads")
            .update({
              asset_feed_spec: creativeDetails.asset_feed_spec,
              thumbnail_url: creativeDetails.thumbnail_url,
              creative_type: creativeDetails.creative_type,
              url_tags: creativeDetails.url_tags,
              template_url: creativeDetails.template_url,
              instagram_permalink_url: creativeDetails.instagram_permalink_url,
              effective_object_story_id:
                creativeDetails.effective_object_story_id,
              video_id: creativeDetails.video_id,
              image_url: creativeDetails.image_url,
              updated_at: new Date(),
            })
            .eq("ad_id", ad.ad_id);

          if (updateError) {
            console.error(`Error updating ad ${ad.ad_id}:`, updateError);
            results.failed++;
            results.errors.push({
              ad_id: ad.ad_id,
              error: updateError.message,
            });
          } else {
            results.updated++;
          }
        }
      } catch (adError) {
        console.error(`Error processing ad ${ad.ad_id}:`, adError);
        results.failed++;
        results.errors.push({
          ad_id: ad.ad_id,
          error: adError instanceof Error ? adError.message : "Unknown error",
        });
      }

      // Add delay between ads to prevent rate limiting
      await delay(300);
    }

    return results;
  } catch (error) {
    console.error("Error in repairFailedCreatives:", error);
    throw error;
  }
}

/**
 * Track Facebook API quota usage
 */
export async function trackCreativeApiFetches(
  supabase: SupabaseClient,
  accountId: string,
  success: boolean,
  errorType?: string
): Promise<void> {
  try {
    await supabase.from("meta_api_metrics").insert([
      {
        account_id: accountId,
        endpoint: "creative",
        call_type: "READ",
        points_used: 1,
        success,
        error_code: errorType || null,
        error_message: success ? null : errorType,
      },
    ]);
  } catch (error) {
    console.error("Error tracking Creative API metrics:", error);
  }
}
