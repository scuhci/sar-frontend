// For debugging:
// export const SAR_BACKEND_URL = "http://localhost:5001";
// export const SAR_IOS_BACKEND_URL = "http://localhost:5002";

// Do not use - we proxy all requests
export const SAR_BACKEND_URL = "https://54.215.190.5:5001";
export const SAR_IOS_BACKEND_URL = "https://54.215.190.5:5002";

// Health check endpoints — TODO: confirm with Vedant before merging.
// Using `/api/` and `/ios/` prefixes so nginx routes them to the right
// backend in production (nginx strips the prefix before forwarding).
export const GPLAY_HEALTH_ENDPOINT = "/api/health/scraper";
export const IOS_HEALTH_ENDPOINT = "/ios/health/scraper";
