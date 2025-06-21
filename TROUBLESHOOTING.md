# Troubleshooting Guide

This guide covers common issues, debugging techniques, and solutions for the TestFlight Watcher Cloudflare Worker.

## 🔍 Quick Diagnostics

### Health Check
```bash
# Check if the worker is running
curl https://your-worker.your-subdomain.workers.dev/health

# Expected response:
{
  "status": "healthy",
  "r2": "connected",
  "discord": "configured",
  "timestamp": "2025-01-21T22:35:02.123Z"
}
```

### Check Current Status
```bash
# Get all TestFlight statuses
curl https://your-worker.your-subdomain.workers.dev/state

# Expected response:
{
  "states": [
    {
      "STATE": "OPEN",
      "TIME": "2025-01-21T22:35:02.123Z",
      "url": "https://testflight.apple.com/join/..."
    }
  ],
  "count": 1,
  "timestamp": "2025-01-21T22:35:02.123Z"
}
```

## 🚨 Common Issues & Solutions

### 1. R2 Bucket Issues

#### Problem: `urls.txt not found in R2 bucket`
**Symptoms:**
- 404 error on `/state` endpoint
- Logs show "urls.txt not found in R2 bucket"

**Solution:**
1. Create the `urls.txt` file in your R2 bucket:
   ```bash
   # Using Wrangler CLI
   echo "https://testflight.apple.com/join/YOUR_INVITE_CODE" | wrangler r2 object put testflight-state/urls.txt
   
   # Or upload via Cloudflare Dashboard
   # Go to R2 > your-bucket > Upload > Create urls.txt with TestFlight URLs
   ```

2. Verify the file exists:
   ```bash
   wrangler r2 object list testflight-state
   ```

#### Problem: R2 connectivity issues
**Symptoms:**
- Health check shows `"r2": "error"`
- Logs show R2 operation failures

**Solution:**
1. Check R2 bucket permissions in `wrangler.toml`:
   ```toml
   [[r2_buckets]]
   binding = "STATE_BUCKET"
   bucket_name = "testflight-state"
   ```

2. Verify bucket exists:
   ```bash
   wrangler r2 bucket list
   ```

3. Test R2 operations:
   ```bash
   # Test read
   wrangler r2 object get testflight-state/urls.txt
   
   # Test write
   echo "test" | wrangler r2 object put testflight-state/test.txt
   ```

### 2. Discord Webhook Issues

#### Problem: Discord notifications not sending
**Symptoms:**
- Logs show "Discord notification failed"
- No notifications in Discord channel

**Solution:**
1. Verify webhook URL in `wrangler.toml`:
   ```toml
   [vars]
   DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
   ```

2. Test webhook manually:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"content":"Test message"}' \
     https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
   ```

3. Check Discord server permissions:
   - Webhook has permission to send messages
   - Bot has access to the channel
   - Role mentions are enabled

#### Problem: Role mentions not working
**Symptoms:**
- Notifications sent but no role mention
- Role ID errors in logs

**Solution:**
1. Update role ID in `src/worker.ts`:
   ```typescript
   content: "<@&YOUR_ACTUAL_ROLE_ID>", // Replace with real role ID
   ```

2. Get correct role ID:
   - Enable Developer Mode in Discord
   - Right-click role → Copy ID
   - Ensure bot has permission to mention the role

### 3. TestFlight Detection Issues

#### Problem: Incorrect status detection
**Symptoms:**
- Worker reports wrong availability status
- No state changes detected

**Solution:**
1. Check TestFlight URL format:
   ```bash
   # URLs should be in format:
   https://testflight.apple.com/join/INVITE_CODE
   ```

2. Verify HTML detection logic:
   - Worker looks for `<span>This beta is full.</span>`
   - If TestFlight changes HTML, update detection

3. Test URL manually:
   ```bash
   curl -H "User-Agent: Mozilla/5.0 (TestFlight MultiChecker)" \
        -H "Accept-Language: en-US,en;q=0.9" \
        https://testflight.apple.com/join/YOUR_INVITE_CODE
   ```

#### Problem: Rate limiting from Apple
**Symptoms:**
- HTTP 429 errors
- Failed to fetch TestFlight URL

**Solution:**
1. Check current rate limiting:
   - Worker includes cache-busting headers
   - Uses realistic User-Agent
   - Respects Apple's terms of service

2. Monitor request frequency:
   - Current cron: every minute
   - Consider reducing frequency if needed

### 4. Worker Deployment Issues

#### Problem: Worker not responding
**Symptoms:**
- 404 errors on all endpoints
- Worker not found

**Solution:**
1. Check deployment status:
   ```bash
   wrangler whoami
   wrangler deployments list
   ```

2. Redeploy worker:
   ```bash
   wrangler deploy
   ```

3. Check worker logs:
   ```bash
   wrangler tail
   ```

#### Problem: TypeScript compilation errors
**Symptoms:**
- Build failures during deployment
- Type errors in logs

**Solution:**
1. Check TypeScript configuration:
   ```bash
   npx tsc --noEmit
   ```

2. Verify type definitions in `worker-configuration.d.ts`

3. Fix type issues in `src/worker.ts`

### 5. Logging & Debugging

#### Problem: Insufficient logging
**Symptoms:**
- Hard to debug issues
- Missing context in logs

**Solution:**
1. Enable debug logging:
   ```typescript
   logger.debug("Debug information", { data });
   ```

2. Check log levels:
   - INFO: Normal operations
   - WARN: Non-critical issues
   - ERROR: Critical failures
   - DEBUG: Detailed debugging

3. View real-time logs:
   ```bash
   wrangler tail --format pretty
   ```

## 🔧 Advanced Debugging

### 1. Local Development Testing

```bash
# Start local development
wrangler dev

# Test endpoints locally
curl http://localhost:8787/health
curl http://localhost:8787/state

# Test scheduled function
curl -X POST http://localhost:8787/__scheduled
```

### 2. Manual R2 Operations

```bash
# List all objects
wrangler r2 object list testflight-state

# Get specific object
wrangler r2 object get testflight-state/urls.txt

# Upload new urls.txt
echo "https://testflight.apple.com/join/YOUR_CODE" | \
  wrangler r2 object put testflight-state/urls.txt

# Delete corrupted state
wrangler r2 object delete testflight-state/state-abc123.json
```

### 3. Network Debugging

```bash
# Test TestFlight URL directly
curl -v -H "User-Agent: Mozilla/5.0 (TestFlight MultiChecker)" \
     -H "Accept-Language: en-US,en;q=0.9" \
     https://testflight.apple.com/join/YOUR_INVITE_CODE

# Check response headers and content
# Look for "This beta is full" in response
```

### 4. Discord Webhook Testing

```bash
# Test webhook with minimal payload
curl -X POST -H "Content-Type: application/json" \
  -d '{"content":"Test notification"}' \
  https://discord.com/api/webhooks/YOUR_WEBHOOK_URL

# Test with embed
curl -X POST -H "Content-Type: application/json" \
  -d '{"embeds":[{"title":"Test","description":"Test embed"}]}' \
  https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
```

## 📊 Monitoring & Alerts

### 1. Key Metrics to Monitor

- **Success Rate**: Percentage of successful TestFlight checks
- **Response Time**: Time to fetch TestFlight pages
- **State Changes**: Frequency of availability changes
- **Error Rate**: Failed operations per time period
- **Discord Delivery**: Success rate of notifications

### 2. Log Analysis

```bash
# Filter logs by level
wrangler tail | grep '"level":"ERROR"'

# Filter by specific URL
wrangler tail | grep "your-testflight-url"

# Count state changes
wrangler tail | grep "State change detected" | wc -l
```

### 3. Health Monitoring

Set up monitoring for:
- Worker uptime (health endpoint)
- R2 bucket connectivity
- Discord webhook availability
- TestFlight URL accessibility

## 🆘 Getting Help

### 1. Before Asking for Help

- Check this troubleshooting guide
- Review recent logs with `wrangler tail`
- Test endpoints manually
- Verify configuration in `wrangler.toml`

### 2. Information to Include

When reporting issues, include:
- Error messages from logs
- Configuration (without sensitive data)
- Steps to reproduce
- Expected vs actual behavior
- Environment details (local vs production)

### 3. Common Debug Commands

```bash
# Check worker status
wrangler whoami
wrangler deployments list

# View logs
wrangler tail --format pretty

# Test locally
wrangler dev

# Check R2
wrangler r2 object list testflight-state

# Validate configuration
wrangler deploy --dry-run
```

## 🔄 Maintenance

### Regular Tasks

1. **Weekly**:
   - Review logs for errors
   - Check TestFlight URLs are still valid
   - Verify Discord webhook is working

2. **Monthly**:
   - Update dependencies
   - Review rate limiting
   - Check for TestFlight HTML changes

3. **As Needed**:
   - Add new TestFlight URLs
   - Update Discord role IDs
   - Adjust cron schedule

### Backup & Recovery

1. **Backup R2 data**:
   ```bash
   wrangler r2 object list testflight-state > backup-list.txt
   ```

2. **Export configuration**:
   ```bash
   cp wrangler.toml wrangler.toml.backup
   ```

3. **Version control**:
   - Keep code in Git
   - Tag stable releases
   - Document configuration changes 