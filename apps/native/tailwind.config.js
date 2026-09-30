/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mirror the web app's brand tokens (manifest theme_color / bg).
        brand: '#f97316',
        'brand-dark': '#ea580c',
        ink: '#0f172a',
        // Softer semantic surfaces so the UI leans on depth + space, not
        // hairline slate borders everywhere (the "web dashboard" look).
        canvas: '#f5f6f8', // app background
        line: '#eceff3', // hairlines when genuinely needed
        muted: '#64748b',
        subtle: '#94a3b8',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
        '3xl': '26px',
      },
      // Comfortable, less-crowded type ramp — every size bumped ~1–2px from
      // the Tailwind defaults so the whole app reads bigger and calmer.
      fontSize: {
        xs: '13px',
        sm: '15px',
        base: '17px',
        lg: '19px',
        xl: '22px',
        '2xl': '26px',
        '3xl': '32px',
        '4xl': '40px',
      },
    },
  },
  plugins: [],
};
