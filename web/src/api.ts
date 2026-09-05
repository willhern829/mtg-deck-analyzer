import type { DeckAnalysis, ResolvedCard } from '@mtg/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function analyzeDeck(decklist: string): Promise<DeckAnalysis> {
  return request<DeckAnalysis>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decklist }),
  });
}

export async function autocomplete(q: string): Promise<string[]> {
  if (q.length < 2) return [];
  const res = await request<{ suggestions: string[] }>(
    `/api/autocomplete?q=${encodeURIComponent(q)}`,
  );
  return res.suggestions;
}

export function getCard(name: string): Promise<ResolvedCard> {
  return request<ResolvedCard>(`/api/card?name=${encodeURIComponent(name)}`);
}
