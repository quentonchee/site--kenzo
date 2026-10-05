// Regenerates index.html from content/site.json.  Usage: npm run build
import { readFile, writeFile } from 'node:fs/promises';
import { renderPage } from './cms/render.js';

const content = JSON.parse(await readFile(new URL('./content/site.json', import.meta.url), 'utf8'));
await writeFile(new URL('./index.html', import.meta.url), renderPage(content));
console.log('index.html généré depuis content/site.json');
