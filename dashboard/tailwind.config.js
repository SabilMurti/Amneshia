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
          950: '#050608',
          900: '#08090c',
          850: '#0d0f14',
          800: '#12141c',
          700: '#1a1d28',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-active': 'rgba(245, 158, 11, 0.4)',
        },
        cyber: {
          amber: '#f59e0b',
          gold: '#fbbf24',
          cyan: '#06b6d4',
          emerald: '#10b981',
          violet: '#8b5cf6',
          rose: '#f43f5e',
        }
      },
      boxShadow: {
        'glow-amber': '0 0 24px -4px rgba(245, 158, 11, 0.25)',
        'glow-cyan': '0 0 24px -4px rgba(6, 182, 212, 0.25)',
        'glow-subtle': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}

