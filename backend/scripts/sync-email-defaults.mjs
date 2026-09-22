// The built-in text of every system email, in every language, is written once — in the
// front-end language files (src/i18n/locales/<code>.js, under `mail`). This script copies
// it into backend/src/emails/defaults/<code>.json so the backend is fully self-contained
// and can be built and deployed on its own, without the front-end sources next to it.
//
//   npm run sync:emails    regenerate the JSON files
//   npm run check:emails   fail if they are out of date (use in CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.resolve(backendRoot, '..', 'src', 'i18n', 'locales');
const languagesFile = path.resolve(backendRoot, '..', 'src', 'i18n', 'languages.js');
const outDir = path.join(backendRoot, 'src', 'emails', 'defaults');
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(localesDir)) {
  console.error(`Front-end language files not found at ${localesDir}`);
  process.exit(1);
}

const { LANGUAGES } = await import(pathToFileURL(languagesFile).href);
const outputs = new Map();

outputs.set(
  'languages.json',
  `${JSON.stringify(
    LANGUAGES.map(({ code, name, nativeName, htmlLang, dir }) => ({ code, name, nativeName, htmlLang, dir })),
    null,
    2
  )}\n`
);

for (const { code } of LANGUAGES) {
  const locale = (await import(pathToFileURL(path.join(localesDir, `${code}.js`)).href)).default;
  if (!locale.mail) throw new Error(`Language "${code}" has no "mail" section`);
  // `roles` gives the role names ("Super Admin") in that language for emails that mention a role.
  outputs.set(`${code}.json`, `${JSON.stringify({ mail: locale.mail, roles: locale.roles }, null, 2)}\n`);
}

let stale = 0;
fs.mkdirSync(outDir, { recursive: true });
for (const [file, content] of outputs) {
  const target = path.join(outDir, file);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === content) continue;
  stale += 1;
  if (!checkOnly) fs.writeFileSync(target, content);
}

if (checkOnly) {
  console.log(stale ? `${stale} email default file(s) are out of date — run: npm run sync:emails` : 'Email defaults are up to date');
  process.exit(stale ? 1 : 0);
}
console.log(`Email defaults: ${outputs.size} files (${stale} written)`);
