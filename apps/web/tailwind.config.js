/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        destructive: 'rgb(var(--color-danger) / <alpha-value>)',
        card: 'rgb(var(--color-bg-card) / <alpha-value>)',
        accent: 'rgb(var(--color-bg-secondary) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
