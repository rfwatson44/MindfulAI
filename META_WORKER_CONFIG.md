# Meta Marketing Worker Configuration

## Environment Variables

Add these to your `.env.local` file to configure the Meta Marketing Worker:

```bash
# Meta Marketing Worker Configuration
META_WORKER_MAX_TIME=45000              # Maximum processing time (45 seconds)
META_WORKER_SAFETY_BUFFER=10000         # Safety buffer before timeout (10 seconds)
META_WORKER_MAX_ITEMS=25                # Maximum items per chunk
META_WORKER_MAX_MEMORY=400              # Memory limit in MB
META_WORKER_TIME_CHECK=3                # Time check interval
META_WORKER_BATCH_SIZE=50               # Batch size for processing
META_WORKER_MIN_DELAY=150               # Minimum delay between API calls
META_WORKER_BURST_DELAY=300             # Delay for burst requests
META_WORKER_INSIGHTS_DELAY=600          # Delay for insights requests
META_WORKER_CAMPAIGN_DELAY=200          # Delay between campaign processing
META_WORKER_ADSET_DELAY=250             # Delay between adset processing
META_WORKER_AD_DELAY=300                # Delay between ad processing
META_WORKER_MEMORY_CHECK=10             # Memory check interval

# Dynamic Iteration Management (NEW!)
MAX_WORKER_ITERATIONS=300               # Base iteration limit (increased from 100)
MAX_ABSOLUTE_ITERATIONS=1000            # Absolute maximum to prevent runaway jobs
```

## Dynamic Iteration System

### How It Works

The worker now uses a **dynamic iteration system** that adapts to your account size:

- **Small accounts** (< 50 campaigns): Base limit × 1.0
- **Medium accounts** (50-200 campaigns): Base limit × 1.5
- **Large accounts** (200-500 campaigns): Base limit × 2.0
- **Very large accounts** (500-1000 campaigns): Base limit × 2.5
- **Enterprise accounts** (1000+ campaigns): Base limit × 3.0

### Phase Multipliers

Different phases get different limits based on typical data volume:

- **Account phase**: 1.0× (quick account info)
- **Campaigns phase**: 1.2× (moderate data)
- **Adsets phase**: 1.5× (more data)
- **Ads phase**: 2.0× (most data)

### Per-Account Processing

**Important**: Each account gets its own iteration counter. If you have 10 accounts running simultaneously:

- Account A can use up to its calculated limit (e.g., 600 iterations)
- Account B can use up to its calculated limit (e.g., 900 iterations)
- Account C can use up to its calculated limit (e.g., 300 iterations)

They don't interfere with each other!

## Example Calculations

### Small Account (30 campaigns)

- Base: 300
- Size multiplier: 1.0
- Ads phase: 300 × 1.0 × 2.0 = **600 iterations**

### Large Account (800 campaigns)

- Base: 300
- Size multiplier: 2.5
- Ads phase: 300 × 2.5 × 2.0 = **1500 iterations** (capped at 1000)

## Recent Changes

### Dynamic Iteration Management

- **NEW**: Intelligent iteration limits based on account size
- **NEW**: Phase-specific multipliers for optimal processing
- **NEW**: Per-account iteration tracking (not global)
- Increased base limit from 100 to 300
- Added absolute maximum safety cap at 1000

### Performance Improvements

- Increased batch sizes for better throughput
- Improved memory management
- Enhanced timeout prevention
- Better processing efficiency for large accounts

### Error Handling

- Graceful completion when approaching limits
- Better circuit breaker implementation
- Improved error logging and recovery
- No more hard failures on iteration limits

## Troubleshooting

### 500 Internal Server Error

- ✅ **FIXED**: Dynamic limits prevent iteration failures
- Check memory usage in logs if issues persist
- Verify Vercel function timeout settings

### Large Account Processing

- The system now automatically adapts to account size
- Very large accounts get higher iteration limits
- Processing continues gracefully even at limits

### Cron Job Concerns

- Each cron job (per account) gets independent iteration limits
- Multiple accounts can run simultaneously without interference
- Total system load is distributed across accounts

### Configuration Tuning

- Increase `MAX_WORKER_ITERATIONS` for larger base limits
- Adjust `MAX_ABSOLUTE_ITERATIONS` for safety cap
- Monitor logs for dynamic limit calculations
