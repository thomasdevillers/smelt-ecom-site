import Link from "next/link";
import { Fragment } from "react";

const INLINE_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Renders the one piece of inline markup our content files use, `[label](/href)`,
 * as a Next <Link>, so guide prose can link to the product without storing JSX
 * in content/. Everything else passes through as plain text.
 */
export default function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_LINK)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(<Link href={match[2]}>{match[1]}</Link>);
    cursor = at + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}
