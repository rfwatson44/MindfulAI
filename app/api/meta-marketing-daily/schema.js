/**
 * Meta Marketing API - Database Schema Definitions
 * This file contains the schema definitions for tables used in the Meta Marketing API
 */

// ad_engagement_metrics table schema
export const adEngagementMetricsSchema = {
  table: "ad_engagement_metrics",
  columns: [
    { name: "ad_id", type: "text", primaryKey: true },
    { name: "date", type: "date", primaryKey: true },

    // Direct metrics from API
    { name: "inline_post_engagement", type: "integer" },
    { name: "inline_link_clicks", type: "integer" },
    { name: "post_comments", type: "integer" },
    { name: "two_sec_video_views", type: "integer" },
    { name: "thruplays", type: "integer" },
    { name: "video_30s_watched", type: "integer" },
    { name: "video_25_percent_watched", type: "integer" },
    { name: "video_50_percent_watched", type: "integer" },
    { name: "video_75_percent_watched", type: "integer" },
    { name: "video_95_percent_watched", type: "integer" },
    { name: "avg_watch_time_seconds", type: "numeric" },

    // Calculated metrics
    { name: "cost_per_post_engagement", type: "numeric" },
    { name: "cost_per_link_click", type: "numeric" },
    { name: "cost_per_post_comment", type: "numeric" },
    { name: "cost_per_2sec_view", type: "numeric" },
    { name: "cost_per_thruplay", type: "numeric" },
    { name: "vtr_percentage", type: "numeric" },
    { name: "hook_rate_percentage", type: "numeric" },

    // Metadata
    { name: "last_updated", type: "timestamp with time zone" },
    { name: "created_at", type: "timestamp with time zone" },
  ],
  foreignKeys: [
    {
      columns: ["ad_id"],
      references: {
        table: "meta_ads",
        columns: ["ad_id"],
      },
    },
  ],
  indexes: [
    { name: "ad_engagement_metrics_ad_id_idx", columns: ["ad_id"] },
    { name: "ad_engagement_metrics_date_idx", columns: ["date"] },
  ],
};
