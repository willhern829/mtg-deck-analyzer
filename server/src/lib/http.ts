/**
 * Shared fetch helper: identifies the app per Scryfall's API guidelines,
 * enforces a minimum gap between requests per host, and retries transient
 * failures (429/5xx/network) with exponential backoff.
 */
const USER_AGENT = 'MTGCommanderDeckAnalyzer/1.0 (portfolio project)';

const lastRequestAt = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serialize requests per host so the min-gap rate limit actually holds under concurrency. */
async function withHostSlot(host: string, minGapMs: number): Promise<void> {
  const prev = queues.get(host) ?? Promise.resolve();
  let release!: () => void;
  const slot = new Promise<void>((r) => (release = r));
  queues.set(host, prev.then(() => slot));
  await prev;
  const wait = (lastRequestAt.get(host) ?? 0) + minGapMs - Date.now();
  if (wait > 0) await delay(wait);
  lastRequestAt.set(host, Date.now());
  release();
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

export interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  minGapMs?: number;
  retries?: number;
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { method = 'GET', body, minGapMs = 120, retries = 3, timeoutMs = 15_000 } = opts;
  const host = new URL(url).host;

  let attempt = 0;
  for (;;) {
    await withHostSlot(host, minGapMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new HttpError(res.status, url);
      }
      if (!res.ok) {
        // 4xx other than 429 is a real answer (e.g. 404 card not found) — don't retry.
        throw new HttpError(res.status, url, await safeErrorDetail(res, url));
      }
      return (await res.json()) as T;
    } catch (err) {
      const retriable =
        err instanceof HttpError ? err.status === 429 || err.status >= 500 : true;
      if (!retriable || attempt >= retries) throw err;
      await delay(500 * 2 ** attempt);
      attempt++;
    }
  }
}

async function safeErrorDetail(res: Response, url: string): Promise<string> {
  try {
    const data = (await res.json()) as { details?: string };
    return data.details ?? `HTTP ${res.status} for ${url}`;
  } catch {
    return `HTTP ${res.status} for ${url}`;
  }
}
