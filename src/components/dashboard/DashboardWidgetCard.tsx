import type { ReactNode } from 'react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';

interface DashboardWidgetCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** The shared shell every dashboard widget renders inside — a title over a Card — so the grid
 *  reads as one system rather than nine differently-dressed boxes. */
export function DashboardWidgetCard({ title, children, className }: DashboardWidgetCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </Card>
  );
}
