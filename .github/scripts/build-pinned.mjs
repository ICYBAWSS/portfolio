// Build pinned.json from GraphQL pinnedItems response + vendor first README image per repo.
// Usage: node build-pinned.mjs <graphql-response.json> <output.json>
// Needs GH_TOKEN in env for API auth (github actions or local fine-grained PAT).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [, , inPath, outPath] = process.argv;
const token = process.env.GH_TOKEN;
const OUT_DIR = 'assets/projects';
const api = 'https://api.github.com';
const OWNER = 'ICYBAWSS';

const gql = JSON.parse(readFileSync(inPath, 'utf8'));
const nodes = gql?.data?.user?.pinnedItems?.nodes;
if (!Array.isArray(nodes)) {
  console.error('GraphQL returned no pinnedItems. If data is null, GITHUB_TOKEN cannot read pinned items — use a fine-grained PAT (read: public repos) as secret PINNED_PAT.');
  process.exit(1);
}

const auth = { Authorization: `bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'pinned-builder' };

async function firstReadmeImage(repo) {
  try {
    const r = await fetch(`${api}/repos/${OWNER}/${repo}/readme`, { headers: auth });
    if (!r.ok) return null;
    const md = await r.text();
    // first <img src="..."> (READMEs frequently use HTML img, e.g. FlipFocus) else first ![alt](url)
    const img = md.match(/<img[^>]+src="([^"]+)"/) || md.match(/!\[[^\]]*\]\(([^)]+)\)/);
    return img ? img[1] : null;
  } catch { return null; }
}

async function vendorImage(repo, url) {
  if (!url) return null;
  try {
    const extMatch = url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i);
    const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
    const dest = join(OUT_DIR, `${repo}.${ext}`);
    if (existsSync(dest) && statSync(dest).size > 0) return `assets/projects/${repo}.${ext}`; // idempotent
    const r = await fetch(url, { headers: { 'User-Agent': 'pinned-builder' } });
    if (!r.ok) return null;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return `assets/projects/${repo}.${ext}`;
  } catch { return null; }
}

async function repoLanguages(repo) {
  // top languages by byte share (same source GitHub's language bar uses)
  try {
    const r = await fetch(`${api}/repos/${OWNER}/${repo}/languages`, { headers: auth });
    if (!r.ok) return null;
    const langs = await r.json();
    return Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
  } catch { return null; }
}

const out = [];
for (const n of nodes) {
  const image = await vendorImage(n.name, await firstReadmeImage(n.name));
  const langs = await repoLanguages(n.name);
  out.push({
    name: n.name,
    description: n.description || '',
    url: n.url,
    language: n.primaryLanguage?.name || null,
    tags: langs || [n.primaryLanguage?.name].filter(Boolean),
    stars: n.stargazerCount || 0,
    image,
  });
  console.log(`- ${n.name}: image=${image ?? 'none'} tags=${JSON.stringify(out.at(-1).tags)}`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${outPath} (${out.length} repos)`);
