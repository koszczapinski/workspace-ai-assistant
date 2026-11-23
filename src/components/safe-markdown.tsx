import type { ComponentProps, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remend from 'remend';

/**
 * The single place that decides how model output is displayed (ADR-0006).
 * Safe subset only: no raw HTML, no images, links limited to http, https and mailto.
 */

type MdNode = { type: string; value?: string; children?: MdNode[] };

const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem']);

/** Raw HTML is shown as literal text instead of being parsed or dropped. */
function remarkHtmlAsText() {
  const convert = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.map(child => {
      if (child.type !== 'html') {
        convert(child);
        return child;
      }
      const text: MdNode = { type: 'text', value: child.value };
      return FLOW_PARENTS.has(node.type) ? { type: 'paragraph', children: [text] } : text;
    });
  };
  return convert;
}

const ALLOWED_ELEMENTS = [
  'p', 'em', 'strong', 'del', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'hr', 'br', 'a', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isSafeLink(href: string | undefined): href is string {
  if (!href) return false;
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

const heading = (className: string, Tag: 'h3' | 'h4' | 'h5') =>
  function Heading({ children }: { children?: ReactNode }) {
    return <Tag className={`mt-4 mb-2 font-semibold first:mt-0 ${className}`}>{children}</Tag>;
  };

const components: Components = {
  p: ({ children }) => <p className="my-2 whitespace-pre-line first:mt-0 last:mb-0">{children}</p>,
  h1: heading('text-base', 'h3'),
  h2: heading('text-[0.95rem]', 'h4'),
  h3: heading('text-sm', 'h5'),
  h4: heading('text-sm', 'h5'),
  h5: heading('text-sm', 'h5'),
  h6: heading('text-sm', 'h5'),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border pl-4 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-4 border-border" />,
  a: ({ href, children }) =>
    isSafeLink(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => <span>{alt}</span>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  code: ({ children, className }: ComponentProps<'code'>) => (
    <code className={className ?? 'rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]'}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

export function SafeMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkHtmlAsText]}
      allowedElements={ALLOWED_ELEMENTS}
      unwrapDisallowed
      components={components}
      // Safety rests on isSafeLink in the `a` component; the default transform would only hide the original URL.
      urlTransform={url => url}
    >
      {streaming ? remend(text) : text}
    </ReactMarkdown>
  );
}
