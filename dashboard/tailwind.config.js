/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#09090b',
          card: '#121215',
          border: '#27272a',
          accent: '#f59e0b',
        }
      }
    },
  },
  plugins: [],
}
