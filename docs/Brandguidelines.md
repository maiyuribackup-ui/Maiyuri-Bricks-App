# Maiyuri Bricks – Brand Design System

> **Purpose**  
This document is the single source of truth for branding across **App, Website, Invoices, PDFs, and Marketing Collateral**.  
All designers and developers must follow this to ensure long-term consistency, clarity, and trust.

---

## 1. Brand Philosophy

**Positioning:** Nature engineered with precision  

The brand must communicate:
- Sustainability (eco-friendly mud bricks)
- Structural reliability (construction-grade trust)
- Modern systems thinking (app-first, data-driven)
- Premium yet grounded aesthetics

---

## 2. Color Token System

> ❗ Rule: **Never use raw hex codes directly in components**. Always reference tokens.

---

### 2.1 Core Brand Tokens

```css
--color-brand-primary:   #1F6F43; /* Earth Green */
--color-brand-secondary: #8B5E3C; /* Clay Brown */
--color-brand-accent:    #2F80ED; /* Peacock Blue */
```

**Usage**
- Primary: Main CTAs, headers, highlights
- Secondary: Brick visuals, cost/material sections
- Accent: Links, icons, interactive states

---

### 2.2 Neutral & Background Tokens

```css
--color-bg-primary:   #F7F7F4; /* Page / App background */
--color-bg-secondary: #FFFFFF; /* Cards, invoices */
--color-bg-dark:      #1E1E1E; /* Dark sections, hoardings */
```

---

### 2.3 Text Tokens

```css
--color-text-primary:   #2E2E2E; /* Main content */
--color-text-secondary: #5F5F5F; /* Subtext */
--color-text-muted:     #8A8A8A; /* Hints, placeholders */
--color-text-inverse:   #FFFFFF; /* On dark backgrounds */
```

---

### 2.4 Semantic / Functional Tokens

```css
--color-success:    #2E7D32;
--color-success-bg: #E8F5E9;

--color-warning:    #ED6C02;
--color-warning-bg: #FFF3E0;

--color-error:      #D32F2F;
--color-error-bg:   #FDECEA;
```

**Meaning**
- Success: Confirmed actions, eco-compliance
- Warning: Stock alerts, pending actions
- Error: Validation failures, payment issues

---

### 2.5 Component Tokens

#### Buttons
```css
--btn-primary-bg:    var(--color-brand-primary);
--btn-primary-text: #FFFFFF;

--btn-secondary-bg:    var(--color-brand-secondary);
--btn-secondary-text: #FFFFFF;

--btn-outline-border: var(--color-brand-primary);
--btn-outline-text:   var(--color-brand-primary);
```

#### Borders & Dividers
```css
--color-border-light:  #E0E0E0;
--color-border-medium: #C2C2C2;
```

#### Shadows
```css
--shadow-soft:   0 2px 6px rgba(0,0,0,0.08);
--shadow-medium: 0 4px 12px rgba(0,0,0,0.12);
```

---

### 2.6 Dark Mode Tokens (Future Ready)

```css
--dark-bg-primary:   #121212;
--dark-bg-secondary: #1E1E1E;

--dark-text-primary:   #EAEAEA;
--dark-text-secondary: #BDBDBD;
```

---

## 3. Typography System

### 3.1 Recommended Font Pairing (Primary)

**Headings:** Inter  
**Body & Invoices:** Source Sans 3

```text
Headings: Inter SemiBold / Medium
Body: Source Sans 3 Regular
```

**Rationale**
- Professional and modern
- Excellent readability on screens and print
- Suitable for dashboards, invoices, and long documents

---

### 3.2 Alternative Font Pairings

**Corporate Option**  
- Headings: Poppins  
- Body: Roboto

**Eco-Luxury Option**  
- Headings: Manrope  
- Body: Inter

---

### 3.3 Font Size Scale

```text
H1: 32px
H2: 24px
H3: 20px
Body: 16px
Small: 14px
Caption: 12px
```

Line Height:
```text
Body: 1.6
Headings: 1.3
```

---

## 4. Invoice Typography Rules (Non-Negotiable)

- Body text: Regular
- Numbers: Medium
- Totals / Grand Total: SemiBold
- Avoid decorative fonts

This improves clarity, reduces disputes, and increases trust.

---

## 5. Color Usage Hierarchy

```text
60% Neutral (Backgrounds & Text)
25% Brand Primary (Earth Green)
10% Brand Secondary (Clay Brown)
5% Accent (Peacock Blue)
```

---

## 6. Strict Do & Don’t

### Do
- Use tokens consistently
- Keep UI calm and structured
- Let materials and data speak

### Don’t
- Use neon or bright greens
- Mix multiple accent colors together
- Add yellow/orange tones

---

## 7. Governance Rule

Any new screen, document, or feature must:
1. Use approved tokens
2. Follow typography scale
3. Maintain brand hierarchy

If it violates these rules, it does not ship.

---

**Maiyuri Bricks**  
*Built from earth. Engineered for the future.*

