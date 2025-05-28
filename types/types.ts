export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_id: string;
          account_name: string;
        };
        Insert: {
          account_id: string;
          account_name: string;
        };
        Update: {
          account_id?: string;
          account_name?: string;
        };
        Relationships: [];
      };
      ad_engagement_metrics: {
        Row: {
          ad_id: string;
          avg_watch_time_seconds: number | null;
          cost_per_2sec_view: number | null;
          cost_per_3sec_view: number | null;
          cost_per_link_click: number | null;
          cost_per_page_engagement: number | null;
          cost_per_post_comment: number | null;
          cost_per_post_engagement: number | null;
          cost_per_thruplay: number | null;
          created_at: string | null;
          date: string;
          hook_rate_percentage: number | null;
          id: number;
          inline_link_clicks: number | null;
          inline_post_engagement: number | null;
          page_engagement: number | null;
          post_comments: number | null;
          post_engagement: number | null;
          three_sec_video_views: number | null;
          thruplays: number | null;
          two_sec_video_views: number | null;
          updated_at: string | null;
          video_25_percent_watched: number | null;
          video_30s_watched: number | null;
          video_50_percent_watched: number | null;
          video_75_percent_watched: number | null;
          video_95_percent_watched: number | null;
          vtr_percentage: number | null;
        };
        Insert: {
          ad_id: string;
          avg_watch_time_seconds?: number | null;
          cost_per_2sec_view?: number | null;
          cost_per_3sec_view?: number | null;
          cost_per_link_click?: number | null;
          cost_per_page_engagement?: number | null;
          cost_per_post_comment?: number | null;
          cost_per_post_engagement?: number | null;
          cost_per_thruplay?: number | null;
          created_at?: string | null;
          date: string;
          hook_rate_percentage?: number | null;
          id?: number;
          inline_link_clicks?: number | null;
          inline_post_engagement?: number | null;
          page_engagement?: number | null;
          post_comments?: number | null;
          post_engagement?: number | null;
          three_sec_video_views?: number | null;
          thruplays?: number | null;
          two_sec_video_views?: number | null;
          updated_at?: string | null;
          video_25_percent_watched?: number | null;
          video_30s_watched?: number | null;
          video_50_percent_watched?: number | null;
          video_75_percent_watched?: number | null;
          video_95_percent_watched?: number | null;
          vtr_percentage?: number | null;
        };
        Update: {
          ad_id?: string;
          avg_watch_time_seconds?: number | null;
          cost_per_2sec_view?: number | null;
          cost_per_3sec_view?: number | null;
          cost_per_link_click?: number | null;
          cost_per_page_engagement?: number | null;
          cost_per_post_comment?: number | null;
          cost_per_post_engagement?: number | null;
          cost_per_thruplay?: number | null;
          created_at?: string | null;
          date?: string;
          hook_rate_percentage?: number | null;
          id?: number;
          inline_link_clicks?: number | null;
          inline_post_engagement?: number | null;
          page_engagement?: number | null;
          post_comments?: number | null;
          post_engagement?: number | null;
          three_sec_video_views?: number | null;
          thruplays?: number | null;
          two_sec_video_views?: number | null;
          updated_at?: string | null;
          video_25_percent_watched?: number | null;
          video_30s_watched?: number | null;
          video_50_percent_watched?: number | null;
          video_75_percent_watched?: number | null;
          video_95_percent_watched?: number | null;
          vtr_percentage?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ad_engagement_metrics_ad_id_fkey";
            columns: ["ad_id"];
            isOneToOne: false;
            referencedRelation: "meta_ads";
            referencedColumns: ["ad_id"];
          }
        ];
      };
      api_cache: {
        Row: {
          created_at: string;
          endpoint: string;
          expires_at: string;
          id: string;
          last_accessed_at: string;
          parameters: Json;
          response: Json;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          expires_at: string;
          id?: string;
          last_accessed_at?: string;
          parameters: Json;
          response: Json;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          expires_at?: string;
          id?: string;
          last_accessed_at?: string;
          parameters?: Json;
          response?: Json;
        };
        Relationships: [];
      };
      api_errors: {
        Row: {
          created_at: string;
          endpoint: string;
          error_code: string | null;
          error_details: Json | null;
          error_message: string;
          id: string;
          request_data: Json | null;
          request_id: string | null;
          stack_trace: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          error_code?: string | null;
          error_details?: Json | null;
          error_message: string;
          id?: string;
          request_data?: Json | null;
          request_id?: string | null;
          stack_trace?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          error_code?: string | null;
          error_details?: Json | null;
          error_message?: string;
          id?: string;
          request_data?: Json | null;
          request_id?: string | null;
          stack_trace?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      api_logs: {
        Row: {
          endpoint: string;
          error_message: string | null;
          id: string;
          status: number;
          timestamp: string;
        };
        Insert: {
          endpoint: string;
          error_message?: string | null;
          id?: string;
          status: number;
          timestamp?: string;
        };
        Update: {
          endpoint?: string;
          error_message?: string | null;
          id?: string;
          status?: number;
          timestamp?: string;
        };
        Relationships: [];
      };
      api_metrics: {
        Row: {
          created_at: string;
          endpoint: string;
          id: string;
          request_id: string | null;
          response_time_ms: number;
          status_code: number;
          success: boolean;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          id?: string;
          request_id?: string | null;
          response_time_ms: number;
          status_code: number;
          success: boolean;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          id?: string;
          request_id?: string | null;
          response_time_ms?: number;
          status_code?: number;
          success?: boolean;
          user_id?: string | null;
        };
        Relationships: [];
      };
      background_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string | null;
          error_message: string | null;
          id: string;
          job_type: string;
          progress: number | null;
          request_id: string;
          result_data: Json | null;
          status: string;
          updated_at: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string | null;
          error_message?: string | null;
          id?: string;
          job_type: string;
          progress?: number | null;
          request_id: string;
          result_data?: Json | null;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string | null;
          error_message?: string | null;
          id?: string;
          job_type?: string;
          progress?: number | null;
          request_id?: string;
          result_data?: Json | null;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      facebook_config: {
        Row: {
          access_token: string;
          api_version: string | null;
          created_at: string;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          access_token: string;
          api_version?: string | null;
          created_at?: string;
          id?: string;
          updated_at?: string | null;
        };
        Update: {
          access_token?: string;
          api_version?: string | null;
          created_at?: string;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      meta_account_insights: {
        Row: {
          account_id: string;
          account_status: number | null;
          action_values: Json | null;
          actions: Json | null;
          amount_spent: number | null;
          average_cpc: number | null;
          average_cpm: number | null;
          average_ctr: string | null;
          average_frequency: string | null;
          balance: number | null;
          business_country_code: string | null;
          cost_per_action_type: Json | null;
          cost_per_unique_click: string | null;
          created_at: string | null;
          currency: string | null;
          disable_reason: string | null;
          id: string;
          insights_end_date: string | null;
          insights_start_date: string | null;
          is_data_complete: boolean | null;
          is_prepay_account: boolean | null;
          last_updated: string | null;
          name: string;
          outbound_clicks: Json | null;
          outbound_clicks_ctr: string | null;
          roas: number | null;
          spend_cap: number | null;
          tax_id_status: string | null;
          timezone_name: string | null;
          timezone_offset_hours_utc: string | null;
          total_clicks: number | null;
          total_conversions: Json | null;
          total_impressions: number | null;
          total_reach: number | null;
          total_spend: string | null;
          updated_at: string | null;
          website_ctr: Json | null;
          website_purchase_roas: string | null;
        };
        Insert: {
          account_id: string;
          account_status?: number | null;
          action_values?: Json | null;
          actions?: Json | null;
          amount_spent?: number | null;
          average_cpc?: number | null;
          average_cpm?: number | null;
          average_ctr?: string | null;
          average_frequency?: string | null;
          balance?: number | null;
          business_country_code?: string | null;
          cost_per_action_type?: Json | null;
          cost_per_unique_click?: string | null;
          created_at?: string | null;
          currency?: string | null;
          disable_reason?: string | null;
          id?: string;
          insights_end_date?: string | null;
          insights_start_date?: string | null;
          is_data_complete?: boolean | null;
          is_prepay_account?: boolean | null;
          last_updated?: string | null;
          name: string;
          outbound_clicks?: Json | null;
          outbound_clicks_ctr?: string | null;
          roas?: number | null;
          spend_cap?: number | null;
          tax_id_status?: string | null;
          timezone_name?: string | null;
          timezone_offset_hours_utc?: string | null;
          total_clicks?: number | null;
          total_conversions?: Json | null;
          total_impressions?: number | null;
          total_reach?: number | null;
          total_spend?: string | null;
          updated_at?: string | null;
          website_ctr?: Json | null;
          website_purchase_roas?: string | null;
        };
        Update: {
          account_id?: string;
          account_status?: number | null;
          action_values?: Json | null;
          actions?: Json | null;
          amount_spent?: number | null;
          average_cpc?: number | null;
          average_cpm?: number | null;
          average_ctr?: string | null;
          average_frequency?: string | null;
          balance?: number | null;
          business_country_code?: string | null;
          cost_per_action_type?: Json | null;
          cost_per_unique_click?: string | null;
          created_at?: string | null;
          currency?: string | null;
          disable_reason?: string | null;
          id?: string;
          insights_end_date?: string | null;
          insights_start_date?: string | null;
          is_data_complete?: boolean | null;
          is_prepay_account?: boolean | null;
          last_updated?: string | null;
          name?: string;
          outbound_clicks?: Json | null;
          outbound_clicks_ctr?: string | null;
          roas?: number | null;
          spend_cap?: number | null;
          tax_id_status?: string | null;
          timezone_name?: string | null;
          timezone_offset_hours_utc?: string | null;
          total_clicks?: number | null;
          total_conversions?: Json | null;
          total_impressions?: number | null;
          total_reach?: number | null;
          total_spend?: string | null;
          updated_at?: string | null;
          website_ctr?: Json | null;
          website_purchase_roas?: string | null;
        };
        Relationships: [];
      };
      meta_ad_sets: {
        Row: {
          account_id: string | null;
          ad_set_id: string;
          attribution_spec: Json | null;
          bid_amount: number | null;
          bid_strategy: string | null;
          billing_event: string | null;
          campaign_id: string;
          clicks: number | null;
          configured_status: string | null;
          conversions: Json | null;
          cost_per_conversion: number | null;
          created_at: string | null;
          daily_budget: number | null;
          destination_type: string | null;
          effective_status: string | null;
          end_time: string | null;
          frequency_control_specs: Json | null;
          id: string;
          impressions: number | null;
          is_dynamic_creative: boolean | null;
          issues_info: Json[] | null;
          last_updated: string | null;
          learning_stage_info: Json | null;
          lifetime_budget: number | null;
          name: string;
          optimization_goal: string | null;
          pacing_type: string[] | null;
          promoted_object: Json | null;
          reach: number | null;
          source_adset_id: string | null;
          spend: number | null;
          start_time: string | null;
          status: string;
          targeting: Json | null;
          targeting_optimization_types: string[] | null;
          updated_at: string | null;
          use_new_app_click: boolean | null;
        };
        Insert: {
          account_id?: string | null;
          ad_set_id: string;
          attribution_spec?: Json | null;
          bid_amount?: number | null;
          bid_strategy?: string | null;
          billing_event?: string | null;
          campaign_id: string;
          clicks?: number | null;
          configured_status?: string | null;
          conversions?: Json | null;
          cost_per_conversion?: number | null;
          created_at?: string | null;
          daily_budget?: number | null;
          destination_type?: string | null;
          effective_status?: string | null;
          end_time?: string | null;
          frequency_control_specs?: Json | null;
          id?: string;
          impressions?: number | null;
          is_dynamic_creative?: boolean | null;
          issues_info?: Json[] | null;
          last_updated?: string | null;
          learning_stage_info?: Json | null;
          lifetime_budget?: number | null;
          name: string;
          optimization_goal?: string | null;
          pacing_type?: string[] | null;
          promoted_object?: Json | null;
          reach?: number | null;
          source_adset_id?: string | null;
          spend?: number | null;
          start_time?: string | null;
          status: string;
          targeting?: Json | null;
          targeting_optimization_types?: string[] | null;
          updated_at?: string | null;
          use_new_app_click?: boolean | null;
        };
        Update: {
          account_id?: string | null;
          ad_set_id?: string;
          attribution_spec?: Json | null;
          bid_amount?: number | null;
          bid_strategy?: string | null;
          billing_event?: string | null;
          campaign_id?: string;
          clicks?: number | null;
          configured_status?: string | null;
          conversions?: Json | null;
          cost_per_conversion?: number | null;
          created_at?: string | null;
          daily_budget?: number | null;
          destination_type?: string | null;
          effective_status?: string | null;
          end_time?: string | null;
          frequency_control_specs?: Json | null;
          id?: string;
          impressions?: number | null;
          is_dynamic_creative?: boolean | null;
          issues_info?: Json[] | null;
          last_updated?: string | null;
          learning_stage_info?: Json | null;
          lifetime_budget?: number | null;
          name?: string;
          optimization_goal?: string | null;
          pacing_type?: string[] | null;
          promoted_object?: Json | null;
          reach?: number | null;
          source_adset_id?: string | null;
          spend?: number | null;
          start_time?: string | null;
          status?: string;
          targeting?: Json | null;
          targeting_optimization_types?: string[] | null;
          updated_at?: string | null;
          use_new_app_click?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "meta_ad_sets_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "meta_account_insights";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "meta_ad_sets_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "meta_campaigns";
            referencedColumns: ["campaign_id"];
          }
        ];
      };
      meta_ads: {
        Row: {
          account_id: string | null;
          ad_id: string;
          ad_set_id: string | null;
          asset_feed_spec: Json | null;
          campaign_id: string | null;
          clicks: number | null;
          configured_status: string | null;
          conversion_specs: Json | null;
          conversions: Json | null;
          cost_per_conversion: number | null;
          created_at: string | null;
          creative: Json | null;
          creative_id: string | null;
          creative_type: string | null;
          effective_object_story_id: string | null;
          effective_status: string | null;
          engagement_audience: boolean | null;
          image_url: string | null;
          impressions: number | null;
          instagram_permalink_url: string | null;
          issues_info: Json[] | null;
          last_updated: string | null;
          name: string | null;
          object_story_spec: Json | null;
          preview_url: string | null;
          reach: number | null;
          recommendations: Json[] | null;
          source_ad_id: string | null;
          spend: number | null;
          status: string | null;
          template_url: string | null;
          thumbnail_url: string | null;
          tracking_and_conversion_specs: Json | null;
          tracking_specs: Json | null;
          updated_at: string | null;
          url_tags: string | null;
          video_id: string | null;
        };
        Insert: {
          account_id?: string | null;
          ad_id: string;
          ad_set_id?: string | null;
          asset_feed_spec?: Json | null;
          campaign_id?: string | null;
          clicks?: number | null;
          configured_status?: string | null;
          conversion_specs?: Json | null;
          conversions?: Json | null;
          cost_per_conversion?: number | null;
          created_at?: string | null;
          creative?: Json | null;
          creative_id?: string | null;
          creative_type?: string | null;
          effective_object_story_id?: string | null;
          effective_status?: string | null;
          engagement_audience?: boolean | null;
          image_url?: string | null;
          impressions?: number | null;
          instagram_permalink_url?: string | null;
          issues_info?: Json[] | null;
          last_updated?: string | null;
          name?: string | null;
          object_story_spec?: Json | null;
          preview_url?: string | null;
          reach?: number | null;
          recommendations?: Json[] | null;
          source_ad_id?: string | null;
          spend?: number | null;
          status?: string | null;
          template_url?: string | null;
          thumbnail_url?: string | null;
          tracking_and_conversion_specs?: Json | null;
          tracking_specs?: Json | null;
          updated_at?: string | null;
          url_tags?: string | null;
          video_id?: string | null;
        };
        Update: {
          account_id?: string | null;
          ad_id?: string;
          ad_set_id?: string | null;
          asset_feed_spec?: Json | null;
          campaign_id?: string | null;
          clicks?: number | null;
          configured_status?: string | null;
          conversion_specs?: Json | null;
          conversions?: Json | null;
          cost_per_conversion?: number | null;
          created_at?: string | null;
          creative?: Json | null;
          creative_id?: string | null;
          creative_type?: string | null;
          effective_object_story_id?: string | null;
          effective_status?: string | null;
          engagement_audience?: boolean | null;
          image_url?: string | null;
          impressions?: number | null;
          instagram_permalink_url?: string | null;
          issues_info?: Json[] | null;
          last_updated?: string | null;
          name?: string | null;
          object_story_spec?: Json | null;
          preview_url?: string | null;
          reach?: number | null;
          recommendations?: Json[] | null;
          source_ad_id?: string | null;
          spend?: number | null;
          status?: string | null;
          template_url?: string | null;
          thumbnail_url?: string | null;
          tracking_and_conversion_specs?: Json | null;
          tracking_specs?: Json | null;
          updated_at?: string | null;
          url_tags?: string | null;
          video_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meta_ads_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "meta_account_insights";
            referencedColumns: ["account_id"];
          },
          {
            foreignKeyName: "meta_ads_ad_set_id_fkey";
            columns: ["ad_set_id"];
            isOneToOne: false;
            referencedRelation: "meta_ad_sets";
            referencedColumns: ["ad_set_id"];
          },
          {
            foreignKeyName: "meta_ads_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "meta_campaigns";
            referencedColumns: ["campaign_id"];
          }
        ];
      };
      meta_api_metrics: {
        Row: {
          account_id: string;
          call_type: string;
          endpoint: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          points_used: number;
          success: boolean;
          timestamp: string | null;
        };
        Insert: {
          account_id: string;
          call_type: string;
          endpoint: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          points_used: number;
          success: boolean;
          timestamp?: string | null;
        };
        Update: {
          account_id?: string;
          call_type?: string;
          endpoint?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          points_used?: number;
          success?: boolean;
          timestamp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meta_api_metrics_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "meta_account_insights";
            referencedColumns: ["account_id"];
          }
        ];
      };
      meta_api_pings: {
        Row: {
          account_id: string;
          created_at: string;
          details: Json | null;
          error: string | null;
          id: number;
          successful: boolean;
          timestamp: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          details?: Json | null;
          error?: string | null;
          id?: never;
          successful: boolean;
          timestamp?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          details?: Json | null;
          error?: string | null;
          id?: never;
          successful?: boolean;
          timestamp?: string;
        };
        Relationships: [];
      };
      meta_campaigns: {
        Row: {
          account_id: string;
          bid_strategy: string | null;
          budget_remaining: number | null;
          buying_type: string | null;
          campaign_id: string;
          clicks: number | null;
          configured_status: string | null;
          conversions: Json | null;
          cost_per_conversion: number | null;
          created_at: string | null;
          daily_budget: number | null;
          effective_status: string | null;
          end_time: string | null;
          id: string;
          impressions: number | null;
          last_updated: string | null;
          lifetime_budget: number | null;
          name: string;
          objective: string;
          pacing_type: string[] | null;
          promoted_object: Json | null;
          reach: number | null;
          recommendations: Json | null;
          source_campaign_id: string | null;
          special_ad_categories: string[] | null;
          spend: number | null;
          spend_cap: number | null;
          start_time: string | null;
          status: string;
          topline_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          account_id: string;
          bid_strategy?: string | null;
          budget_remaining?: number | null;
          buying_type?: string | null;
          campaign_id: string;
          clicks?: number | null;
          configured_status?: string | null;
          conversions?: Json | null;
          cost_per_conversion?: number | null;
          created_at?: string | null;
          daily_budget?: number | null;
          effective_status?: string | null;
          end_time?: string | null;
          id?: string;
          impressions?: number | null;
          last_updated?: string | null;
          lifetime_budget?: number | null;
          name: string;
          objective: string;
          pacing_type?: string[] | null;
          promoted_object?: Json | null;
          reach?: number | null;
          recommendations?: Json | null;
          source_campaign_id?: string | null;
          special_ad_categories?: string[] | null;
          spend?: number | null;
          spend_cap?: number | null;
          start_time?: string | null;
          status: string;
          topline_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          account_id?: string;
          bid_strategy?: string | null;
          budget_remaining?: number | null;
          buying_type?: string | null;
          campaign_id?: string;
          clicks?: number | null;
          configured_status?: string | null;
          conversions?: Json | null;
          cost_per_conversion?: number | null;
          created_at?: string | null;
          daily_budget?: number | null;
          effective_status?: string | null;
          end_time?: string | null;
          id?: string;
          impressions?: number | null;
          last_updated?: string | null;
          lifetime_budget?: number | null;
          name?: string;
          objective?: string;
          pacing_type?: string[] | null;
          promoted_object?: Json | null;
          reach?: number | null;
          recommendations?: Json | null;
          source_campaign_id?: string | null;
          special_ad_categories?: string[] | null;
          spend?: number | null;
          spend_cap?: number | null;
          start_time?: string | null;
          status?: string;
          topline_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "meta_account_insights";
            referencedColumns: ["account_id"];
          }
        ];
      };
      meta_cron_logs: {
        Row: {
          accounts_processed: number;
          created_at: string | null;
          execution_time: string;
          failed_accounts: number;
          id: number;
          results: Json;
          successful_accounts: number;
          updated_at: string | null;
        };
        Insert: {
          accounts_processed: number;
          created_at?: string | null;
          execution_time: string;
          failed_accounts: number;
          id?: number;
          results: Json;
          successful_accounts: number;
          updated_at?: string | null;
        };
        Update: {
          accounts_processed?: number;
          created_at?: string | null;
          execution_time?: string;
          failed_accounts?: number;
          id?: number;
          results?: Json;
          successful_accounts?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      meta_daily_metrics: {
        Row: {
          account_id: string;
          clicks: number | null;
          conversions: Json | null;
          date: string;
          id: number;
          impressions: number | null;
          last_updated: string | null;
          reach: number | null;
          spend: number | null;
        };
        Insert: {
          account_id: string;
          clicks?: number | null;
          conversions?: Json | null;
          date: string;
          id?: number;
          impressions?: number | null;
          last_updated?: string | null;
          reach?: number | null;
          spend?: number | null;
        };
        Update: {
          account_id?: string;
          clicks?: number | null;
          conversions?: Json | null;
          date?: string;
          id?: number;
          impressions?: number | null;
          last_updated?: string | null;
          reach?: number | null;
          spend?: number | null;
        };
        Relationships: [];
      };
      meta_rate_limits: {
        Row: {
          account_id: string;
          business_use_case: string | null;
          call_count: number | null;
          endpoint: string;
          estimated_time_to_regain_access: number | null;
          id: string;
          last_updated: string | null;
          reset_time_duration: number | null;
          total_cputime: number | null;
          total_time: number | null;
          usage_percent: number | null;
        };
        Insert: {
          account_id: string;
          business_use_case?: string | null;
          call_count?: number | null;
          endpoint: string;
          estimated_time_to_regain_access?: number | null;
          id?: string;
          last_updated?: string | null;
          reset_time_duration?: number | null;
          total_cputime?: number | null;
          total_time?: number | null;
          usage_percent?: number | null;
        };
        Update: {
          account_id?: string;
          business_use_case?: string | null;
          call_count?: number | null;
          endpoint?: string;
          estimated_time_to_regain_access?: number | null;
          id?: string;
          last_updated?: string | null;
          reset_time_duration?: number | null;
          total_cputime?: number | null;
          total_time?: number | null;
          usage_percent?: number | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          approved: boolean;
          created_at: string | null;
          id: string;
          role: string;
        };
        Insert: {
          approved?: boolean;
          created_at?: string | null;
          id: string;
          role: string;
        };
        Update: {
          approved?: boolean;
          created_at?: string | null;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string | null;
          id: string;
          is_admin: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id: string;
          is_admin?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_admin?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cleanup_expired_cache: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      get_current_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      log_api_error: {
        Args: {
          p_endpoint: string;
          p_error_message: string;
          p_error_details?: Json;
          p_error_code?: string;
          p_request_data?: Json;
          p_stack_trace?: string;
        };
        Returns: string;
      };
    };
    Enums: {
      campaign_objective:
        | "OUTCOME_AWARENESS"
        | "OUTCOME_ENGAGEMENT"
        | "OUTCOME_SALES"
        | "OUTCOME_LEADS"
        | "OUTCOME_TRAFFIC"
        | "OUTCOME_APP_PROMOTION"
        | "OUTCOME_CONVERSIONS";
      campaign_status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      campaign_objective: [
        "OUTCOME_AWARENESS",
        "OUTCOME_ENGAGEMENT",
        "OUTCOME_SALES",
        "OUTCOME_LEADS",
        "OUTCOME_TRAFFIC",
        "OUTCOME_APP_PROMOTION",
        "OUTCOME_CONVERSIONS",
      ],
      campaign_status: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
    },
  },
} as const;
