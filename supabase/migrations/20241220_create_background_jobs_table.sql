-- Create background_jobs table for tracking QStash job status
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id TEXT UNIQUE NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    result_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Add constraints
    CONSTRAINT valid_status CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_progress CHECK (progress >= 0 AND progress <= 100)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_background_jobs_request_id ON background_jobs(request_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_job_type ON background_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.status = 'completed' OR NEW.status = 'failed' OR NEW.status = 'cancelled' THEN
        NEW.completed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_background_jobs_updated_at 
    BEFORE UPDATE ON background_jobs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies (adjust based on your auth setup)
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own jobs
-- Note: You may need to adjust this based on your user authentication setup
CREATE POLICY "Users can view background jobs" ON background_jobs
    FOR SELECT USING (true); -- Adjust this based on your auth requirements

-- Allow the service to insert and update jobs
CREATE POLICY "Service can manage background jobs" ON background_jobs
    FOR ALL USING (true); -- This allows full access - adjust based on your security needs 