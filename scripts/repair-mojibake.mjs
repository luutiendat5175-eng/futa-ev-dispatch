import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'src');
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql', '.md']);
const cp1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);
const badRun = /[\u00c2-\u00f4][\u0080-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]+/g;
const marker = /(?:[\u00c2-\u00f4][\u0080-\u00ff]|\u00c3.|\u00c4.|\u00c2.|\u00e1\u00ba|\u00e1\u00bb|\u00e2[\u20ac\u2018-\u201d])/g;

function score(value) { return (value.match(marker) ?? []).length; }
function decodeRun(value) {
  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    const byte = code <= 0xff ? code : cp1252.get(code);
    if (byte === undefined) return value;
    bytes.push(byte);
  }
  return Buffer.from(bytes).toString('utf8');
}
function decodeWhole(value) {
  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    const byte = code <= 0xff ? code : cp1252.get(code);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); }
  catch { return null; }
}
function repair(value) {
  // A number of the early source files were written entirely as Windows-1252
  // text interpreted as UTF-8. Repairing the whole file preserves ASCII code
  // while recovering every Vietnamese character in one pass.
  const whole = decodeWhole(value);
  if (whole !== null && score(whole) < score(value)) return whole;
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(badRun, (part) => {
      const decoded = decodeRun(part);
      return score(decoded) < score(part) ? decoded : part;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!extensions.has(path.extname(entry.name))) continue;
    const before = fs.readFileSync(full, 'utf8');
    const after = repair(before);
    if (before !== after) { fs.writeFileSync(full, after, 'utf8'); console.log(path.relative(process.cwd(), full)); }
  }
}
walk(root);
