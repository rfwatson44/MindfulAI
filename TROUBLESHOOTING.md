# QStash Background Jobs Troubleshooting Guide

## Issue: Jobs Stuck in "queued" Status

If your background jobs are getting stuck in "queued" status and never progress, follow these debugging steps:

### 1. Check Webhook URL Configuration

The most common issue is incorrect webhook URL generation. Run the debug script:

```bash
node debug-webhook-url.js
```

**Common Problems:**

- Using preview deployment URLs (contains `git-` in the URL)
- Missing production domain configuration
- Incorrect environment variable setup

**Solution:**
Add the correct webhook base URL to your Vercel environment variables:

```bash
WEBHOOK_BASE_URL=https://your-production-domain.com
```

### 2. Verify Environment Variables

Check that all required environment variables are set in Vercel:

**Required for QStash:**

```bash
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key
```

**Required for Webhook URL:**

```bash
WEBHOOK_BASE_URL=https://your-production-domain.com
# OR let it auto-detect using VERCEL_PROJECT_PRODUCTION_URL (set by Vercel)
```

**Required for Meta API:**

```bash
META_ACCESS_TOKEN=your_meta_access_token
```

## Issue: Jobs Timing Out After 90 Seconds

**New in v2.1:** The system now uses aggressive chunked processing to prevent timeouts.

### How Aggressive Chunked Processing Works

The job is broken down into phases with strict time management:

1. **Account Phase** (10-40%): Process account info and insights
2. **Campaigns Phase** (40-60%): Process campaigns in batches of 5
3. **Adsets Phase** (60-80%): Process ad sets in batches of 5 campaigns
4. **Ads Phase** (80-100%): Process individual ads in batches of 5 adsets

**Key Improvements:**

- **60-second time limit** per phase (with 10-second safety buffer)
- **Batch size reduced to 5** items for faster processing
- **Aggressive time checking** before each operation
- **Skip insights** when running low on time to prioritize data structure
- **Immediate follow-up jobs** when approaching time limits

### Debugging Aggressive Chunked Processing

**Check Job Progress:**

```sql
SELECT * FROM background_jobs
WHERE request_id = 'your-request-id'
ORDER BY updated_at DESC;
```

**Look for Time Management in Logs:**

- "Remaining time: XXXXms"
- "Time limit approaching, creating follow-up job immediately"
- "Skipping insights due to time constraints"
- "Time limit reached after processing X items"

**Expected Behavior:**

- **More frequent follow-up jobs** (every 60 seconds max)
- **Faster progress updates** with smaller batches
- **Data prioritization**: Structure first, insights second
- **No 90-second timeouts**

### 3. Check QStash Console

1. Go to [Upstash QStash Console](https://console.upstash.com/qstash)
2. Check the "Messages" tab for your queued jobs
3. Look for multiple messages with the same request_id (this is normal for chunked processing)
4. Verify that webhooks are being sent to the correct URL

### 4. Check Vercel Function Logs

1. Go to your Vercel dashboard
2. Navigate to your project
3. Go to the "Functions" tab
4. Look for logs from `/api/meta-marketing-worker`
5. **For chunked processing**: Look for multiple function executions with the same request_id

**Expected Log Pattern:**

```
=== QStash Worker Started ===
Processing phase: account for account: act_xxx
Processing account phase...
Account data stored successfully
Creating follow-up job for campaigns
=== Background job phase completed successfully ===

[New function execution]
=== QStash Worker Started ===
Processing phase: campaigns for account: act_xxx
Processing campaigns phase, offset: 0
Retrieved 10 campaigns
Processed 10 campaigns
Creating follow-up job for next batch
```

### 5. Test Webhook Endpoint Manually

Test if your webhook endpoint is accessible:

```bash
curl -X POST https://your-domain.com/api/meta-marketing-worker \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "test",
    "timeframe": "24h",
    "action": "get24HourData",
    "requestId": "test-request-id",
    "phase": "account"
  }'
```

**Expected Response:** Should return an error about signature verification (this is normal for manual testing)

### 6. Check Database Connection

Verify that the background_jobs table exists and is accessible:

1. Go to your Supabase dashboard
2. Navigate to the Table Editor
3. Check if the `background_jobs` table exists
4. Verify that jobs are being created with "queued" status

**Check for Multiple Job Records:**
With chunked processing, you should see the same request_id being updated multiple times as phases progress.

### 7. Common Error Messages and Solutions

#### "META_ACCESS_TOKEN environment variable is not set"

- Add `META_ACCESS_TOKEN` to your Vercel environment variables
- Redeploy your application

#### "QStash signature verification failed"

- Check that `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` are set
- Verify the keys are correct in the Upstash console

#### "Error updating job status"

- Check Supabase connection
- Verify RLS policies allow the service to update jobs
- Check if the `background_jobs` table exists

#### "Vercel Runtime Timeout Error: Task timed out after 90 seconds"

**This should no longer happen with chunked processing.** If you see this:

1. Check that the chunked processing logic is working
2. Verify follow-up jobs are being created
3. Look for the "Time limit reached, creating follow-up job" message

#### Webhook URL contains "git-" or preview deployment URL

- Set `WEBHOOK_BASE_URL` to your production domain
- Ensure you're testing on production deployment, not preview

#### "Error creating follow-up job"

- Check QStash token and permissions
- Verify webhook URL is accessible
- Check Vercel function logs for QStash client errors

### 8. Debug Mode

To enable more detailed logging, you can temporarily add debug logs:

1. Check the worker logs in Vercel Functions tab
2. Look for the "=== QStash Worker Started ===" message
3. Follow the log trail to see where the process stops
4. **For chunked processing**: Look for phase transitions and follow-up job creation

### 9. Manual Job Status Check

You can manually check job status in Supabase:

```sql
SELECT * FROM background_jobs
WHERE request_id = 'your-request-id'
ORDER BY created_at DESC;
```

**For chunked processing, you should see:**

- Status progressing from "queued" → "processing" → "completed"
- Progress increasing: 10% → 40% → 60% → 80% → 100%
- Multiple updates with the same request_id

### 10. Reset Stuck Jobs

If you have jobs permanently stuck in "queued" status:

```sql
UPDATE background_jobs
SET status = 'failed',
    error_message = 'Manually reset - was stuck in queued status',
    updated_at = NOW()
WHERE status = 'queued'
AND created_at < NOW() - INTERVAL '1 hour';
```

**For chunked processing stuck jobs:**

```sql
UPDATE background_jobs
SET status = 'failed',
    error_message = 'Manually reset - chunked processing stuck',
    updated_at = NOW()
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '10 minutes'; -- Longer timeout for chunked processing
```

## Chunked Processing Specific Issues

### Issue: Job Stuck at Specific Percentage

**40% (Account → Campaigns transition):**

- Check if follow-up job was created for campaigns phase
- Verify QStash console shows campaign phase jobs
- Check webhook URL accessibility

**60% (Campaigns → Adsets transition):**

- Check if all campaign batches were processed
- Look for "All campaigns processed, starting adsets phase" message
- Verify adsets phase job creation

**80% (Adsets → Ads transition):**

- Similar to campaigns → adsets transition
- Check adsets processing completion

### Issue: Multiple Jobs Running Simultaneously

This is normal for chunked processing, but if you see conflicting updates:

1. Check that request_id is unique per job
2. Verify job creation doesn't create duplicates
3. Look for race conditions in status updates

### Issue: Progress Going Backwards

If progress decreases, it indicates multiple jobs with the same request_id:

1. Check job creation logic in main route
2. Verify duplicate job prevention
3. Look for concurrent job executions

## Quick Fix Checklist

1. ✅ Set `WEBHOOK_BASE_URL` environment variable
2. ✅ Verify all QStash environment variables are set
3. ✅ Check that webhook URL doesn't contain "git-"
4. ✅ Ensure you're testing on production deployment
5. ✅ Verify Meta API token is valid
6. ✅ Check Supabase connection and table exists
7. ✅ Redeploy after environment variable changes
8. ✅ **New**: Monitor chunked processing phases in logs
9. ✅ **New**: Check QStash console for multiple phase jobs

## Still Having Issues?

If jobs are still stuck after following this guide:

1. Check the Vercel function logs for detailed error messages
2. Verify the QStash console shows successful webhook deliveries for all phases
3. Test the webhook endpoint manually with different phases
4. Check if there are any network/firewall issues blocking QStash
5. **For chunked processing**: Verify follow-up jobs are being created and executed

## Contact Support

If you continue to have issues, provide:

- Request ID of a stuck job
- Vercel function logs (all phases)
- QStash console message details for all phases
- Environment variable configuration (without sensitive values)
- Database job status history for the request_id
