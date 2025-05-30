# Meta Ads Zero Spend/Impressions Fix

## Problem Description

You're experiencing ads in your `meta_ads` table showing **0 spend** and **0 impressions** when you know there should be actual data. This is a common issue with Meta's Marketing API.

## Root Causes

### 1. **Meta's 72-Hour Data Delay**

- Meta processes conversion data with up to **72 hours delay**
- iOS privacy changes have made this delay more pronounced
- Data attribution can take time to process and appear in API responses

### 2. **Date Range Issues**

- Very long date ranges (6+ months) can cause API timeouts
- Meta's API has different data availability for different time periods
- Some metrics are only available for shorter time ranges

### 3. **API Rate Limiting & Timeouts**

- Heavy API requests can timeout before completing
- Complex metric requests may fail silently
- Rate limits can cause incomplete data fetching

### 4. **Attribution Window Changes**

- iOS 14.5+ privacy changes affected conversion attribution
- Some conversions may not be attributed to the original ad
- Data may appear in different time windows than expected

## Solution Implementation

### 1. **Improved Date Range Strategies**

The fix implements multiple date range strategies:

```typescript
// Account for Meta's 72-hour delay
function getDateRangeWithDelay() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // Account for 72-hour delay
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 33); // 30 days + 3 day delay
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}
```

### 2. **Multiple Fallback Strategies**

The system now tries multiple approaches:

1. **Primary timeframe** (requested range)
2. **30-day delayed range** (accounting for Meta's delay)
3. **7-day range** (most recent reliable data)
4. **Minimal metrics** (basic impressions, clicks, spend only)
5. **Lifetime data** (all-time data for the ad)

### 3. **Data Validation**

```typescript
function hasValidInsightsData(insights: InsightResult): boolean {
  if (!insights) return false;

  const impressions = parseInt(insights.impressions || "0");
  const clicks = parseInt(insights.clicks || "0");
  const spend = parseFloat(insights.spend || "0");

  // Consider data valid if we have impressions OR spend OR clicks
  return impressions > 0 || spend > 0 || clicks > 0;
}
```

## How to Use the Fix

### 1. **Check for Zero Data Issues**

```bash
GET /api/meta-marketing-worker?accountId=act_123456789
```

This will return:

```json
{
  "accountId": "act_123456789",
  "zeroDataAds": 15,
  "ads": [...],
  "message": "Found 15 ads with zero spend and impressions",
  "fixUrl": "/api/meta-marketing-worker?accountId=act_123456789&action=fix-zero-data"
}
```

### 2. **Fix Zero Data Issues**

```bash
GET /api/meta-marketing-worker?accountId=act_123456789&action=fix-zero-data
```

This will:

- Find all ads with 0 spend and 0 impressions
- Try multiple strategies to fetch valid data
- Update the database with correct values
- Return a detailed report

### 3. **Use the React Component**

```tsx
import { MetaZeroDataFixer } from "@/components/meta-zero-data-fixer";

export default function AdminPage() {
  return (
    <div>
      <MetaZeroDataFixer />
    </div>
  );
}
```

## Best Practices

### 1. **Regular Data Validation**

- Run the zero data check weekly
- Monitor for patterns in zero data occurrences
- Set up alerts for high numbers of zero data ads

### 2. **Timing Considerations**

- Wait at least 72 hours before considering data "missing"
- Use delayed date ranges for recent campaigns
- Prefer shorter date ranges for complex metrics

### 3. **API Usage Optimization**

- Use minimal metric sets when possible
- Implement proper rate limiting
- Add delays between requests

### 4. **Monitoring & Alerting**

- Track the number of ads with zero data over time
- Monitor fix success rates
- Alert on high error rates during fixes

## Technical Details

### Rate Limiting

The fix includes improved rate limiting:

- Exponential backoff for rate limit errors
- Special handling for "User request limit reached" errors
- Configurable retry attempts (up to 8 retries)

### Error Handling

- Graceful degradation when complex metrics fail
- Fallback to simpler metric requests
- Detailed error logging and reporting

### Data Integrity

- Validates data before updating database
- Preserves existing data if new data is invalid
- Tracks when insights were last updated

## Monitoring the Fix

### Success Metrics

- Number of ads fixed vs. total ads with zero data
- Reduction in zero data ads over time
- API error rates during fix operations

### Common Errors

- **"No data available"**: Ad may be too new or inactive
- **"Unsupported get request"**: Metric not available for this ad type
- **Rate limit errors**: Too many requests, will retry automatically

## Prevention

### 1. **Improved Initial Data Fetching**

The worker now uses better strategies from the start:

- Multiple date range attempts
- Data validation before storing
- Fallback mechanisms built-in

### 2. **Regular Maintenance**

- Schedule weekly zero data checks
- Implement automated fixing for small numbers
- Manual review for large-scale issues

### 3. **API Best Practices**

- Use appropriate date ranges for different metrics
- Implement proper error handling
- Monitor API usage and limits

## Troubleshooting

### If the fix doesn't work:

1. Check if the ad is actually active and has spend
2. Verify the ad account has proper permissions
3. Try manual API calls with different date ranges
4. Check Meta's API status for known issues

### If you see high error rates:

1. Reduce batch size (currently 50 ads per batch)
2. Increase delays between requests
3. Check API rate limit status
4. Verify access token permissions

## API Endpoints

### Check Zero Data

```
GET /api/meta-marketing-worker?accountId={account_id}
```

### Fix Zero Data

```
GET /api/meta-marketing-worker?accountId={account_id}&action=fix-zero-data
```

Both endpoints return detailed JSON responses with status, counts, and error information.
