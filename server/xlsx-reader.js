// Minimal, namespace-tolerant .xlsx reader.
// Handles workbooks written by Excel, Google Sheets, openpyxl, ExcelJS and the OpenXML SDK
// (which prefixes every element, e.g. <x:row>). Returns cached cell values; formulas are ignored.
import JSZip from 'jszip';
import path from 'node:path';

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

const P = '(?:[A-Za-z_][\\w.-]*:)?'; // optional namespace prefix
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${P}${name}\\s*=\\s*"([^"]*)"`));
  return m ? decode(m[1]) : undefined;
};
const elements = (xml, name) => {
  const re = new RegExp(`<(${P}${name})(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</\\1\\s*>)`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push({ attrs: m[2] || '', body: m[3] ?? '' });
  return out;
};
const textOf = (body) => elements(body, 't').map((t) => decode(t.body)).join('');

function colIndex(ref) {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function resolveTarget(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(base), target));
}

/** @returns {Promise<Array<{name: string, rows: string[][]}>>} rows are 1-indexed arrays of strings */
export async function readXlsx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const file = async (p) => {
    const f = zip.file(p) || Object.values(zip.files).find((x) => x.name.toLowerCase() === p.toLowerCase());
    return f ? (await f.async('string')).replace(/^﻿/, '') : null;
  };
  const rootRels = await file('_rels/.rels');
  let wbPath = 'xl/workbook.xml';
  if (rootRels) {
    const r = elements(rootRels, 'Relationship').find((x) => /officeDocument$/.test(attr(x.attrs, 'Type') || ''));
    if (r) wbPath = resolveTarget('', attr(r.attrs, 'Target'));
  }
  const wbXml = await file(wbPath);
  if (!wbXml) throw new Error('Not an xlsx workbook');
  const relsXml = await file(path.posix.join(path.posix.dirname(wbPath), '_rels', path.posix.basename(wbPath) + '.rels')) || '';
  const rels = {};
  let sstPath;
  for (const r of elements(relsXml, 'Relationship')) {
    const target = resolveTarget(wbPath, attr(r.attrs, 'Target'));
    rels[attr(r.attrs, 'Id')] = target;
    if (/sharedStrings$/.test(attr(r.attrs, 'Type') || '')) sstPath = target;
  }
  const sstXml = (sstPath && await file(sstPath)) || '';
  const shared = elements(sstXml, 'si').map((si) => textOf(si.body));

  const sheets = [];
  for (const s of elements(wbXml, 'sheet')) {
    const name = attr(s.attrs, 'name');
    const rid = attr(s.attrs, 'id');
    const xml = rels[rid] && await file(rels[rid]);
    if (!xml) continue;
    const rows = [];
    let autoRow = 0;
    for (const row of elements(xml, 'row')) {
      const rn = Number(attr(row.attrs, 'r')) || autoRow + 1;
      autoRow = rn;
      const cells = [];
      let autoCol = 0;
      for (const c of elements(row.body, 'c')) {
        const ref = attr(c.attrs, 'r');
        const ci = ref ? colIndex(ref) : autoCol + 1;
        autoCol = ci;
        const t = attr(c.attrs, 't');
        const v = elements(c.body, 'v')[0];
        let val = '';
        if (t === 's') val = v ? shared[Number(v.body)] ?? '' : '';
        else if (t === 'inlineStr') val = textOf(c.body);
        else if (t === 'b') val = v && v.body === '1' ? 'TRUE' : v ? 'FALSE' : '';
        else if (t === 'e') val = '';
        else val = v ? decode(v.body) : '';
        cells[ci] = String(val).trim();
      }
      rows[rn] = cells;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
