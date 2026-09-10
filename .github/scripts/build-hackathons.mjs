// Build hackathons.json from the Devpost profile: keep only winning gallery cards.
// Usage: node build-hackathons.mjs <username> <output.json>   (no auth)
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , user, outPath] = process.argv;
const OUT_DIR = 'assets/projects';
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://devpost.com/',
};
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function vendorImage(name, url) {
  if (!url || /thumbnail-placeholder|defaults\//.test(url)) return null;   // placeholder gif, no real image
  try {
    const ext = (url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i) || [])[1]?.replace('jpeg', 'jpg') || 'png';
    const dest = join(OUT_DIR, `${slug(name)}.${ext}`);
    if (existsSync(dest) && statSync(dest).size > 0) return `assets/projects/${slug(name)}.${ext}`;
    const r = await fetch(url, { headers: { 'User-Agent': headers['User-Agent'] } });
    if (!r.ok) return null;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return `assets/projects/${slug(name)}.${ext}`;
  } catch { return null; }
}

async function galleryImage(url) {
  try {
    const page = await (await fetch(url, { headers })).text();
    const m = page.match(/software_photos\/[^"]*?\/datas\/gallery\.jpg/);
    if (!m) return null;
    return 'https://d112y698adiu2z.cloudfront.net/photos/production/' + m[0].replace('gallery.jpg', 'original.png');
  } catch { return null; }
}

const html = await (await fetch(`https://devpost.com/${user}`, { headers })).text();
const cards = html.split(/class="[^"]*gallery-item[^"]*"/).slice(1);
const out = [];
for (const c of cards) {
  if (!c.includes('class="winner"')) continue;   // the winner-ribbon img
  const name = ((c.match(/<h5[^>]*>(.*?)<\/h5>/s) || [])[1] || 'Unknown').trim();
  const url  = (c.match(/class="[^"]*block-wrapper-link[^"]*"[^>]+href="([^"]+)"/) || [])[1] || `https://devpost.com/${user}`;
  const tag  = ((c.match(/class="[^"]*tagline[^"]*"[^>]*>(.*?)<\/p>/s) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const thumb = (c.match(/class="[^"]*software_thumbnail_image[^"]*"[^>]+(?:src|data-src)="([^"]+)"/) || [])[1];
  const image = await vendorImage(name, (await galleryImage(url)) || thumb);
  out.push({ name, description: tag, url, language: null, tags: [], image });
  console.log(`- ${name}: image=${image ?? 'none'} ${url}`);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${outPath} (${out.length} hackathon wins)`);
