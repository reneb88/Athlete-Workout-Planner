import { buildTree, familySkills, familyVideoUrl, isVariant, shareUrl, skillLabel } from './util.js';

const NAVY = [11, 30, 58];
const ORANGE = [255, 90, 31];
const CAT_COLORS = { Manipulation: [37, 99, 235], Multiples: [255, 90, 31], Power: [16, 163, 127] };

/** Generate and download a branded PDF checklist for one athlete. */
export const exportPdf = (sheet, opts) => exportPdfMany([sheet], opts);

/** One PDF, one athlete per page (each athlete starts on a new page). */
export async function exportPdfMany(sheets, { showNotes = true, filename } = {}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();

  let athlete = sheets[0].athlete;
  const header = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 64, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(0, 64, W, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('ROPEWORKS', 36, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('TRAINING STUDIO', 36, 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(athlete.name, W - 36, 32, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text([athlete.age && `Age ${athlete.age}`, athlete.group_notes, new Date().toLocaleDateString()].filter(Boolean).join('  ·  '), W - 36, 48, { align: 'right' });
  };

  sheets.forEach((sheet, idx) => {
    const { skills, combos, done, comboByCheckpoint, all = skills } = sheet;
    athlete = sheet.athlete;
    if (idx > 0) doc.addPage();
    const body = [];
    const LINK = [29, 78, 216];
    const watch = (url) => (url ? { content: 'Watch', url: shareUrl(url), styles: { textColor: LINK, fontStyle: 'bold', halign: 'center' } } : '');
    for (const c of buildTree(skills, all).filter((x) => x.subs.length)) {
      body.push([{ content: c.name.toUpperCase(), colSpan: 4, styles: { fillColor: CAT_COLORS[c.name] || NAVY, textColor: 255, fontStyle: 'bold', fontSize: 11 } }]);
      for (const s of c.subs) for (const f of s.families) {
        const famUrl = familyVideoUrl(familySkills(all, f.name));
        body.push([{
          content: `${f.name}   ·   ${s.name}${famUrl ? '        Watch the whole family video' : ''}`,
          colSpan: 4, url: famUrl || undefined,
          styles: { fillColor: [236, 240, 247], textColor: NAVY, fontStyle: 'bold' },
        }]);
        for (const sk of f.skills) {
          body.push([done.has(`skill:${sk.id}`) ? 'X' : '', skillLabel(sk) + (isVariant(sk, f) ? `  (${sk.subcategory || sk.category})` : ''),
            watch(sk.video_url), showNotes ? sk.teaching_notes || '' : '']);
          for (const cb of comboByCheckpoint[sk.id] || []) {
            body.push([done.has(`combo:${cb.id}`) ? 'X' : '', { content: `Can you do this? Try this combo!  ${cb.name}`, styles: { textColor: ORANGE, fontStyle: 'bolditalic' } }, watch(cb.video_url), cb.notes || '']);
          }
        }
      }
    }
    if (combos.length) {
      body.push([{ content: 'COMBOS & ROUTINES', colSpan: 4, styles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold', fontSize: 11 } }]);
      for (const c of combos) body.push([done.has(`combo:${c.id}`) ? 'X' : '', `${c.name} (${c.kind})`, watch(c.video_url), c.notes || '']);
    }

    autoTable(doc, {
      startY: 84,
      pageBreak: 'auto',
      margin: { top: 84, left: 36, right: 36, bottom: 40 },
      head: [['Done', 'Challenge', 'Video', 'Notes']],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [210, 216, 226], valign: 'middle' },
      headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 0: { cellWidth: 40, halign: 'center', fontStyle: 'bold', textColor: ORANGE }, 1: { cellWidth: 250 }, 2: { cellWidth: 56 } },
      // Make video cells clickable in the PDF.
      didDrawCell: (data) => {
        const url = data.section === 'body' && data.cell.raw && typeof data.cell.raw === 'object' ? data.cell.raw.url : null;
        if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      },
      didDrawPage: () => {
        header();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 36, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      },
    });
  });

  doc.save(filename || (sheets.length === 1
    ? `Ropeworks-${sheets[0].athlete.name.replace(/[^\w]+/g, '-')}-checklist.pdf`
    : `Ropeworks-workouts-${new Date().toISOString().slice(0, 10)}.pdf`));
}
