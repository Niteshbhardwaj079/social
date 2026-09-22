// Checks every language file against English (the source): same keys, same
// {placeholders} / {{variables}}, same number of links. Run: npm run check:i18n
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
  : fs.readdirSync(DIR).map((file) => file.replace('.js', '')).filter((code) => code !== 'en');

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
process.exit(failed ? 1 : 0);
