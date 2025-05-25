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

### 3. Check QStash Console

1. Go to [Upstash QStash Console](https://console.upstash.com/qstash)
2. Check the "Messages" tab for your queued jobs
3. Look for error messages or failed delivery attempts
4. Verify that webhooks are being sent to the correct URL

### 4. Check Vercel Function Logs

1. Go to your Vercel dashboard
2. Navigate to your project
3. Go to the "Functions" tab
4. Look for logs from `/api/meta-marketing-worker`
5. Check for any error messages or failed executions

### 5. Test Webhook Endpoint Manually

Test if your webhook endpoint is accessible:

```bash
curl -X POST https://your-domain.com/api/meta-marketing-worker \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "test",
    "timeframe": "24h",
    "action": "get24HourData",
    "requestId": "test-request-id"
  }'
```

**Expected Response:** Should return an error about signature verification (this is normal for manual testing)

### 6. Check Database Connection

Verify that the background_jobs table exists and is accessible:

1. Go to your Supabase dashboard
2. Navigate to the Table Editor
3. Check if the `background_jobs` table exists
4. Verify that jobs are being created with "queued" status

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

#### Webhook URL contains "git-" or preview deployment URL

- Set `WEBHOOK_BASE_URL` to your production domain
- Ensure you're testing on production deployment, not preview

### 8. Debug Mode

To enable more detailed logging, you can temporarily add debug logs:

1. Check the worker logs in Vercel Functions tab
2. Look for the "=== QStash Worker Started ===" message
3. Follow the log trail to see where the process stops

### 9. Manual Job Status Check

You can manually check job status in Supabase:

```sql
SELECT * FROM background_jobs
WHERE request_id = 'your-request-id'
ORDER BY created_at DESC;
```

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

## Quick Fix Checklist

1. ✅ Set `WEBHOOK_BASE_URL` environment variable
2. ✅ Verify all QStash environment variables are set
3. ✅ Check that webhook URL doesn't contain "git-"
4. ✅ Ensure you're testing on production deployment
5. ✅ Verify Meta API token is valid
6. ✅ Check Supabase connection and table exists
7. ✅ Redeploy after environment variable changes

## Still Having Issues?

If jobs are still stuck after following this guide:

1. Check the Vercel function logs for detailed error messages
2. Verify the QStash console shows successful webhook deliveries
3. Test the webhook endpoint manually
4. Check if there are any network/firewall issues blocking QStash

## Contact Support

If you continue to have issues, provide:

- Request ID of a stuck job
- Vercel function logs
- QStash console message details
- Environment variable configuration (without sensitive values)
