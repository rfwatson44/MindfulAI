# Meta Marketing Worker Configuration

Add these environment variables to your Vercel deployment to control worker behavior:

## Safety Configuration (Prevents Infinite Loops)

```
MAX_WORKER_ITERATIONS=20
MAX_CAMPAIGNS_PER_ACCOUNT=500
MAX_ADSETS_PER_CAMPAIGN=200
MAX_ADS_PER_ADSET=100
```

## Performance Configuration

```
WORKER_BATCH_SIZE=25
WORKER_MIN_DELAY=200
WORKER_BURST_DELAY=500
```

## How to Add to Vercel:

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add each variable with its value
5. Redeploy the project

## Safety Features Added:

- ✅ Maximum iteration limit (prevents infinite job creation)
- ✅ Pagination cursor validation (prevents same cursor loops)
- ✅ Entity count limits (prevents processing too much data)
- ✅ Time-based termination (prevents long-running jobs)
- ✅ Circuit breaker capability (can disable worker instantly)

## Emergency Stop:

To immediately stop the worker, set `WORKER_DISABLED=true` in environment variables.
