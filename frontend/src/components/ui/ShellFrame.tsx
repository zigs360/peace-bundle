import type { ReactNode } from 'react';

interface ShellFrameProps {
  children: ReactNode;
  contentId?: string;
}

export default function ShellFrame({ children, contentId = 'main-content' }: ShellFrameProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-app text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(17,94,89,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(217,119,6,0.1),_transparent_24%),linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(246,248,251,0.96))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/80" />
      <main id={contentId} className="relative">
        {children}
      </main>
    </div>
  );
}
