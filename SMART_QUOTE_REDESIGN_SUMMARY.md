# Smart Quote Redesign - Steve Jobs Style

## Overview

Complete redesign of the Smart Quote customer-facing page (`/sq/[slug]`) to create a premium, conversion-focused presentation experience inspired by Apple's product pages.

## Design Philosophy

- **One idea per screen**: Each section focuses on a single concept
- **Full-bleed visuals**: High-quality images that command attention
- **Minimal words**: Short, impactful copy
- **Premium whitespace**: Generous breathing room throughout
- **Smooth animations**: Subtle fade-up effects (8px, 250ms)

## New Color Scheme

Updated from earthy tones to sophisticated neutrals:

```typescript
{
  "colors": {
    "bg": "#FBF7F2",           // Warm Off-White
    "surface": "#FFFFFF",       // Pure White
    "ink": "#161616",          // Deep Ink
    "muted": "#5B5B5B",        // Muted Gray
    "line": "#E8DED2",         // Subtle Line
    "accent": "#C46A2B",       // Warm Accent
    "accent2": "#8B4A22",      // Darker Accent
    "success": "#1E7F4D"       // Natural Success
  }
}
```

## Typography System

Precise sizing following Apple's approach:

```typescript
{
  "h1_desktop": 44,  // Hero headlines
  "h1_mobile": 34,
  "h2_desktop": 32,  // Section titles
  "h2_mobile": 26,
  "body_large": 18-20, // Key copy
  "body_base": 16-18   // Standard text
}
```

## Layout Tokens

```typescript
{
  "maxWidth": 1040,              // Premium max width
  "sectionPaddingDesktop": 80,
  "sectionPaddingMobile": 48,
  "radius": {
    "card": 20,
    "button": 14,
    "chip": 999
  }
}
```

## New Section Structure

### 1. Hero (`data-section="hero"`)

**Changed:**

- Full-screen height (min-h-screen)
- New copy: "You've admired homes inspired by traditional Tamil architecture..."
- Trust chips added: "2–3 minutes", "No spam", "No pressure"
- CTA button in hero (scrolls to next section)
- Gradient overlay: `rgba(0,0,0,0.70)` top to `rgba(0,0,0,0.35)` bottom

**Removed:**

- Generic "Build cooler. Live healthier." copy
- Word "Affordably" completely removed
- Scroll indicator

### 2. Made For You (`data-section="made_for_you"`)

**Changed:**

- Updated default personalization snippets
- Cleaner card styling with subtle border

**Kept:**

- AI-generated personalization
- Persona badge display

### 3. Why Chennai Works (`data-section="why_chennai_works"`)

**NEW SECTION:**

- 3 icon cards in grid layout
- Chennai-specific logic addressing "will this work here?"
- Icons: 🌡️ (Built for heat), 🏗️ (Local masons), ✓ (Proven in Chennai)
- Bilingual content (EN/தமிழ்)

**Replaces:** ChennaiLogicSection (which showed one angle with image)

### 4. Proof Teaser (`data-section="proof_teaser"`)

**Changed:**

- Shows 2-3 real project images in grid
- Image captions overlay on hover
- Location labels (Adyar, Velachery, Tambaram)
- "150+ homes built" stat below

**Removed:**

- Icon badges (🏠, 📍, ⭐)
- Google rating display

### 5. Smart Range (`data-section="smart_range"`)

**Changed:**

- Cost displayed as range only
- "What affects it" chips (4 factors)
- Removed image component
- Narrower container (max-w-[720px])

**Chips show:**

- Design complexity / வடிவமைப்பு சிக்கல்தன்மை
- Location / பகுதி
- Home size / வீட்டின் அளவு
- Finish options / பூச்சு விருப்பம்

**Removed:**

- "25-35% savings" comparison
- Cost breakdown image

### 6. Objection Handling (`data-section="objection_handling"`)

**Changed:**

- Accordion UI (max 2 objections)
- First objection open by default
- Chevron icon for expand/collapse
- Cleaner interaction pattern

**Props updated:**

- `objection` → `objections` (array)

### 7. Final CTA (`data-section="final_cta"`)

**Changed:**

- Section renamed from "cta" to "final_cta"
- Button label already dynamic based on `route_decision`

**No changes needed** - already implements dynamic CTA labels.

## Updated Components

### Modified Files:

1. **tokens.ts** - New color scheme, typography, spacing
2. **HeroSection.tsx** - Full redesign with new copy, trust chips, CTA
3. **PersonalizationCard.tsx** - Minor styling updates
4. **ProofSection.tsx** - Changed to project image grid
5. **PriceSection.tsx** - Range display with factor chips
6. **ObjectionAnswerSection.tsx** - Accordion UI for max 2 objections
7. **SmartQuoteView.tsx** - New section order, updated data flow

### New Files:

1. **WhyChennaiWorksSection.tsx** - Chennai-specific 3-card section
2. **FadeInSection.tsx** - Fade-up animation wrapper component

## Copy Changes

### Hero Copy (Both Languages):

**English:**

```
H1: "You've admired homes inspired by traditional Tamil architecture.
     Now you can build one in Chennai."

Sub: "Not a heritage village. Not a resort. A real eco-friendly home
      designed for Chennai heat and city living."
```

**Tamil:**

```
H1: "பாரம்பரிய தமிழ் கட்டிடக்கலையால் ஈர்க்கப்பட்ட வீடுகளை
     நீங்கள் பாராட்டியுள்ளீர்கள். இப்போது சென்னையில்
     ஒன்றை நீங்களே கட்டலாம்."

Sub: "பாரம்பரிய கிராமம் அல்ல. ரிசார்ட் அல்ல. சென்னை வெப்பத்திற்கும்
     நகர வாழ்க்கைக்கும் வடிவமைக்கப்பட்ட உண்மையான
     சுற்றுச்சூழல் நட்பு வீடு."
```

### Default Personalization:

```typescript
en: {
  p1: "We've analyzed your needs and believe earth blocks could be
       the perfect fit for your Chennai home.",
  p2: "Let us show you why this works for families like yours."
}
```

## Technical Implementation

### IntersectionObserver

- Threshold updated to **40%** (was 50%)
- Tracks all sections with `data-section` attributes
- Analytics event sent on visibility

### Animation System

- `FadeInSection` component for fade-up effects
- 8px vertical translation
- 250ms duration
- Optional stagger delay
- Triggers at 10% viewport visibility

### Type Safety

- All TypeScript types preserved
- Props updated for accordion (array vs single object)
- No breaking changes to parent components

## Mobile-First Responsive Design

### Breakpoints:

- Mobile: Default (< 768px)
- Tablet: `md:` (768px+)
- Desktop: `lg:` (1024px+)

### Key Responsive Patterns:

- Grid: 1 column → 3 columns (md:grid-cols-3)
- Typography: Smaller mobile sizes with precise scaling
- Spacing: Reduced padding on mobile
- Images: Full-width on mobile, constrained on desktop

## Accessibility

### Maintained:

- Semantic HTML (`<section>`, `<h1>`, `<h2>`)
- Form labels with `htmlFor`
- Alt text for images
- Focus states on interactive elements
- ARIA-compliant accordion

### Enhanced:

- Higher color contrast (Deep Ink #161616 on Warm Off-White #FBF7F2)
- Larger touch targets (min 44px height on buttons)
- Clear visual hierarchy

## Performance Considerations

### Image Optimization:

- Next.js Image component with `priority` on hero
- Proper `sizes` attribute for responsive images
- Lazy loading for below-fold images

### JavaScript:

- IntersectionObserver unobserves after trigger (memory optimization)
- useState for minimal re-renders
- useCallback for memoized functions

## Testing Checklist

### Visual Regression:

- [ ] Hero gradient overlay correct
- [ ] Trust chips display properly
- [ ] WhyChennai cards align in grid
- [ ] Proof images load with captions
- [ ] Price factor chips wrap correctly
- [ ] Accordion chevron animates smoothly

### Functionality:

- [ ] Language toggle switches all content
- [ ] Hero CTA scrolls to next section
- [ ] Accordion expands/collapses
- [ ] Form validation works
- [ ] Analytics events fire on scroll

### Responsive:

- [ ] Mobile: All sections stack properly
- [ ] Tablet: Grid layouts appear
- [ ] Desktop: Max width constrains content
- [ ] Touch targets meet 44px minimum

### Cross-Browser:

- [ ] Chrome (desktop + mobile)
- [ ] Safari (desktop + mobile)
- [ ] Firefox
- [ ] Edge

## Migration Notes

### Breaking Changes:

- `ObjectionAnswerSection` now expects `objections` array (not `objection` object)
- `PriceSection` no longer accepts `image` prop
- `ChennaiLogicSection` removed (replaced by `WhyChennaiWorksSection`)

### Backward Compatibility:

- Legacy UI components still exported from index.ts
- Old design tokens remain for backward compat
- No database schema changes required

## Future Enhancements

### Recommended:

1. **Real project images**: Replace Unsplash placeholders with actual Chennai projects
2. **Video testimonials**: Add to Proof section
3. **Interactive cost calculator**: Enhance Price section
4. **3D block viewer**: Add to Why Chennai section
5. **Chat widget**: Add to Final CTA for instant support

### Analytics to Track:

- Hero CTA click rate
- Accordion open rates per objection
- Form submission by route_decision type
- Average time on page
- Scroll depth per section

## Files Changed

### Core Files:

- `apps/web/src/components/smart-quote/SmartQuoteView.tsx`
- `apps/web/src/components/smart-quote/tokens.ts`
- `apps/web/src/components/smart-quote/index.ts`

### Section Components:

- `apps/web/src/components/smart-quote/ui/HeroSection.tsx`
- `apps/web/src/components/smart-quote/ui/PersonalizationCard.tsx`
- `apps/web/src/components/smart-quote/ui/ProofSection.tsx`
- `apps/web/src/components/smart-quote/ui/PriceSection.tsx`
- `apps/web/src/components/smart-quote/ui/ObjectionAnswerSection.tsx`

### New Components:

- `apps/web/src/components/smart-quote/ui/WhyChennaiWorksSection.tsx`
- `apps/web/src/components/smart-quote/ui/FadeInSection.tsx`

## Deployment Checklist

- [x] TypeScript compilation passes
- [ ] Run `bun lint` and fix any issues
- [ ] Run `bun test` for unit tests
- [ ] Test on Vercel preview deployment
- [ ] Get design approval from stakeholder
- [ ] Monitor Sentry for errors post-deploy
- [ ] Track conversion rate changes in analytics

---

**Design Approved By:** [Designer Name]
**Implementation Date:** 2026-01-18
**Version:** 2.0.0
