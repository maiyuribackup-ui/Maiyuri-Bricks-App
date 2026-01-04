---
name: react-component-builder
description: Creates production-ready React components with TypeScript, Tailwind CSS, and testing. USE WHEN user says 'create component', 'build component', 'new component', OR wants to add UI elements.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# React Component Builder

Creates React components following Maiyuri Bricks project standards.

## Quick Start

```bash
# Component goes in apps/web/src/components/
apps/web/src/components/ComponentName/
├── ComponentName.tsx
├── ComponentName.test.tsx
└── index.ts
```

## Instructions

When creating a React component:

1. **Choose component type:**
   - UI primitive → `packages/ui/src/`
   - App component → `apps/web/src/components/`

2. **Create the component file:**
   ```typescript
   import React from 'react';
   import { cn } from '@maiyuri/ui';

   interface ComponentNameProps {
     className?: string;
     children?: React.ReactNode;
   }

   export const ComponentName: React.FC<ComponentNameProps> = ({
     className,
     children
   }) => {
     return (
       <div className={cn('base-styles', className)}>
         {children}
       </div>
     );
   };
   ```

3. **Add to barrel export:**
   ```typescript
   // index.ts
   export { ComponentName } from './ComponentName';
   export type { ComponentNameProps } from './ComponentName';
   ```

4. **Write tests:**
   ```typescript
   import { render, screen } from '@testing-library/react';
   import { ComponentName } from './ComponentName';

   describe('ComponentName', () => {
     it('renders children', () => {
       render(<ComponentName>Test</ComponentName>);
       expect(screen.getByText('Test')).toBeInTheDocument();
     });
   });
   ```

## Component Patterns

### Lead Card Component

```typescript
import { Card, Badge } from '@maiyuri/ui';
import type { Lead } from '@maiyuri/shared';

interface LeadCardProps {
  lead: Lead;
  onStatusChange?: (status: Lead['status']) => void;
}

export const LeadCard: React.FC<LeadCardProps> = ({ lead, onStatusChange }) => {
  const statusColors = {
    new: 'default',
    follow_up: 'warning',
    hot: 'danger',
    cold: 'default',
    converted: 'success',
    lost: 'danger'
  } as const;

  return (
    <Card className="p-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold">{lead.name}</h3>
          <p className="text-sm text-muted">{lead.contact}</p>
        </div>
        <Badge variant={statusColors[lead.status]}>
          {lead.status.replace('_', ' ')}
        </Badge>
      </div>
    </Card>
  );
};
```

### Form Component with React Hook Form

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLeadSchema, type CreateLeadInput } from '@maiyuri/shared';
import { Button } from '@maiyuri/ui';

export const CreateLeadForm: React.FC<{
  onSubmit: (data: CreateLeadInput) => void;
}> = ({ onSubmit }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateLeadInput>({
    resolver: zodResolver(createLeadSchema)
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input {...register('name')} placeholder="Lead name" />
      {errors.name && <span className="text-red-500">{errors.name.message}</span>}

      <Button type="submit">Create Lead</Button>
    </form>
  );
};
```

## Best Practices

- Use TypeScript interfaces for props
- Use Tailwind CSS classes (no inline styles)
- Use design tokens from theme
- Co-locate tests with components
- Export from index.ts for clean imports
- Use `cn()` utility for class merging
- Functional components only (no class components)
