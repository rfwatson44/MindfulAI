# Timeout Prevention Enhancements

## Problem

The Meta Marketing worker was hitting the 90-second gateway timeout limit, causing `504 Gateway Timeout` errors and incomplete data processing.

## Solution Overview

Enhanced the worker with aggressive time management, better chunking, and configurable timeout settings to prevent gateway timeouts.

## Key Changes

### 1. **Reduced Processing Time Limits**

- **Before**: 80 seconds max processing time
- **After**: 60 seconds max processing time (configurable)
- **Safety Buffer**: Increased from 5s to 8s

### 2. **Enhanced Time Management Functions**

```typescript
// New function to check both time and item limits
function shouldStopProcessing(
  startTime: number,
  itemsProcessed: number
): boolean {
  // Stop if approaching time limit OR processed enough items
  return timeElapsed > timeLimit || itemsProcessed >= MAX_ITEMS_PER_CHUNK;
}
```

### 3. **Aggressive Chunking Strategy**

- **Batch Size**: Reduced from 50 to 25 items
- **Max Items Per Chunk**: 20 items maximum per execution
- **Time Checks**: Every 5 items instead of at end of loops

### 4. **Phase-Specific Improvements**

#### **Campaigns Phase**

- Time checks every item processed
- Immediate follow-up job creation when limits reached
- Better cursor management for pagination

#### **Adsets Phase**

- Time checks every 3 campaigns
- Chunked processing with remaining item tracking
- Enhanced progress reporting

#### **Ads Phase**

- Time checks every 2 adsets
- Individual ad processing with time limits
- Mid-processing follow-up job creation

### 5. **Environment Variable Configuration**

All timeout settings are now configurable via environment variables:

```bash
# Processing time limits
META_WORKER_MAX_TIME=60000          # Max processing time (ms)
META_WORKER_SAFETY_BUFFER=8000      # Safety buffer (ms)

# Batch and chunk sizes
META_WORKER_BATCH_SIZE=25           # Items per batch
META_WORKER_MAX_ITEMS=20            # Max items per chunk

# Delays between operations
META_WORKER_MIN_DELAY=150           # Min delay (ms)
META_WORKER_BURST_DELAY=300         # Burst delay (ms)
META_WORKER_INSIGHTS_DELAY=600      # Insights delay (ms)
META_WORKER_CAMPAIGN_DELAY=200      # Campaign delay (ms)
META_WORKER_ADSET_DELAY=250         # Adset delay (ms)
META_WORKER_AD_DELAY=300            # Ad delay (ms)

# Time management
META_WORKER_TIME_CHECK=5            # Check interval (items)
```

### 6. **Enhanced Logging**

- Real-time remaining time reporting
- Processing progress with item counts
- Clear timeout prevention messages
- Chunking status indicators

## Benefits

### ✅ **Timeout Prevention**

- Aggressive 60s limit with 8s safety buffer
- Proactive follow-up job creation
- No more 504 Gateway Timeout errors

### ✅ **Better Resource Management**

- Smaller chunks prevent memory issues
- Frequent time checks prevent overruns
- Configurable limits for different environments

### ✅ **Improved Reliability**

- Graceful handling of large datasets
- Automatic continuation via follow-up jobs
- Better error recovery and status tracking

### ✅ **Flexibility**

- Environment-based configuration
- Easy tuning for different account sizes
- Development vs production settings

## Usage

### **Production Settings** (Conservative)

```bash
META_WORKER_MAX_TIME=50000          # 50 seconds
META_WORKER_SAFETY_BUFFER=10000     # 10 second buffer
META_WORKER_MAX_ITEMS=15            # 15 items max
```

### **Development Settings** (Faster)

```bash
META_WORKER_MAX_TIME=70000          # 70 seconds
META_WORKER_SAFETY_BUFFER=5000      # 5 second buffer
META_WORKER_MAX_ITEMS=30            # 30 items max
```

### **Large Account Settings** (Very Conservative)

```bash
META_WORKER_MAX_TIME=45000          # 45 seconds
META_WORKER_SAFETY_BUFFER=15000     # 15 second buffer
META_WORKER_MAX_ITEMS=10            # 10 items max
```

## Monitoring

The enhanced worker provides detailed logging for monitoring:

```
⏱️ Time check: 45000ms elapsed, limit: 52000ms
⏱️ Stopping campaigns processing after 15 items due to time/item limits
⚠️ WARNING: Only 3000ms remaining, should create follow-up job
🛑 Stopping processing: Time limit reached (53000ms > 52000ms)
```

## Result

- **No more 504 timeouts**: Aggressive time management prevents gateway timeouts
- **Complete data processing**: Follow-up jobs ensure all data is eventually processed
- **Better performance**: Smaller chunks process faster and more reliably
- **Easy tuning**: Environment variables allow optimization for different scenarios
