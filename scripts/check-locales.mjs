// Checks every language file against English (the source): same keys, same
// {placeholders} / {{variables}}, same number of links. Then checks the Help Guide /
// connect-guide translations (src/i18n/guides) have the same shape as the English
// config files. Run: npm run check:i18n
// Exits with a non-zero code when something is off, so it can gate a build or CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');
const only = process.argv.slice(2);

const load = async (code) => (await import(pathToFileURL(path.join(DIR, `${code}.js`)).href)).default;

function flatten(source, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(source)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) value.forEach((item, index) => (out[`${p}[${index}]`] = item));
    else if (value && typeof value === 'object') flatten(value, p, out);
    else out[p] = value;
  }
  return out;
}

const tokens = (text) => [...String(text).matchAll(/\{\{\w+\}\}|\{\w+\}/g)].map((match) => match[0]).sort().join('|');
const links = (text) => (String(text).match(/\[[^\]]+\]\([^)]+\)/g) || []).length;

const english = flatten(await load('en'));
const codes = only.length
  ? only
  : fs.readdirSync(DIR).filter((file) => file.endsWith('.js')).map((file) => file.replace('.js', '')).filter((code) => code !== 'en');

let failed = 0;
for (const code of codes) {
  const problems = [];
  let data;
  try {
    data = flatten(await load(code));
  } catch (error) {
    console.log(`${code.padEnd(9)} cannot be loaded: ${error.message}`);
    failed += 1;
    continue;
  }
  for (const key of Object.keys(english)) {
    if (!(key in data)) problems.push(`missing ${key}`);
    else if (typeof data[key] !== 'string' || !data[key].trim()) problems.push(`empty ${key}`);
    else {
      if (tokens(english[key]) !== tokens(data[key])) problems.push(`placeholders differ in ${key}`);
      if (links(english[key]) !== links(data[key])) problems.push(`link count differs in ${key}`);
    }
  }
  for (const key of Object.keys(data)) if (!(key in english)) problems.push(`unknown key ${key}`);
  console.log(`${code.padEnd(9)} ${problems.length ? `${problems.length} problem(s)` : 'ok'}`);
  problems.slice(0, 10).forEach((problem) => console.log(`    ${problem}`));
  if (problems.length) failed += 1;
}
// ---- Help Guide + connect guide translations -------------------------------------
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const GUIDE_DIR = path.join(ROOT, 'i18n', 'guides');
const importDefault = async (file) => (await import(pathToFileURL(file).href)).default;

async function englishGuideText() {
  const chapters = await importDefault(path.join(ROOT, 'config', 'guideChapters.js'));
  const connect = await importDefault(path.join(ROOT, 'config', 'platformConnectGuides.js'));
  const text = { chapters: {}, connect: {} };
  for (const chapter of chapters) {
    text.chapters[chapter.id] = { title: chapter.title, description: chapter.description, readTime: chapter.readTime, content: chapter.content };
  }
  for (const [key, guide] of Object.entries(connect)) {
    const fields = {};
    for (const field of guide.fields) {
      fields[field.key] = { label: field.label };
      if (field.placeholder) fields[field.key].placeholder = field.placeholder;
      if (field.hint) fields[field.key].hint = field.hint;
    }
    text.connect[key] = { badge: guide.badge, guideTitle: guide.guideTitle, intro: guide.intro, steps: guide.steps, providerLabel: guide.providerLabel, fields };
  }
  return flatten(text);
}

if (fs.existsSync(GUIDE_DIR)) {
  console.log('\nHelp Guide / connect guides');
  const englishGuide = await englishGuideText();
  const guideFiles = fs.readdirSync(GUIDE_DIR).filter((file) => file.endsWith('.js'));
  const guideCodes = guideFiles.map((file) => file.replace('.js', '')).filter((code) => !only.length || only.includes(code));
  for (const code of guideCodes) {
    const problems = [];
    let data;
    try {
      data = flatten(await importDefault(path.join(GUIDE_DIR, `${code}.js`)));
    } catch (error) {
      console.log(`${code.padEnd(9)} cannot be loaded: ${error.message}`);
      failed += 1;
      continue;
    }
    for (const key of Object.keys(englishGuide)) {
      if (typeof data[key] !== 'string' || !data[key].trim()) problems.push(`missing ${key}`);
    }
    for (const key of Object.keys(data)) if (!(key in englishGuide)) problems.push(`unknown key ${key}`);
    console.log(`${code.padEnd(9)} ${problems.length ? `${problems.length} problem(s)` : 'ok'}`);
    problems.slice(0, 10).forEach((problem) => console.log(`    ${problem}`));
    if (problems.length) failed += 1;
  }
}

process.exit(failed ? 1 : 0);
