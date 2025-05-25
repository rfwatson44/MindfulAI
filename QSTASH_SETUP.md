# QStash Background Jobs Setup Guide

This guide explains how to set up and use QStash for handling long-running Meta Marketing API operations as background jobs.

## Overview

The Meta Marketing API route has been refactored to use QStash background jobs to prevent Vercel's 90-second timeout limit. Instead of processing data synchronously, the API now:

1. Queues a background job with QStash
2. Returns immediately with a job ID and status URL
3. Processes the data in the background worker
4. Allows clients to check progress via the status endpoint

## Environment Variables Required

Add these environment variables to your Vercel project:

### QStash Configuration

```bash
# Required: Get from Upstash QStash Console
QSTASH_TOKEN=your_qstash_token_here

# Required: Get from Upstash QStash Console (for webhook signature verification)
QSTASH_CURRENT_SIGNING_KEY=your_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key
```

### Webhook URL Configuration

```bash
# Option 1: Set explicit webhook base URL (RECOMMENDED for production)
WEBHOOK_BASE_URL=https://your-production-domain.com

# Option 2: Let the system auto-detect (fallback order):
# 1. WEBHOOK_BASE_URL (if set)
# 2. VERCEL_PROJECT_PRODUCTION_URL (auto-set by Vercel)
# 3. NEXTAUTH_URL (if using NextAuth)
# 4. http://localhost:3000 (development fallback)
```

### Important Notes:

- **WEBHOOK_BASE_URL**: Set this to your production domain (e.g., `https://mindfulai.com`) to ensure webhooks work correctly
- **VERCEL_PROJECT_PRODUCTION_URL**: This is automatically set by Vercel to your production domain without the protocol
- **VERCEL_URL**: This contains preview deployment URLs and should NOT be used for webhooks
- For development, the system will fallback to localhost

### Supabase Configuration

Make sure your Supabase connection is properly configured:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Getting QStash Credentials

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new QStash project or use existing one
3. Copy the following from your QStash dashboard:
   - `QSTASH_TOKEN` - Your QStash token
   - `QSTASH_CURRENT_SIGNING_KEY` - Current signing key for webhook verification
   - `QSTASH_NEXT_SIGNING_KEY` - Next signing key for webhook verification

## Database Setup

Run the Supabase migration to create the background jobs table:

```sql
-- This is already created in: supabase/migrations/20241220_create_background_jobs_table.sql
-- Apply it using: supabase db push
```

## API Endpoints

### 1. Start Background Job

```
GET /api/meta-marketing-daily?action=getData&accountId=123&timeframe=24h
```

**Response:**

```json
{
  "message": "Background job started successfully",
  "requestId": "uuid-here",
  "messageId": "qstash-message-id",
  "status": "queued",
  "progress": 0,
  "isBackgroundJob": true,
  "estimatedDuration": "5-15 minutes",
  "checkStatusUrl": "/api/meta-marketing-daily/status?requestId=uuid-here"
}
```

### 2. Check Job Status

```
GET /api/meta-marketing-daily/status?requestId=uuid-here
```

**Response:**

```json
{
  "requestId": "uuid-here",
  "status": "processing", // queued, processing, completed, failed
  "progress": 45,
  "jobType": "meta-marketing-sync",
  "createdAt": "2024-12-20T10:00:00Z",
  "updatedAt": "2024-12-20T10:05:00Z",
  "completedAt": null,
  "errorMessage": null,
  "resultData": null,
  "estimatedTimeRemaining": 300 // seconds
}
```

### 3. Background Worker (Internal)

```
POST /api/meta-marketing-worker
```

This endpoint is called by QStash and handles the actual data processing.

## How It Works

1. **Client Request**: Client calls the main API endpoint
2. **Job Creation**: API creates a job record in Supabase and queues it with QStash
3. **Immediate Response**: API returns job details immediately
4. **Background Processing**: QStash calls the worker endpoint to process data
5. **Progress Updates**: Worker updates job status and progress in Supabase
6. **Status Checking**: Client can poll the status endpoint to check progress
7. **Completion**: When done, results are stored in the job record

## Client-Side Implementation

### Using React Query (Recommended)

```typescript
import { useQuery } from "@tanstack/react-query";

// Start background job
const startMetaSync = async (accountId: string, timeframe: string) => {
  const response = await fetch(
    `/api/meta-marketing-daily?action=getData&accountId=${accountId}&timeframe=${timeframe}`
  );
  return response.json();
};

// Check job status
const checkJobStatus = async (requestId: string) => {
  const response = await fetch(
    `/api/meta-marketing-daily/status?requestId=${requestId}`
  );
  return response.json();
};

// React component
function MetaSyncComponent({ accountId }: { accountId: string }) {
  const [requestId, setRequestId] = useState<string | null>(null);

  // Start job mutation
  const startJobMutation = useMutation({
    mutationFn: ({
      accountId,
      timeframe,
    }: {
      accountId: string;
      timeframe: string;
    }) => startMetaSync(accountId, timeframe),
    onSuccess: (data) => {
      if (data.requestId) {
        setRequestId(data.requestId);
      }
    },
  });

  // Poll job status
  const { data: jobStatus } = useQuery({
    queryKey: ["job-status", requestId],
    queryFn: () => checkJobStatus(requestId!),
    enabled: !!requestId,
    refetchInterval: (data) => {
      // Stop polling when job is complete
      if (data?.status === "completed" || data?.status === "failed") {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });

  const handleStartSync = () => {
    startJobMutation.mutate({ accountId, timeframe: "24h" });
  };

  return (
    <div>
      <button onClick={handleStartSync} disabled={startJobMutation.isPending}>
        {startJobMutation.isPending ? "Starting..." : "Start Meta Sync"}
      </button>

      {jobStatus && (
        <div>
          <p>Status: {jobStatus.status}</p>
          <p>Progress: {jobStatus.progress}%</p>
          {jobStatus.estimatedTimeRemaining && (
            <p>Estimated time remaining: {jobStatus.estimatedTimeRemaining}s</p>
          )}
          {jobStatus.status === "completed" && jobStatus.summary && (
            <div>
              <p>✅ Sync completed!</p>
              <p>Campaigns processed: {jobStatus.summary.totalCampaigns}</p>
              <p>Total items: {jobStatus.summary.totalProcessed}</p>
            </div>
          )}
          {jobStatus.status === "failed" && (
            <p>❌ Error: {jobStatus.errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

## Benefits

1. **No Timeouts**: Background jobs can run for hours if needed
2. **Better UX**: Users get immediate feedback and can track progress
3. **Reliability**: QStash handles retries and failure recovery
4. **Scalability**: Multiple jobs can run concurrently
5. **Monitoring**: Full job history and status tracking

## Monitoring and Debugging

1. **Supabase Dashboard**: Check the `background_jobs` table for job status
2. **QStash Console**: Monitor message delivery and retries
3. **Vercel Logs**: Check function logs for detailed error information
4. **Status Endpoint**: Use the status API to debug job progress

## Rate Limiting

The background worker includes the same rate limiting logic as the original route:

- Exponential backoff for Meta API rate limits
- Configurable delays between requests
- Automatic retry on rate limit errors

## Security

- QStash webhook signatures are verified using the signing keys
- Background jobs table uses RLS (Row Level Security)
- All existing Meta API security measures are maintained

## Troubleshooting

### Common Issues

1. **Job stuck in "queued"**: Check QStash console for delivery issues
2. **Webhook not receiving calls**: Verify VERCEL_URL is correct
3. **Signature verification fails**: Check signing keys are correct
4. **Job fails immediately**: Check Meta API credentials and permissions

### Debug Steps

1. Check Vercel function logs
2. Verify environment variables
3. Test webhook URL manually
4. Check Supabase table permissions
5. Monitor QStash delivery status
