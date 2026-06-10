import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0"]);

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

function isPrivateAddress(address: string) {
  const ipVersion = isIP(address);

  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

export async function validatePublicHttpUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs can be scanned.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  const hostname = normalizeHostname(parsed.hostname);

  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local and private network URLs cannot be scanned.");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Local and private network URLs cannot be scanned.");
    }

    return parsed.toString();
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error("The URL hostname could not be resolved.");
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Local and private network URLs cannot be scanned.");
  }

  return parsed.toString();
}

export function createRequestSafetyGuard() {
  const cache = new Map<string, Promise<boolean>>();

  return async function isSafeRequestUrl(url: string) {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
      return true;
    }

    const key = normalizeHostname(parsed.hostname);
    const cached = cache.get(key);

    if (cached) {
      return cached;
    }

    const safetyCheck = validatePublicHttpUrl(url)
      .then(() => true)
      .catch(() => false);

    cache.set(key, safetyCheck);
    return safetyCheck;
  };
}
