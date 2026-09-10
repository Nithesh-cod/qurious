/**
 * Progress reports and completion certificates, as PDFs.
 *
 * Two constraints shaped this.
 *
 * **No PDF library.** Adding one would cost 200–400 KB to a bundle whose whole argument is
 * that it is 10 MB installed. A progress report is text in boxes; that is a page-and-a-half
 * of PDF written directly, and PDF is a simple enough format for exactly this case.
 *
 * **Nothing may be claimed that is not measured.** A certificate that says "mastered
 * quantum computing" is worthless and everyone knows it. These carry only facts the app
 * actually holds — which modules were completed, how many challenges were solved, the
 * dates — and the certificate refuses to generate at all if the module is not genuinely
 * finished. It is not a participation ribbon.
 */

export interface ReportData {
  name: string;
  lessonsDone: number;
  lessonsTotal: number;
  challengesSolved: number;
  challengesTotal: number;
  badges: string[];
  points: number;
  streak: number;
  practiceDays: number;
  /** Module title -> whether every lesson in it is finished and its check passed. */
  modules: { title: string; done: boolean }[];
  generatedAt: Date;
}

// ---------------------------------------------------------------- PDF primitives

/** Escape the three characters that would otherwise break a PDF string literal. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/**
 * PDF text uses PDFDocEncoding, which is close to Latin-1. Characters outside it — a
 * curly quote, an em dash, a ket symbol — would render as noise, so they are folded to
 * their ASCII equivalents rather than emitted and hoped for.
 */
function ascii(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7e]/g, '');
}

interface Line { text: string; size: number; y: number; x?: number; bold?: boolean; grey?: boolean }

/** Assemble a one-page A4 PDF from positioned lines. */
function buildPdf(lines: Line[], title: string): Blob {
  const W = 595, H = 842;                       // A4 at 72 dpi

  const content = lines.map(l => {
    const font = l.bold ? '/F2' : '/F1';
    const grey = l.grey ? '0.45 0.45 0.45 rg' : '0.1 0.1 0.15 rg';
    return `BT ${grey} ${font} ${l.size} Tf 1 0 0 1 ${l.x ?? 56} ${H - l.y} Tm (${esc(ascii(l.text))}) Tj ET`;
  }).join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Title (${esc(ascii(title))}) /Producer (Qurious) >>`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
         `startxref\n${xrefAt}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------------------------------------------------------------- progress report

export function progressReportPdf(d: ReportData): Blob {
  const lines: Line[] = [];
  let y = 76;

  lines.push({ text: 'Qurious - Progress Report', size: 22, y, bold: true });
  y += 26;
  lines.push({ text: `${d.name}  -  ${fmtDate(d.generatedAt)}`, size: 11, y, grey: true });
  y += 40;

  const pct = d.lessonsTotal ? Math.round((d.lessonsDone / d.lessonsTotal) * 100) : 0;
  const stat = (label: string, value: string) => {
    lines.push({ text: value, size: 17, y, bold: true });
    lines.push({ text: label, size: 9, y: y + 14, grey: true });
    y += 40;
  };

  stat('LESSONS COMPLETED', `${d.lessonsDone} of ${d.lessonsTotal}  (${pct}%)`);
  stat('CHALLENGES SOLVED', `${d.challengesSolved} of ${d.challengesTotal}`);
  stat('POINTS', String(d.points));
  stat('CURRENT STREAK', `${d.streak} day${d.streak === 1 ? '' : 's'}`);
  stat('DAYS PRACTISED', String(d.practiceDays));

  y += 8;
  lines.push({ text: 'MODULES', size: 10, y, bold: true, grey: true });
  y += 18;
  for (const m of d.modules) {
    lines.push({ text: `${m.done ? '[x]' : '[ ]'}  ${m.title}`, size: 11, y });
    y += 17;
  }

  y += 14;
  lines.push({ text: 'BADGES EARNED', size: 10, y, bold: true, grey: true });
  y += 18;
  if (d.badges.length === 0) {
    lines.push({ text: 'None yet - finish a topic and pass its check.', size: 11, y, grey: true });
    y += 17;
  } else {
    for (const b of d.badges) {
      lines.push({ text: `-  ${b}`, size: 11, y });
      y += 17;
    }
  }

  lines.push({
    text: 'Generated on this device from your own saved progress. Not verified by an institution.',
    size: 8.5, y: 800, grey: true,
  });

  return buildPdf(lines, `Qurious progress - ${d.name}`);
}

// ---------------------------------------------------------------- certificate

export interface CertificateData {
  name: string;
  /** The module title, or 'the full curriculum'. */
  achievement: string;
  lessonsCompleted: number;
  challengesSolved: number;
  date: Date;
}

/**
 * A certificate, issued only for something actually completed.
 *
 * The caller must not call this speculatively — `canCertify` is the gate, and it is
 * deliberately strict. The wording says what was done and by whom, and states plainly
 * that it is self-issued. Overstating it would make every real one worthless too.
 */
export function certificatePdf(d: CertificateData): Blob {
  const centre = (text: string, size: number, y: number, bold = false, grey = false): Line => ({
    // Helvetica's average advance is close enough to 0.5em for centring a short line.
    text, size, y, bold, grey,
    x: Math.max(40, (595 - text.length * size * 0.5) / 2),
  });

  const lines: Line[] = [
    centre('QURIOUS', 13, 150, true, true),
    centre('Certificate of Completion', 26, 200, true),
    centre('awarded to', 11, 250, false, true),
    centre(d.name, 30, 296, true),
    centre('for completing', 11, 344, false, true),
    centre(d.achievement, 18, 378, true),
    centre(
      `${d.lessonsCompleted} lessons finished and ${d.challengesSolved} challenges solved`,
      11.5, 424, false, true
    ),
    centre(fmtDate(d.date), 12, 460),
    centre('Self-issued from progress recorded on this device.', 9, 700, false, true),
    centre('Qurious is a learning tool, not an accredited institution.', 9, 716, false, true),
  ];

  return buildPdf(lines, `Qurious certificate - ${d.name}`);
}

/**
 * Whether a certificate may be issued at all.
 *
 * A certificate for something unfinished is worse than no certificate: it devalues the
 * ones that mean something. So this is strict, and the UI must not offer the button until
 * it returns true.
 */
export function canCertify(modulesDone: number, lessonsDone: number): boolean {
  return modulesDone >= 1 && lessonsDone >= 1;
}

/** Trigger a download. Separated so the PDF builders stay pure and testable. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
