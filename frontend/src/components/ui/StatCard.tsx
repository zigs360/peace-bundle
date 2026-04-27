import type { ReactNode } from 'react';
import SurfaceCard from './SurfaceCard';

interface StatCardProps {
  title: string;
  value: string | number;
  meta?: string;
  icon: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'neutral';
}

const toneMap = {
  primary: 'bg-primary-100 text-primary-700',
  accent: 'bg-accent-100 text-accent-700',
  success: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-700',
} as const;

export default function StatCard({ title, value, meta, icon, tone = 'primary' }: StatCardProps) {
  return (
    <SurfaceCard className="group relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-primary-700 opacity-90" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          {meta ? <p className="mt-2 text-sm text-slate-500">{meta}</p> : null}
        </div>
        <div className={`rounded-2xl p-3 shadow-inner ${toneMap[tone]}`}>{icon}</div>
      </div>
    </SurfaceCard>
  );
}
