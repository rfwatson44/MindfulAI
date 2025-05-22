/**
 * Utility functions for testing engagement metrics processing
 * This file contains the updated functions for manual testing
 */

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

// Helper function to extract value from actions array
export function extractActionValue(
  actions: any[] | undefined,
  actionType: string
): number {
  if (!actions || !Array.isArray(actions)) return 0;

  const action = actions.find((a) => a.action_type === actionType);
  return action ? safeParseInt(action.value) : 0;
}

// Function to process engagement metrics data
export function processEngagementMetrics(
  insights: any | null,
  spend: number
): Record<string, any> {
  if (!insights) {
    console.warn(
      "No insights data available for engagement metrics processing"
    );
    return {};
  }

  try {
    // Extract direct metrics from insights
    const impressions = safeParseInt(insights.impressions);

    // Use the correct field names from Facebook API
    const inlinePostEngagement = safeParseInt(insights.inline_post_engagement);
    const inlineLinkClicks = safeParseInt(insights.inline_link_clicks);

    // Extract comment counts from actions if available
    const postComments = extractActionValue(insights.actions, "comment");

    // Extract video metrics from actions arrays
    const twoSecVideoViews = extractActionValue(
      insights.video_continuous_2_sec_watched_actions,
      "video_view"
    );
    const thruplays = extractActionValue(
      insights.video_thruplay_watched_actions,
      "video_view"
    );
    const video30sWatched = extractActionValue(
      insights.video_30_sec_watched_actions,
      "video_view"
    );

    // Video percentage metrics
    const video25PercentWatched = extractActionValue(
      insights.video_p25_watched_actions,
      "video_view"
    );
    const video50PercentWatched = extractActionValue(
      insights.video_p50_watched_actions,
      "video_view"
    );
    const video75PercentWatched = extractActionValue(
      insights.video_p75_watched_actions,
      "video_view"
    );
    const video95PercentWatched = extractActionValue(
      insights.video_p95_watched_actions,
      "video_view"
    );

    // Average watch time
    const avgWatchTimeActions = insights.video_avg_time_watched_actions || [];
    const avgWatchTimeSeconds =
      avgWatchTimeActions.length > 0
        ? safeParseFloat(avgWatchTimeActions[0]?.value || "0")
        : 0;

    // Calculate derived metrics
    // Use safe division to prevent dividing by zero
    const safeDivide = (numerator: number, denominator: number) =>
      denominator > 0 ? numerator / denominator : 0;

    const costPerPostEngagement = safeDivide(spend, inlinePostEngagement);
    const costPerLinkClick = safeDivide(spend, inlineLinkClicks);
    const costPerPostComment = safeDivide(spend, postComments);
    const costPer2secView = safeDivide(spend, twoSecVideoViews);
    const costPerThruplay = safeDivide(spend, thruplays);

    // Calculate percentages
    const vtrPercentage = safeDivide(thruplays, impressions) * 100;
    const hookRatePercentage = safeDivide(twoSecVideoViews, impressions) * 100;

    return {
      // Direct metrics
      inline_post_engagement: inlinePostEngagement,
      inline_link_clicks: inlineLinkClicks,
      post_comments: postComments,
      two_sec_video_views: twoSecVideoViews,
      thruplays: thruplays,
      video_30s_watched: video30sWatched,
      video_25_percent_watched: video25PercentWatched,
      video_50_percent_watched: video50PercentWatched,
      video_75_percent_watched: video75PercentWatched,
      video_95_percent_watched: video95PercentWatched,
      avg_watch_time_seconds: avgWatchTimeSeconds,

      // Calculated metrics
      cost_per_post_engagement: Number(costPerPostEngagement.toFixed(2)),
      cost_per_link_click: Number(costPerLinkClick.toFixed(2)),
      cost_per_post_comment: Number(costPerPostComment.toFixed(2)),
      cost_per_2sec_view: Number(costPer2secView.toFixed(2)),
      cost_per_thruplay: Number(costPerThruplay.toFixed(2)),
      vtr_percentage: Number(vtrPercentage.toFixed(2)),
      hook_rate_percentage: Number(hookRatePercentage.toFixed(2)),
    };
  } catch (error) {
    console.error("Error processing engagement metrics:", error);
    return {}; // Return empty object on error to ensure main ad processing continues
  }
}

// Example usage:
export function testProcessEngagementMetrics() {
  const mockInsights = {
    impressions: "1000",
    inline_post_engagement: "200",
    inline_link_clicks: "50",
    actions: [
      { action_type: "comment", value: "10" },
      { action_type: "like", value: "30" },
    ],
    video_continuous_2_sec_watched_actions: [
      { action_type: "video_view", value: "800" },
    ],
    video_thruplay_watched_actions: [
      { action_type: "video_view", value: "400" },
    ],
    video_30_sec_watched_actions: [{ action_type: "video_view", value: "300" }],
    video_p25_watched_actions: [{ action_type: "video_view", value: "700" }],
    video_p50_watched_actions: [{ action_type: "video_view", value: "600" }],
    video_p75_watched_actions: [{ action_type: "video_view", value: "500" }],
    video_p95_watched_actions: [{ action_type: "video_view", value: "300" }],
    video_avg_time_watched_actions: [
      { action_type: "video_view", value: "15.5" },
    ],
  };

  const spendAmount = 100;
  const result = processEngagementMetrics(mockInsights, spendAmount);

  console.log("Test results:", result);
  return result;
}
