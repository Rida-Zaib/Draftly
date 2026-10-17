import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDb } from './db.js';
import { createApp } from './app.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(dir, '../client/dist');
const index = path.join(dist, 'index.html');

const app = createApp(createDb(process.env.DB_FILE || 'data.db'));
app.use(express.static(dist));
app.use((_req, res) =>
  fs.existsSync(index)
    ? res.sendFile(index)
    : res.status(404).send('Client not built. Run: npm run build'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Draftly listening on ${port}`));
