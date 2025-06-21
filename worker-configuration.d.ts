interface Env {
  STATE_BUCKET: R2Bucket;
  DISCORD_WEBHOOK_URL?: string;
  // TESTFLIGHT_URL?: string; // Không bắt buộc nếu đã chuyển sang dùng urls.txt trên R2
}

// Enhanced type definitions for better type safety
interface TestFlightState {
  STATE: "OPEN" | "FULL" | "UNKNOWN" | "INVALID_URL" | "CORRUPTED";
  TIME: string;
  url: string;
  error?: string;
}

interface StateResponse {
  states: TestFlightState[];
  count: number;
  timestamp: string;
}

interface HealthResponse {
  status: "healthy" | "unhealthy";
  r2: "connected" | "error" | "unknown";
  discord: "configured" | "not_configured";
  timestamp: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  availableEndpoints?: string[];
}

interface RootResponse {
  service: string;
  status: string;
  version: string;
  endpoints: Record<string, string>;
  timestamp: string;
}

// Rate limiting types
interface RateLimitInfo {
  requests: Map<string, number[]>;
  isAllowed: (key: string, maxRequests?: number, windowMs?: number) => boolean;
}

// Logging types
interface LogEntry {
  level: "INFO" | "ERROR" | "WARN" | "DEBUG";
  timestamp: string;
  message: string;
  data?: any;
  error?: any;
}

interface Logger {
  info: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  warn: (message: string, data?: any) => void;
  debug: (message: string, data?: any) => void;
}
