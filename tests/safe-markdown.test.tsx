// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { SafeMarkdown } from '@/components/safe-markdown';

afterEach(cleanup);

function show(text: string, streaming = false) {
  return render(<SafeMarkdown text={text} streaming={streaming} />);
}

describe('SafeMarkdown', () => {
  it('renders supported elements', () => {
    const { container } = show('**b** *i* ~~s~~ `c`\n\n- a\n  - nested\n\n1. one\n\n> quote\n\n---\n\n```\ncode\n```\n\n| h |\n|---|\n| v |');
    expect(container.querySelector('strong')).toHaveTextContent('b');
    expect(container.querySelector('em')).toHaveTextContent('i');
    expect(container.querySelector('del')).toHaveTextContent('s');
    expect(container.querySelector('p code')).toHaveTextContent('c');
    expect(container.querySelectorAll('ul')).toHaveLength(2);
    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(container.querySelector('blockquote')).toBeInTheDocument();
    expect(container.querySelector('hr')).toBeInTheDocument();
    expect(container.querySelector('pre code')).toHaveTextContent('code');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shifts headings below the page outline', () => {
    show('# a\n\n## b\n\n### c\n\n###### d');
    expect(screen.getByRole('heading', { level: 3, name: 'a' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'b' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: 'c' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 5, name: 'd' })).toBeInTheDocument();
  });

  it('leaves plain text unchanged', () => {
    show('Just a sentence.');
    expect(screen.getByText('Just a sentence.')).toBeInTheDocument();
  });

  it.each(['http://example.com', 'https://example.com', 'mailto:a@example.com'])('links %s safely', href => {
    show(`[go](${href})`);
    const link = screen.getByRole('link', { name: 'go' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd'])('does not link %s', href => {
    show(`[go](${href})`);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('go')).toBeInTheDocument();
  });

  it('shows raw HTML as literal text', () => {
    const payloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<iframe src="x"></iframe>', '<div onclick="x()">hi</div>', '<a href="javascript:alert(1)">bad</a>'];
    for (const payload of payloads) {
      const { container, unmount } = show(payload);
      expect(container.querySelector('script, img, iframe, a, div[onclick]')).toBeNull();
      expect(container.textContent).toMatch(/alert\(1\)|x\(\)|src="x"/);
      unmount();
    }
  });

  it('keeps single newlines in plain text visible', () => {
    const { container } = show('line one\nline two');
    expect(container.querySelector('p')).toHaveClass('whitespace-pre-line');
  });

  it('renders images as alt text only', () => {
    const { container } = show('![a cat](https://example.com/cat.png)');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('a cat')).toBeInTheDocument();
  });

  it('heals unfinished Markdown only while streaming', () => {
    const { container, unmount } = show('**unfinished', true);
    expect(container.textContent).not.toContain('**');
    expect(container.querySelector('strong')).toBeInTheDocument();
    unmount();
    const stored = show('**unfinished', false);
    expect(stored.container.textContent).toContain('**unfinished');
  });
});
