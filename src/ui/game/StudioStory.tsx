import { useState } from 'react';
import { Button } from '../components/ui';
import { useGame } from '../store';
import { biography } from './biography';

/** The run as a short story — collapsible, with a copy button for sharing. */
export function StudioStory({ open = false }: { open?: boolean }) {
  const s = useGame((g) => g.s)!;
  const [copied, setCopied] = useState(false);
  const paras = biography(s);
  return (
    <details open={open} className="rounded-2xl border border-line p-3 text-left text-sm">
      <summary className="cursor-pointer font-display font-semibold">The story of {s.company.name}</summary>
      <div className="mt-2 space-y-1.5 text-ink2">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon="book"
          onClick={() => {
            void navigator.clipboard?.writeText(`${s.company.name}\n\n${paras.join('\n\n')}`).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied!' : 'Copy story'}
        </Button>
      </div>
    </details>
  );
}
