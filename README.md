# Discord TestFlight Watcher

A Cloudflare Worker that monitors Discord TestFlight availability and sends notifications to Discord when seats become available or are taken.

## 🚀 Features

- **Real-time Monitoring**: Checks TestFlight availability every minute
- **Discord Integration**: Sends rich embed notifications with role mentions
- **State Persistence**: Uses Cloudflare R2 to store and track state changes
- **Structured Logging**: Comprehensive JSON-formatted logging for monitoring
- **Cache-Busting**: Ensures fresh data by bypassing all caching layers
- **REST API**: Provides endpoints to check current status

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account with Workers and R2 enabled
- Discord webhook URL

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd worker-testflight-watcher
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Edit `wrangler.toml` and update the following variables:
   ```toml
   [vars]
   TESTFLIGHT_URL = "https://testflight.apple.com/join/YOUR_INVITE_CODE"
   DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
   ```

4. **Set up R2 bucket**
   
   The worker uses an R2 bucket named `testflight-state` to store state information. Make sure this bucket exists in your Cloudflare account.

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TESTFLIGHT_URL` | Discord TestFlight invitation URL | Yes |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for notifications | Yes |

### Discord Role Configuration

Update the role ID in `src/worker.ts`:
```typescript
content: "<@&YOUR_ROLE_ID>", // Replace with your actual role ID
```

### Cron Schedule

The worker runs every minute by default. To modify the schedule, edit `wrangler.toml`:
```toml
[triggers]
crons = ["*/1 * * * *"]  # Every minute
```

## 🚀 Deployment

1. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

2. **Deploy the worker**
   ```bash
   wrangler deploy
   ```

3. **Verify deployment**
   ```bash
   wrangler tail
   ```

## 📡 API Endpoints

### GET `/`
Returns basic service information.
```json
{
  "service": "Discord TestFlight Watcher",
  "status": "running",
  "endpoints": {
    "/state": "Get current TestFlight status"
  }
}
```

### GET `/state`
Returns the current TestFlight status.
```json
{
  "STATE": "OPEN",
  "TIME": "2025-01-21T22:35:02.123Z"
}
```

## 🔍 Monitoring

### Logs
The worker provides structured JSON logging with the following levels:
- **INFO**: Normal operations, state changes, endpoint access
- **WARN**: Non-critical issues, missing configurations
- **ERROR**: Critical failures, network errors, API failures

### Log Format
```json
{
  "level": "INFO",
  "timestamp": "2025-01-21T22:35:02.123Z",
  "message": "TestFlight status checked",
  "data": {
    "url": "https://testflight.apple.com/join/...",
    "newState": "OPEN",
    "statusCode": 200
  }
}
```

### Viewing Logs
```bash
# Real-time logs
wrangler tail

# Specific log level
wrangler tail --format pretty
```

## 🧪 Testing

### Local Development
```bash
# Start local development server
wrangler dev

# Test scheduled function
curl -X POST http://localhost:8787/__scheduled

# Test state endpoint
curl http://localhost:8787/state
```

### Manual Testing
```bash
# Test root endpoint
curl http://localhost:8787/

# Test state endpoint
curl http://localhost:8787/state

# Test unknown endpoint (should return 404)
curl http://localhost:8787/unknown
```

## 📊 Discord Notifications

### Available Seats Notification
When TestFlight seats become available, the worker sends a Discord embed with:
- ✅ Green color indicating availability
- Role mention for notifications
- "Join TestFlight" button
- Timestamp and footer

### Full Seats Notification
When TestFlight becomes full again, the worker sends:
- 🚫 Red color indicating unavailability
- Informational message
- Timestamp and footer

## 🔧 Troubleshooting

### Common Issues

1. **404 Not Found on GET /**
   - This is expected behavior for unknown endpoints
   - Use `/state` endpoint to check status

2. **R2 Bucket Errors**
   - Ensure the R2 bucket `testflight-state` exists
   - Check bucket permissions in Cloudflare dashboard

3. **Discord Webhook Failures**
   - Verify webhook URL is correct and active
   - Check Discord server permissions
   - Ensure role ID is valid

4. **TestFlight Detection Issues**
   - The worker looks for `<span>This beta is full.</span>` in the HTML
   - If TestFlight changes their HTML structure, update the detection logic

### Debug Mode
Enable detailed logging by checking the worker logs:
```bash
wrangler tail --format pretty
```

## 📝 Development

### Project Structure
```
├── src/
│   └── worker.ts          # Main worker code
├── wrangler.toml          # Wrangler configuration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

### Adding New Features
1. Modify `src/worker.ts`
2. Test locally with `wrangler dev`
3. Deploy with `wrangler deploy`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for educational and personal use. Please respect Apple's Terms of Service and Discord's API guidelines. The authors are not responsible for any misuse of this software.

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section
2. Review the logs with `wrangler tail`
3. Open an issue on GitHub with detailed information
4. Include relevant log entries and error messages 