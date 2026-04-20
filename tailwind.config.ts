import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        lfa: {
          bg:     '#0b0e14',
          card:   '#161b22',
          border: '#30363d',
          neon:   '#00ff88',
          gold:   '#ffd700',
          danger: '#ff4757',
          text:   '#8b949e',
          light:  '#c9d1d9',
        },
      },
      fontFamily: {
        orbitron: ['var(--font-orbitron)', 'Orbitron', 'sans-serif'],
        sans:     ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        neon:      '0 0 20px rgba(0, 255, 136, 0.25)',
        'neon-lg': '0 0 40px rgba(0, 255, 136, 0.35)',
        gold:      '0 0 20px rgba(255, 215, 0, 0.25)',
      },
      backgroundImage: {
        'lfa-grid': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg stroke='%2300ff88' stroke-width='0.2' stroke-opacity='0.08'%3E%3Cpath d='M40 0H0v40'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        shimmer:   'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
