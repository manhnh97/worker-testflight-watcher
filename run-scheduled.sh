#!/bin/bash

# Discord TestFlight Watcher - Scheduled Request Script
# This script triggers the scheduled function manually

WORKER_URL="http://localhost:8787"
LOG_FILE="/home/hacke/workspaces/worker-testflight-watcher/scheduled.log"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Check if worker is running
if ! curl -s "$WORKER_URL" > /dev/null 2>&1; then
    log_message "ERROR: Worker not running at $WORKER_URL"
    exit 1
fi

# Trigger scheduled function
log_message "Triggering scheduled function..."
RESPONSE=$(curl -s -X POST "$WORKER_URL/__scheduled")

if [ $? -eq 0 ]; then
    log_message "SUCCESS: Scheduled function executed - $RESPONSE"
else
    log_message "ERROR: Failed to trigger scheduled function"
fi 