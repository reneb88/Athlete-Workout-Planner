import { buildTree, skillLabel } from './util.js';

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
    const { skills, combos, done, comboByCheckpoint } = sheet;
    athlete = sheet.athlete;
    if (idx > 0) doc.addPage();
    const body = [];
    for (const c of buildTree(skills).filter((x) => x.subs.length)) {
      body.push([{ content: c.name.toUpperCase(), colSpan: 3, styles: { fillColor: CAT_COLORS[c.name] || NAVY, textColor: 255, fontStyle: 'bold', fontSize: 11 } }]);
      for (const s of c.subs) for (const f of s.families) {
        body.push([{ content: `${f.name}   ·   ${s.name}`, colSpan: 3, styles: { fillColor: [236, 240, 247], textColor: NAVY, fontStyle: 'bold' } }]);
        for (const sk of f.skills) {
          body.push([done.has(`skill:${sk.id}`) ? 'X' : '', skillLabel(sk), showNotes ? sk.teaching_notes || '' : '']);
          for (const cb of comboByCheckpoint[sk.id] || []) {
            body.push([done.has(`combo:${cb.id}`) ? 'X' : '', { content: `Can you do this? Try this combo!  ${cb.name}`, styles: { textColor: ORANGE, fontStyle: 'bolditalic' } }, cb.notes || '']);
          }
        }
      }
    }
    if (combos.length) {
      body.push([{ content: 'COMBOS & ROUTINES', colSpan: 3, styles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold', fontSize: 11 } }]);
      for (const c of combos) body.push([done.has(`combo:${c.id}`) ? 'X' : '', `${c.name} (${c.kind})`, c.notes || '']);
    }

    autoTable(doc, {
      startY: 84,
      pageBreak: 'auto',
      margin: { top: 84, left: 36, right: 36, bottom: 40 },
      head: [['Done', 'Challenge', 'Notes']],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [210, 216, 226], valign: 'middle' },
      headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 0: { cellWidth: 40, halign: 'center', fontStyle: 'bold', textColor: ORANGE }, 1: { cellWidth: 260 } },
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
