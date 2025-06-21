// Hash function để tạo key ngắn gọn từ URL (dùng SHA-1)
async function hashURL(url: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(url));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  } catch (error) {
    logger.error("Failed to hash URL", { url, error });
    // Fallback to simple hash
    return url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  }
}

// URL validation function
function isValidTestFlightURL(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'testflight.apple.com' && urlObj.pathname.startsWith('/join/');
  } catch {
    return false;
  }
}

// GMT+7 timestamp generator
function getGMT7Timestamp(): string {
  const now = new Date();
  const gmt7Offset = 7 * 60; // GMT+7 in minutes
  const localTime = new Date(now.getTime() + (gmt7Offset * 60 * 1000));
  return localTime.toISOString();
}

// Payloads cho Discord
const seatsAvailableAgain = (url: string) => ({
  embeds: [{
    title: "TestFlight Available",
    url,
    type: "rich",
    description: "✅ New TestFlight seats available!",
    color: 0x57f287,
    timestamp: getGMT7Timestamp(),
    footer: { text: "DiscordLookup.com" }
  }],
  components: [{
    type: 1,
    components: [{
      type: 2,
      label: "Join TestFlight",
      style: 5,
      url
    }]
  }]
});

const seatsFull = (url: string) => ({
  embeds: [{
    title: "TestFlight Full",
    url,
    type: "rich",
    description: "🚫 All TestFlight seats are taken again.",
    color: 0xed4245,
    timestamp: getGMT7Timestamp(),
    footer: { text: "DiscordLookup.com" }
  }]
});

const logger = {
  info: (message: string, data?: any) => console.log(JSON.stringify({ level: "INFO", timestamp: getGMT7Timestamp(), message, ...(data && { data }) })),
  error: (message: string, error?: any) => console.error(JSON.stringify({ level: "ERROR", timestamp: getGMT7Timestamp(), message, ...(error && { error: error instanceof Error ? error.message : error }) })),
  warn: (message: string, data?: any) => console.warn(JSON.stringify({ level: "WARN", timestamp: getGMT7Timestamp(), message, ...(data && { data }) })),
  debug: (message: string, data?: any) => console.log(JSON.stringify({ level: "DEBUG", timestamp: getGMT7Timestamp(), message, ...(data && { data }) })),
};

// Rate limiting helper
const rateLimiter = {
  requests: new Map<string, number[]>(),
  
  isAllowed: (key: string, maxRequests: number = 10, windowMs: number = 60000): boolean => {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!rateLimiter.requests.has(key)) {
      rateLimiter.requests.set(key, []);
    }
    
    const requests = rateLimiter.requests.get(key)!;
    const recentRequests = requests.filter(time => time > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    rateLimiter.requests.set(key, recentRequests);
    return true;
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate limiting
    if (!rateLimiter.isAllowed(clientIP, 30, 60000)) {
      logger.warn("Rate limit exceeded", { clientIP, pathname });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { 
        status: 429, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    try {
      if (request.method === "GET" && pathname === "/") {
        logger.info("Root endpoint accessed", { pathname, method: request.method, clientIP });
        return new Response(JSON.stringify({
          service: "TestFlight Watcher",
          status: "running",
          version: "2.0.0",
          endpoints: {
            "/state": "Get all TestFlight statuses",
            "/health": "Health check endpoint",
            "/debug": "Debug information (if enabled)"
          },
          timestamp: getGMT7Timestamp()
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (request.method === "GET" && pathname === "/health") {
        logger.info("Health check endpoint accessed", { pathname, method: request.method, clientIP });
        
        // Check R2 bucket connectivity
        let r2Status = "unknown";
        try {
          const testObj = await env.STATE_BUCKET.get("health-check");
          r2Status = "connected";
        } catch (error) {
          r2Status = "error";
          logger.error("R2 health check failed", { error });
        }

        return new Response(JSON.stringify({
          status: "healthy",
          r2: r2Status,
          discord: env.DISCORD_WEBHOOK_URL ? "configured" : "not_configured",
          timestamp: getGMT7Timestamp()
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (request.method === "GET" && pathname === "/state") {
        logger.info("State endpoint accessed", { pathname, method: request.method, clientIP });
        
        try {
          // Đọc danh sách URL từ R2
          const object = await env.STATE_BUCKET.get("urls.txt");
          if (!object) {
            logger.warn("urls.txt not found in R2 bucket");
            return new Response(JSON.stringify({ 
              error: "No URLs configured", 
              message: "Please upload urls.txt to R2 bucket" 
            }), { 
              status: 404, 
              headers: { "Content-Type": "application/json" } 
            });
          }

          const text = await object.text();
          const urls = text.split("\n").map(l => l.trim()).filter(Boolean);

          if (urls.length === 0) {
            logger.warn("No valid URLs found in urls.txt");
            return new Response(JSON.stringify({ 
              error: "No valid URLs", 
              message: "urls.txt is empty or contains no valid URLs" 
            }), { 
              status: 400, 
              headers: { "Content-Type": "application/json" } 
            });
          }

          // Trả về trạng thái từng app
          const states = [];
          for (const url of urls) {
            if (!isValidTestFlightURL(url)) {
              logger.warn("Invalid TestFlight URL found", { url });
              states.push({ 
                STATE: "INVALID_URL", 
                TIME: getGMT7Timestamp(), 
                url,
                error: "Invalid TestFlight URL format" 
              });
              continue;
            }

            const key = "state-" + await hashURL(url) + ".json";
            const obj = await env.STATE_BUCKET.get(key);
            let state: TestFlightState = { STATE: "UNKNOWN", TIME: getGMT7Timestamp(), url };
            if (obj) {
              try {
                const parsedState = await obj.json() as { STATE: string; TIME: string };
                state = { 
                  STATE: parsedState.STATE as "OPEN" | "FULL" | "UNKNOWN" | "INVALID_URL" | "CORRUPTED", 
                  TIME: parsedState.TIME, 
                  url 
                };
              } catch (error) {
                logger.error("Failed to parse state JSON", { url, key, error });
                state = { STATE: "CORRUPTED", TIME: getGMT7Timestamp(), url, error: "Corrupted state data" };
              }
            }
            states.push(state);
          }
          
          return new Response(JSON.stringify({
            states,
            count: states.length,
            timestamp: getGMT7Timestamp()
          }, null, 2), { headers: { "Content-Type": "application/json" } });
        } catch (error) {
          logger.error("Failed to get states", { error });
          return new Response(JSON.stringify({ 
            error: "Internal server error", 
            message: "Failed to retrieve states" 
          }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
          });
        }
      }

      logger.warn("Unknown endpoint accessed", { pathname, method: request.method, clientIP });
      return new Response(JSON.stringify({ 
        error: "Not Found", 
        message: "Endpoint not found",
        availableEndpoints: ["/", "/state", "/health"]
      }), { 
        status: 404, 
        headers: { "Content-Type": "application/json" } 
      });
    } catch (error) {
      logger.error("Unhandled error in fetch handler", { error, pathname, method: request.method });
      return new Response(JSON.stringify({ 
        error: "Internal server error", 
        message: "An unexpected error occurred" 
      }), { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    logger.info("Scheduled event started", { 
      cron: event.cron, 
      scheduledTime: event.scheduledTime 
    });

    try {
      // 1. Lấy danh sách URL từ R2
      const obj = await env.STATE_BUCKET.get("urls.txt");
      if (!obj) {
        logger.error("urls.txt not found in R2 bucket");
        return;
      }

      const text = await obj.text();
      const urls = text.split("\n").map(l => l.trim()).filter(Boolean);

      if (urls.length === 0) {
        logger.warn("No URLs found in urls.txt");
        return;
      }

      logger.info("Processing URLs", { count: urls.length });

      let processedCount = 0;
      let errorCount = 0;
      let stateChangeCount = 0;

      for (const url of urls) {
        try {
          if (!isValidTestFlightURL(url)) {
            logger.warn("Skipping invalid TestFlight URL", { url });
            errorCount++;
            continue;
          }

          // 2. Fetch từng URL
          let newState: "OPEN" | "FULL" = "FULL";
          try {
            const res = await fetch(url, {
              method: "GET",
              headers: {
                "Accept-Language": "en-US,en;q=0.9",
                "User-Agent": "Mozilla/5.0 (TestFlight MultiChecker)",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Referer": "https://testflight.apple.com/"
              }
            });

            if (!res.ok) {
              logger.error("HTTP error when fetching TestFlight URL", { 
                url, 
                statusCode: res.status, 
                statusText: res.statusText 
              });
              errorCount++;
              continue;
            }

            const html = await res.text();
            newState = html.includes("<span>This beta is full.</span>") ? "FULL" : "OPEN";
            logger.info("Checked TestFlight", { url, newState, statusCode: res.status });
          } catch (err) {
            logger.error("Failed to fetch TestFlight URL", { url, error: err });
            errorCount++;
            continue;
          }

          // 3. Đọc trạng thái trước đó
          const key = "state-" + await hashURL(url) + ".json";
          let previousState = "FULL";
          try {
            const stateObj = await env.STATE_BUCKET.get(key);
            if (stateObj) {
              const json = await stateObj.json() as { STATE: string; TIME: string };
              previousState = json.STATE ?? previousState;
            }
          } catch (error) {
            logger.warn("Failed to read previous state", { url, key, error });
          }

          // 4. Nếu thay đổi trạng thái → lưu mới & gửi Discord
          if (newState !== previousState) {
            const now = getGMT7Timestamp();
            
            try {
              await env.STATE_BUCKET.put(
                key, 
                JSON.stringify({ STATE: newState, TIME: now }), 
                { httpMetadata: { contentType: "application/json" } }
              );
              logger.info("Saved new state to R2", { url, newState, timestamp: now });
            } catch (error) {
              logger.error("Failed to save state to R2", { url, newState, error });
              errorCount++;
              continue;
            }

            if (env.DISCORD_WEBHOOK_URL) {
              try {
                const payload = newState === "FULL" ? seatsFull(url) : seatsAvailableAgain(url);
                const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
                });
                
                if (discordResponse.ok) {
                  logger.info("Discord notification sent", { url, newState, statusCode: discordResponse.status });
                } else {
                  const responseText = await discordResponse.text();
                  logger.error("Discord notification failed", { 
                    url, 
                    newState, 
                    statusCode: discordResponse.status,
                    responseText 
                  });
                }
              } catch (err) {
                logger.error("Failed to send Discord notification", { url, error: err });
              }
            } else {
              logger.warn("Discord webhook not configured, skipping notification", { url, newState });
            }

            stateChangeCount++;
          } else {
            logger.info("No state change detected", { url, currentState: newState });
          }

          processedCount++;
        } catch (error) {
          logger.error("Error processing URL", { url, error });
          errorCount++;
        }
      }

      logger.info("Scheduled event completed", { 
        processedCount, 
        errorCount, 
        stateChangeCount,
        totalUrls: urls.length 
      });
    } catch (error) {
      logger.error("Fatal error in scheduled event", { error });
    }
  }
};