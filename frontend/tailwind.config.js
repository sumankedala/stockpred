/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#080A10',
        darkCard: '#0F121C',
        darkBorder: '#1E2433',
        brandBlue: '#3B82F6',
        brandGreen: '#10B981',
        brandRed: '#EF4444',
      }
    },
  },
  plugins: [],
}
