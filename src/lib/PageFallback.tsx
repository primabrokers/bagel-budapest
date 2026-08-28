import { Loader2 } from 'lucide-react';

/**
 * Centred spinner shown while a lazy route chunk downloads. Its own file — not alongside
 * `lazyPage.tsx`'s functions — purely so that file can stay component-export-free for fast
 * refresh (`react-refresh/only-export-components`); this is the one component in the pair.
 */
export function PageFallback() {
  return (
    <div className="flex h-full min-h-[40dvh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-hidden="true" />
    </div>
  );
}
