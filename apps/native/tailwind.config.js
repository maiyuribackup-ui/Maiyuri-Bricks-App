/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mirror the web app's brand tokens (manifest theme_color / bg).
        brand: '#f97316',
        ink: '#0f172a',
      },
    },
  },
  plugins: [],
};
