// Одноразовый скрипт подготовки данных для приложения «В · Карта мира».
// Сайт им не пользуется во время работы: результат лежит в data/world.js.
// Запуск: node tools/build-world.mjs <путь к CSV GBD 2017 (экспорт OWID)>
// Нужны пакеты: world-atlas@2, topojson-client, d3-geo, i18n-iso-countries.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const topo = require('world-atlas/countries-50m.json');
const { feature } = require('topojson-client');
const { geoContains, geoBounds } = require('d3-geo');
const iso = require('i18n-iso-countries');
iso.registerLocale(require('i18n-iso-countries/langs/ru.json'));

const csvPath = process.argv[2];
const rows = fs.readFileSync(csvPath, 'utf8').split('\n');
function parse(line) {
  const out = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
const data = {}; let table = 0;
for (let i = 1; i < rows.length; i++) {
  const r = parse(rows[i].trim());
  if (r[1] === 'Entity') { table++; continue; }
  if (r.length < 5) continue;
  const code = r[2], year = +r[3];
  if (!/^[A-Z]{3}$/.test(code) && code !== 'OWID_WRL') continue;
  const d = (data[code] ??= {});
  if (table === 0) {
    if (year === 2017) { d.a = +(+r[7]).toFixed(2); d.d = +(+r[9]).toFixed(2); }
    if (year === 1990) { d.a90 = +(+r[7]).toFixed(2); d.d90 = +(+r[9]).toFixed(2); }
  } else if (table === 1 && year === 2017) {
    d.m = +(+r[4]).toFixed(2); d.f = +(+r[5]).toFixed(2);
  }
}

const fc = feature(topo, topo.objects.countries).features;
const countries = []; const idx = new Map();
for (const f of fc) {
  const a3 = iso.numericToAlpha3(f.id) || null;
  if (!a3 || !data[a3] || data[a3].a == null) continue;
  const name = iso.getName(a3, 'ru', { select: 'alias' }) || iso.getName(a3, 'ru') || f.properties.name;
  // «КНДР (Корейская…)» → «КНДР»: короткие имена для подсказки
  const short = name.replace(/\s*\(.*\)$/, '');
  idx.set(f, countries.length);
  countries.push({ c: a3, n: short, ...data[a3] });
}
const STEP = 1.25, LAT0 = 84, LAT1 = -58;
const W = Math.round(360 / STEP), H = Math.round((LAT0 - LAT1) / STEP);
const land = fc.filter(f => f.id !== '010').map(f => ({ f, b: geoBounds(f) }));
const inB = (b, lon, lat) => lat >= b[0][1] && lat <= b[1][1] && (b[0][0] <= b[1][0] ? lon >= b[0][0] && lon <= b[1][0] : lon >= b[0][0] || lon <= b[1][0]);
let grid = '';
const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const lon = -180 + (x + 0.5) * STEP, lat = LAT0 - (y + 0.5) * STEP;
    let v = -2; // море
    for (const { f, b } of land) {
      if (!inB(b, lon, lat)) continue;
      if (geoContains(f, [lon, lat])) { v = idx.has(f) ? idx.get(f) : -1; break; }
    }
    // два символа на клетку: '..' — море, '--' — суша без данных
    grid += v === -2 ? '..' : v === -1 ? '--' : ALPH[Math.floor(v / 62)] + ALPH[v % 62];
  }
}
const w = data.OWID_WRL;
const out = `// Сгенерировано tools/build-world.mjs. Источник значений: IHME, Global Burden of Disease 2017,
// в выгрузке Our World in Data (доля населения, %). Границы: Natural Earth 1:50m через world-atlas.
export const WORLD = ${JSON.stringify({ w: W, h: H, step: STEP, lat0: LAT0, world: w, countries, grid })};
`;
fs.writeFileSync(new URL('../data/world.js', import.meta.url), out);
console.log(W, H, countries.length, out.length);
