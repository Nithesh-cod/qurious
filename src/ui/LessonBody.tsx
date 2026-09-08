/**
 * Lesson prose, rendered as prose.
 *
 * The lesson bodies are authored with blank lines between paragraphs, because a wall of
 * text is the fastest way to lose a beginner. Until now they were rendered as
 * `<p>{body}</p>` — and HTML collapses newlines to a single space, so every one of those
 * breaks was silently thrown away. The algorithm lessons in particular were written as
 * four short paragraphs each and were arriving as one dense block.
 *
 * The authoring format is deliberately tiny, because content is data and a subject
 * teacher should not have to learn a markup language to write a lesson:
 *
 *   blank line   starts a new paragraph
 *   "- " at the start of a line   makes a bullet
 *   single newline   is a line break inside the paragraph
 *   **text**   is emphasised
 *
 * Anything else is literal, so a stray asterisk or dash in the middle of a sentence
 * cannot accidentally become markup.
 */

import { Fragment, type ReactNode } from 'react';

/** Split on **bold**, leaving everything else exactly as written. */
function emphasise(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={m.index}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One paragraph, with single newlines kept as line breaks. */
function lines(text: string): ReactNode[] {
  return text.split('\n').map((line, i, all) => (
    <Fragment key={i}>
      {emphasise(line)}
      {i < all.length - 1 && <br />}
    </Fragment>
  ));
}

export function LessonBody({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  return (
    <div className={className ? `lesson-body ${className}` : 'lesson-body'}>
      {blocks.map((block, i) => {
        const rows = block.split('\n');
        // A block is a list only if every line in it is a bullet, so a paragraph that
        // happens to start with a dash stays a paragraph.
        if (rows.length > 1 && rows.every(r => r.startsWith('- '))) {
          return (
            <ul key={i} className="lesson-bullets">
              {rows.map((r, j) => <li key={j}>{emphasise(r.slice(2))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines(block)}</p>;
      })}
    </div>
  );
}
