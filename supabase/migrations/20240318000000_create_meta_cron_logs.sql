-- Create meta_cron_logs table
CREATE TABLE IF NOT EXISTS meta_cron_logs (
    id BIGSERIAL PRIMARY KEY,
    execution_time TIMESTAMP WITH TIME ZONE NOT NULL,
    accounts_processed INTEGER NOT NULL,
    successful_accounts INTEGER NOT NULL,
    failed_accounts INTEGER NOT NULL,
    results JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on execution_time for better query performance
CREATE INDEX IF NOT EXISTS idx_meta_cron_logs_execution_time ON meta_cron_logs(execution_time);

-- Add RLS policies
ALTER TABLE meta_cron_logs ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access for authenticated users" 
    ON meta_cron_logs
    FOR SELECT 
    TO authenticated
    USING (true);

-- Allow insert access only to service role
CREATE POLICY "Allow insert for service role only" 
    ON meta_cron_logs
    FOR INSERT 
    TO service_role
    WITH CHECK (true); 