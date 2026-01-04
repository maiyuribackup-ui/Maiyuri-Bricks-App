# packages/ui - UI Component Library CLAUDE.md

Shared UI component library used across the monorepo.

## Design System
- Tailwind CSS with shared config
- Design tokens for colors, spacing, typography
- Consistent component API patterns

## Component Categories
- **Primitives:** Button, Input, Card, Badge, Spinner
- **Composites:** LeadCard, NoteTimeline, AIPanel
- **Layouts:** PageLayout, ModalLayout, FormLayout

## Component Rules
- All components must be accessible (a11y)
- Support dark/light mode via design tokens
- Export from index.ts for clean imports
- Include TypeScript props interface
- Mobile-first responsive

## Testing
- Vitest for unit tests
- Co-locate tests: `Component.test.tsx`
- Test accessibility with testing-library

## Documentation
- JSDoc comments for component props
- Usage examples in component files
