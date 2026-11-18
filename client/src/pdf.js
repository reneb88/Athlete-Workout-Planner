import { buildTree, familySkills, familyVideoUrl, isVariant, shareUrl, skillLabel } from './util.js';

// Compact, two-column, paper-saving checklist PDF.
const NAVY = [11, 30, 58];
const ORANGE = [255, 90, 31];
const LINK = [29, 78, 216];
const GREY = [110, 116, 128];
const LINE = [222, 227, 235];
const CAT_COLORS = { Manipulation: [37, 99, 235], Multiples: [255, 90, 31], Power: [16, 163, 127] };

const PAGE = { margin: 28, gutter: 18, headerH: 38, footer: 22 };
const FS = { item: 8.6, note: 7.3, fam: 9, cat: 8.5 };

/** Generate and download a branded PDF checklist for one athlete. */
export const exportPdf = (sheet, opts) => exportPdfMany([sheet], opts);

/** One PDF; each athlete (or poster) starts on a new page, laid out in two columns. */
export async function exportPdfMany(sheets, { showNotes = false, poster = false, filename } = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const colW = (W - PAGE.margin * 2 - PAGE.gutter) / 2;
  const top = PAGE.headerH + 14;
  const bottom = H - PAGE.footer;
  let athlete;
  let col = 0;
  let y = top;

  const header = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, PAGE.headerH, 'F');
    doc.setFillColor(...ORANGE); doc.rect(0, PAGE.headerH, W, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(14);
    doc.text('ROPEWORKS', PAGE.margin, 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...ORANGE);
    doc.text('TRAINING STUDIO', PAGE.margin, 29);
    doc.setTextColor(255, 255, 255); doc.setFontSize(13);
    doc.text(athlete.name, W - PAGE.margin, 19, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text([athlete.age && `Age ${athlete.age}`, athlete.group_notes, !poster && new Date().toLocaleDateString()].filter(Boolean).join('  ·  '),
      W - PAGE.margin, 30, { align: 'right' });
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - PAGE.margin, H - 10, { align: 'right' });
  };
  const x0 = () => PAGE.margin + col * (colW + PAGE.gutter);
  const newPage = () => { doc.addPage(); header(); col = 0; y = top; };
  /** Make room for `h` points; moves to the next column/page if needed. */
  const room = (h) => {
    if (y + h <= bottom) return;
    if (col === 0) { col = 1; y = top; } else newPage();
  };

  const text = (str, x, yy, { size = FS.item, style = 'normal', color = [20, 24, 32], maxW } = {}) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = maxW ? doc.splitTextToSize(str, maxW) : [str];
    doc.text(lines, x, yy);
    return lines.length;
  };
  const link = (label, url, xRight, yy, size = 7.2) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...LINK);
    const w = doc.getTextWidth(label);
    doc.textWithLink(label, xRight - w, yy, { url });
    return w;
  };
  const box = (x, yy, on) => {
    doc.setDrawColor(60); doc.setLineWidth(0.7); doc.rect(x, yy - 7, 7.5, 7.5);
    if (on) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...ORANGE); doc.text('X', x + 1.3, yy - 0.6); }
  };

  const LH = 10.5; // wrapped-line height
  /** Height a row will take (label may wrap). */
  const rowLines = (label, hasLink, note) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(FS.item);
    const n = doc.splitTextToSize(label, colW - 14 - (hasLink ? 30 : 0)).length;
    doc.setFontSize(FS.note);
    const m = note ? doc.splitTextToSize(note, colW - 14).length : 0;
    return { n, m, h: (n - 1) * LH + 14 + m * 9 };
  };
  const item = (label, { done, url, note, color, style } = {}) => {
    const { h } = rowLines(label, !!url, note);
    room(h);
    const x = x0();
    const base = y + 8;
    box(x, base, done);
    const n = text(label, x + 13, base, { maxW: colW - 14 - (url ? 30 : 0), color, style });
    if (url) link('video', url, x + colW, base);
    let end = base + (n - 1) * LH;
    if (note) end += text(note, x + 13, end + 9, { size: FS.note, color: GREY, maxW: colW - 14 }) * 9;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(x, end + 3.5, x + colW, end + 3.5);
    y = end + 6;
  };

  const catBand = (name, color) => {
    room(16 + 28);
    doc.setFillColor(...color); doc.rect(x0(), y, colW, 13, 'F');
    text(name.toUpperCase(), x0() + 5, y + 9.3, { size: FS.cat, style: 'bold', color: [255, 255, 255] });
    y += 17;
  };

  sheets.forEach((sheet, idx) => {
    const { skills, combos, done, comboByCheckpoint, all = skills } = sheet;
    athlete = sheet.athlete;
    if (idx > 0) doc.addPage();
    header(); col = 0; y = top;

    for (const c of buildTree(skills, all).filter((x) => x.subs.length)) {
      catBand(c.name, CAT_COLORS[c.name] || NAVY);
      for (const s of c.subs) for (const f of s.families) {
        // Keep a family together in one column when it fits.
        const rows = f.skills.map((sk) => rowLines(skillLabel(sk), !!sk.video_url, showNotes ? sk.teaching_notes : '').h
          + (comboByCheckpoint[sk.id] || []).length * 14);
        const famH = 15 + rows.reduce((a, b) => a + b, 0);
        if (famH < bottom - top) room(famH); else room(15 + (rows[0] || 0));
        const famUrl = familyVideoUrl(familySkills(all, f.name));
        const x = x0();
        text(f.name, x, y + 9, { size: FS.fam, style: 'bold', color: NAVY });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(FS.fam);
        const nameW = doc.getTextWidth(f.name);
        text(s.name, x + nameW + 5, y + 9, { size: 6.8, color: GREY });
        if (famUrl) link('family video', famUrl, x + colW, y + 9);
        y += 14;
        for (const sk of f.skills) {
          item(skillLabel(sk) + (isVariant(sk, f) ? ` (${sk.subcategory || sk.category})` : ''), {
            done: done.has(`skill:${sk.id}`), url: sk.video_url ? shareUrl(sk.video_url) : '', note: showNotes ? sk.teaching_notes : '',
          });
          for (const cb of comboByCheckpoint[sk.id] || []) {
            item(`Try this combo: ${cb.name}`, { done: done.has(`combo:${cb.id}`), url: cb.video_url ? shareUrl(cb.video_url) : '', color: ORANGE, style: 'bolditalic' });
          }
        }
        y += 5;
      }
    }
    if (combos.length) {
      catBand('Combos & routines', ORANGE);
      for (const c of combos) {
        item(`${c.name} (${c.kind})`, { done: done.has(`combo:${c.id}`), url: c.video_url ? shareUrl(c.video_url) : '', note: showNotes ? c.notes : '' });
      }
    }
  });

  doc.save(filename || (sheets.length === 1
    ? `Ropeworks-${sheets[0].athlete.name.replace(/[^\w]+/g, '-')}-checklist.pdf`
    : `Ropeworks-${poster ? 'posters' : 'workouts'}-${new Date().toISOString().slice(0, 10)}.pdf`));
}
