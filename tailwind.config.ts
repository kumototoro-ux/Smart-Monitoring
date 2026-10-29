import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#E8E8F0',
        surface: '#F5F5F9',
        line: '#E6E6EE',
        ink: {
          DEFAULT: '#1B1B22',
          soft: '#4A4A57',
          muted: '#8A8A99',
          faint: '#B4B4C2',
        },
        rose: { tile: '#F6DCE3', DEFAULT: '#C4365E', soft: '#FBEAEF' },
        lilac: { tile: '#E0DFF5' },
        peri: { tile: '#DCE2F7', DEFAULT: '#7D82D8', soft: '#ECEDFB', deep: '#5A5FC2' },
        mint: { DEFAULT: '#2E8B6A', soft: '#E3F4EC' },
        amber: { DEFAULT: '#B7791F', soft: '#FBF1DD' },
      },
      fontFamily: {
        sans: ['"Readex Pro Variable"', 'system-ui', 'Tahoma', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        shell: '28px',
      },
      boxShadow: {
        shell: '0 30px 60px -30px rgba(60, 60, 110, 0.25)',
        pop: '0 18px 40px -12px rgba(40, 40, 80, 0.28)',
        soft: '0 1px 2px rgba(30, 30, 60, 0.04)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(-100%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
