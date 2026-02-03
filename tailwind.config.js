/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./renderer/**/*.{js,jsx,ts,tsx,html}"
  ],
  theme: {
    extend: {
      colors: {
        codex: {
          bg: '#000000',
          surface: '#0a0a0a',
          elevated: '#111111',
          border: '#1f1f1f',
          'border-subtle': '#161616',
          text: '#e5e5e5',
          'text-secondary': '#8a8a8a',
          muted: '#525252',
          accent: '#ffffff',
          'accent-dim': '#a3a3a3',
          error: '#f87171',
          warning: '#fbbf24',
          live: '#3b82f6'
        }
      },
      fontFamily: {
        sans: ['SF Pro Text', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      fontSize: {
        '2xs': '0.625rem'
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' }
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        }
      }
    }
  },
  plugins: []
};
