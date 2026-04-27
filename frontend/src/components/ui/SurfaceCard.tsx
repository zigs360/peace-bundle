import type { HTMLAttributes, ReactNode } from 'react';

interface SurfaceCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevated?: boolean;
}

export default function SurfaceCard({ children, className = '', elevated = false, ...props }: SurfaceCardProps) {
  return (
    <div
      className={[
        'rounded-3xl border border-white/55 bg-white/88 p-6 backdrop-blur-xl',
        elevated ? 'shadow-soft-lg' : 'shadow-soft',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
