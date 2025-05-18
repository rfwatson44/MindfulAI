-- Create a table for daily account metrics
CREATE TABLE IF NOT EXISTS meta_account_daily (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  insights_start_date DATE NOT NULL,
  insights_end_date DATE NOT NULL,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_reach INTEGER DEFAULT 0,
  total_spend DECIMAL(12, 2) DEFAULT 0,
  average_cpc DECIMAL(12, 2) DEFAULT 0,
  average_cpm DECIMAL(12, 2) DEFAULT 0,
  average_ctr DECIMAL(5, 4) DEFAULT 0,
  average_frequency DECIMAL(6, 2) DEFAULT 0,
  actions JSONB DEFAULT '[]'::jsonb,
  action_values JSONB DEFAULT '[]'::jsonb,
  cost_per_action_type JSONB DEFAULT '[]'::jsonb,
  cost_per_unique_click DECIMAL(12, 2) DEFAULT 0,
  outbound_clicks JSONB DEFAULT '[]'::jsonb,
  outbound_clicks_ctr DECIMAL(5, 4) DEFAULT 0,
  website_ctr JSONB DEFAULT '[]'::jsonb,
  website_purchase_roas DECIMAL(12, 2) DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, insights_start_date)
);

-- Create a table for daily campaign metrics
CREATE TABLE IF NOT EXISTS meta_campaign_daily (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  spend DECIMAL(12, 2) DEFAULT 0,
  cpc DECIMAL(12, 2) DEFAULT 0,
  cpm DECIMAL(12, 2) DEFAULT 0,
  ctr DECIMAL(5, 4) DEFAULT 0,
  frequency DECIMAL(6, 2) DEFAULT 0,
  conversions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meta_account_daily_account_id ON meta_account_daily(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_account_daily_date ON meta_account_daily(insights_start_date);

CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_campaign_id ON meta_campaign_daily(campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_account_id ON meta_campaign_daily(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_date ON meta_campaign_daily(date); 