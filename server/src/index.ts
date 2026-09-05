import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDeck } from './analysis/analyze.js';
import { autocomplete, getCardByName } from './clients/scryfall.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors()); // same-origin in production (static serve below); open for the Vite dev server

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/analyze', async (req, res) => {
  const decklist = req.body?.decklist;
  if (typeof decklist !== 'string' || decklist.trim().length === 0) {
    return res.status(400).json({ error: 'Body must include a non-empty "decklist" string.' });
  }
  if (decklist.length > 100_000) {
    return res.status(413).json({ error: 'Decklist too large.' });
  }
  try {
    res.json(await analyzeDeck(decklist));
  } catch (err) {
    console.error('analyze failed:', err);
    res.status(502).json({
      error: 'Analysis failed — an upstream card-data service may be unavailable. Try again shortly.',
    });
  }
});

app.get('/api/autocomplete', async (req, res) => {
  const q = String(req.query.q ?? '');
  try {
    res.json({ suggestions: await autocomplete(q) });
  } catch {
    res.json({ suggestions: [] }); // autocomplete is best-effort by design
  }
});

app.get('/api/card', async (req, res) => {
  const name = String(req.query.name ?? '');
  if (!name) return res.status(400).json({ error: 'Missing "name" query parameter.' });
  try {
    const card = await getCardByName(name);
    if (!card) return res.status(404).json({ error: `Card "${name}" not found.` });
    res.json(card);
  } catch {
    res.status(502).json({ error: 'Card lookup failed.' });
  }
});

// In production, serve the built web app from the same origin.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const port = Number(process.env.PORT ?? 3001);
app
  .listen(port, () => {
    console.log(`MTG Deck Analyzer API listening on http://localhost:${port}`);
  })
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other process or run with PORT=<other> npm start.`);
      process.exit(1);
    }
    throw err;
  });
