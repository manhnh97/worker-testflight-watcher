const seatsAvailableAgain = (env: Env) => ({
  content: "<@&1385996271789281400>", // 🔁 Thay bằng Role ID thật
  allowed_mentions: { parse: ["roles"] },
  embeds: [
    {
      title: "Discord TestFlight",
      url: env.TESTFLIGHT_URL,
      type: "rich",
      description: "✅ New Discord TestFlight seats available!",
      color: 0x57f287,
      timestamp: new Date().toISOString(),
      footer: { text: "DiscordLookup.com" }
    }
  ],
  components: [
    {
      type: 1,
      components: [
        {
          type: 2,
          label: "Join TestFlight",
          style: 5,
          url: env.TESTFLIGHT_URL
        }
      ]
    }
  ]
});

const seatsFull = (env: Env) => ({
  embeds: [
    {
      title: "Discord TestFlight",
      url: env.TESTFLIGHT_URL,
      type: "rich",
      description: "🚫 All Discord TestFlight seats are taken again.",
      color: 0xed4245,
      timestamp: new Date().toISOString(),
      footer: { text: "DiscordLookup.com" }
    }
  ]
});

// Structured logging utility
const logger = {
  info: (message: string, data?: any) => {
    const logEntry = {
      level: "INFO",
      timestamp: new Date().toISOString(),
      message,
      ...(data && { data })
    };
    console.log(JSON.stringify(logEntry));
  },
  error: (message: string, error?: any) => {
    const logEntry = {
      level: "ERROR",
      timestamp: new Date().toISOString(),
      message,
      ...(error && { error: error instanceof Error ? error.message : error })
    };
    console.error(JSON.stringify(logEntry));
  },
  warn: (message: string, data?: any) => {
    const logEntry = {
      level: "WARN",
      timestamp: new Date().toISOString(),
      message,
      ...(data && { data })
    };
    console.warn(JSON.stringify(logEntry));
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/") {
      logger.info("Root endpoint accessed", { pathname, method: request.method });
      return new Response(JSON.stringify({
        service: "Discord TestFlight Watcher",
        status: "running",
        endpoints: {
          "/state": "Get current TestFlight status"
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (request.method === "GET" && pathname === "/state") {
      logger.info("State endpoint accessed", { pathname, method: request.method });
      const object = await env.STATE_BUCKET.get("state.json");
      const json = object
        ? await object.text()
        : JSON.stringify({ STATE: "UNKNOWN", TIME: new Date(0).toISOString() });

      return new Response(json, {
        headers: { "Content-Type": "application/json" }
      });
    }

    logger.warn("Unknown endpoint accessed", { pathname, method: request.method });
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const url = env.TESTFLIGHT_URL;
    const r2Key = "state.json";

    let newState: "OPEN" | "FULL" = "FULL";

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "Referer": "https://testflight.apple.com/"
        }
      });

      const html = await res.text();
      newState = html.includes("<span>This beta is full.</span>") ? "FULL" : "OPEN";
      logger.info("TestFlight status checked", { url, newState, statusCode: res.status });
    } catch (err) {
      logger.error("Failed to fetch TestFlight URL", err);
      return;
    }

    // Read previous state from R2
    let previousState = "FULL";
    try {
      const obj = await env.STATE_BUCKET.get(r2Key);
      if (obj) {
        const json = await obj.json() as { STATE: string; TIME: string };
        previousState = json.STATE ?? previousState;
        logger.info("Previous state retrieved from R2", { previousState, lastUpdate: json.TIME });
      } else {
        logger.info("No previous state found in R2, using default", { defaultState: previousState });
      }
    } catch (err) {
      logger.warn("Failed to read previous state from R2, using default", { error: err, defaultState: previousState });
    }

    if (newState !== previousState) {
      const now = new Date().toISOString();

      // Save new state to R2
      try {
        await env.STATE_BUCKET.put(
          r2Key,
          JSON.stringify({ STATE: newState, TIME: now }),
          { httpMetadata: { contentType: "application/json" } }
        );
        logger.info("New state saved to R2", { newState, timestamp: now });
      } catch (err) {
        logger.error("Failed to save new state to R2", err);
      }

      // Notify Discord
      if (env.DISCORD_WEBHOOK_URL) {
        try {
          const payload = newState === "FULL" ? seatsFull(env) : seatsAvailableAgain(env);
          const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          
          if (discordResponse.ok) {
            logger.info("Discord notification sent successfully", { 
              newState, 
              statusCode: discordResponse.status 
            });
          } else {
            logger.error("Discord notification failed", { 
              newState, 
              statusCode: discordResponse.status,
              statusText: discordResponse.statusText 
            });
          }
        } catch (err) {
          logger.error("Failed to send Discord notification", err);
        }
      } else {
        logger.warn("Discord webhook URL not configured, skipping notification", { newState });
      }

      logger.info("State change detected and processed", { 
        previousState, 
        newState, 
        timestamp: now 
      });
    } else {
      logger.info("No state change detected", { 
        currentState: newState, 
        timestamp: new Date().toISOString() 
      });
    }
  }
};
