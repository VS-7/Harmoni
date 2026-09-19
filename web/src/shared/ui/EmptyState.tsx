import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center gap-3 py-16 text-center">
    <span className="opacity-30">{icon}</span>
    <p className="text-headline">{title}</p>
    {description && (
      <p className="max-w-xs text-footnote text-[color:var(--fg-secondary)]">{description}</p>
    )}
    {action}
  </div>
);
