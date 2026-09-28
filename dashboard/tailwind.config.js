/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        obsidian: {
          950: '#05040a',
          900: '#080612',
          850: '#0c0a1a',
          800: '#120f26',
          750: '#171333',
          700: '#1f1945',
          border: 'rgba(168, 85, 247, 0.12)',
          'border-active': 'rgba(168, 85, 247, 0.45)',
          'border-subtle': 'rgba(255, 255, 255, 0.06)',
        },
        amethyst: {
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
        cyber: {
          violet: '#8b5cf6',
          purple: '#a855f7',
          indigo: '#6366f1',
          gold: '#fbbf24',
          amber: '#f59e0b',
          emerald: '#10b981',
          cyan: '#06b6d4',
          rose: '#f43f5e',
        }
      },
      boxShadow: {
        'glow-purple': '0 0 32px -4px rgba(139, 92, 246, 0.35)',
        'glow-amethyst': '0 0 24px -2px rgba(168, 85, 247, 0.4)',
        'glow-subtle': '0 4px 24px -2px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(168, 85, 247, 0.15)',
        'glow-active': '0 0 0 1px rgba(168, 85, 247, 0.4), 0 8px 30px -4px rgba(139, 92, 246, 0.25)',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
        'float-slow': 'float-slow 6s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
