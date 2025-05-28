# Meta Marketing Cron Job Setup

This document explains how to set up and test the daily Meta Marketing data sync cron job.

## Overview

The system automatically fetches Meta Marketing data for all accounts in the `accounts` table every day at midnight UTC. It uses:

- **Vercel Cron Jobs** for scheduling
- **QStash** for reliable background job processing
- **Meta Marketing Worker** for data fetching and processing
- **Supabase** for data storage

## Architecture

```
Vercel Cron (daily) → Cron Endpoint → QStash → Meta Marketing Worker → Supabase
```

1. **Vercel Cron** triggers daily at midnight UTC
2. **Cron Endpoint** (`/api/cron/meta-marketing`) fetches accounts and queues jobs
3. **QStash** reliably delivers jobs to the worker
4. **Meta Marketing Worker** (`/api/meta-marketing-worker`) processes each account
5. **Supabase** stores the fetched data

## Configuration

### Environment Variables

Make sure these environment variables are set in your Vercel deployment:

```bash
# QStash (for background job processing)
QSTASH_TOKEN=your_qstash_token

# Cron Security
CRON_SECRET=your_secure_cron_secret

# Meta API
META_ACCESS_TOKEN=your_meta_access_token

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Webhook Base URL (for QStash callbacks)
WEBHOOK_BASE_URL=https://your-domain.vercel.app
# OR it will auto-detect from:
VERCEL_PROJECT_PRODUCTION_URL=your-domain.vercel.app
NEXTAUTH_URL=https://your-domain.vercel.app
```

### Database Setup

Ensure these tables exist in your Supabase database:

1. **accounts** - Contains account information

   ```sql
   CREATE TABLE accounts (
     account_id TEXT PRIMARY KEY,
     account_name TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

2. **background_jobs** - Tracks job status
3. **meta_cron_logs** - Logs cron executions
4. **meta_account_insights** - Stores account data
5. **meta_campaigns** - Stores campaign data
6. **meta_ad_sets** - Stores adset data
7. **meta_ads** - Stores ad data

## Account ID Format

- **Database Storage**: Store only the numeric part (e.g., `123456789`)
- **Meta API Calls**: Automatically prefixed with `act_` (e.g., `act_123456789`)

The cron job automatically handles this conversion.

## Cron Schedule

The cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/meta-marketing",
      "schedule": "0 0 * * *"
    }
  ]
}
```

This runs daily at midnight UTC (00:00).

## Testing

### 1. Dashboard

Visit `/cron-dashboard` to:

- View configured accounts
- Monitor background jobs
- Check cron execution logs
- Test the cron job manually

### 2. Manual Testing

#### Test Cron Job

```bash
curl -X GET "https://your-domain.vercel.app/api/test-cron"
```

#### Check Job Status

```bash
curl -X GET "https://your-domain.vercel.app/api/job-status?limit=10"
```

#### Add Test Accounts

```bash
curl -X POST "https://your-domain.vercel.app/api/test-accounts" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### 3. Direct Cron Endpoint

```bash
curl -X GET "https://your-domain.vercel.app/api/cron/meta-marketing" \
  -H "x-cron-secret: your_cron_secret"
```

## Data Flow

### 1. Account Processing

- Fetches all accounts from `accounts` table
- Adds `act_` prefix to account IDs
- Creates QStash jobs for each account

### 2. Worker Processing

Each account goes through these phases:

1. **Account Phase**: Fetch account info and insights
2. **Campaigns Phase**: Fetch campaigns and their insights
3. **Adsets Phase**: Fetch adsets and their insights
4. **Ads Phase**: Fetch ads and their insights

### 3. Data Storage

- **24-hour timeframe**: Always fetches last 24 hours of data
- **Incremental updates**: New data overwrites existing data for the same date
- **Error handling**: Failed jobs are retried automatically

## Monitoring

### Logs

- **Vercel Function Logs**: Check Vercel dashboard for cron execution logs
- **QStash Dashboard**: Monitor job delivery and retries
- **Supabase Logs**: Check database operations

### Database Tables

- **meta_cron_logs**: Execution history and results
- **background_jobs**: Individual job status and progress
- **meta\_\***: Actual marketing data

### Dashboard Metrics

- Total accounts configured
- Recent background jobs status
- Cron execution history
- Success/failure rates

## Troubleshooting

### Common Issues

1. **Cron not triggering**

   - Check `vercel.json` configuration
   - Verify deployment includes cron config
   - Check Vercel dashboard for cron logs

2. **Jobs failing**

   - Check QStash dashboard for delivery issues
   - Verify `QSTASH_TOKEN` is correct
   - Check worker endpoint accessibility

3. **Meta API errors**

   - Verify `META_ACCESS_TOKEN` is valid
   - Check account permissions
   - Review rate limiting

4. **Database errors**
   - Check Supabase connection
   - Verify table schemas
   - Review RLS policies

### Debug Steps

1. **Test individual components**:

   ```bash
   # Test cron endpoint
   curl /api/test-cron

   # Test worker directly
   curl -X POST /api/meta-marketing-worker \
     -d '{"accountId":"act_123456789","timeframe":"24h","action":"get24HourData"}'

   # Check job status
   curl /api/job-status
   ```

2. **Check logs**:

   - Vercel function logs
   - QStash delivery logs
   - Supabase query logs

3. **Monitor dashboard**:
   - Visit `/cron-dashboard`
   - Check job statuses
   - Review execution history

## Production Deployment

### Pre-deployment Checklist

- [ ] All environment variables configured
- [ ] Database tables created
- [ ] QStash account set up
- [ ] Meta API access token valid
- [ ] Cron secret configured
- [ ] Webhook URL accessible

### Post-deployment Verification

1. **Test cron manually**: Use `/api/test-cron`
2. **Check first execution**: Wait for midnight UTC or trigger manually
3. **Monitor logs**: Check Vercel and QStash dashboards
4. **Verify data**: Check Supabase tables for new data
5. **Dashboard check**: Use `/cron-dashboard` to monitor

### Scaling Considerations

- **Rate Limiting**: Configured for Meta API limits
- **Batch Processing**: Processes accounts in batches
- **Retry Logic**: Automatic retries for failed jobs
- **Monitoring**: Comprehensive logging and status tracking

## Support

For issues or questions:

1. Check the dashboard at `/cron-dashboard`
2. Review logs in Vercel and QStash dashboards
3. Test individual endpoints manually
4. Check database table contents
