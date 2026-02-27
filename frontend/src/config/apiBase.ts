const rawApiUrl = (import.meta.env.VITE_API_URL ?? "").trim();

function isPlaceholderUrl(url: string): boolean {
  return url.includes("your-subdomain.workers.dev");
}

export const API_BASE = isPlaceholderUrl(rawApiUrl) || rawApiUrl.length === 0
  ? "/api"
  : rawApiUrl.replace(/\/+$/, "");
