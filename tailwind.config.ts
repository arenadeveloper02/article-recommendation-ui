import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

/**
 * Arena DS theme. The existing components use the `indigo` and `slate` Tailwind
 * palettes throughout; those palettes are remapped here to the Arena Design
 * System brand blue (600 = #1A73E8) and grey scale (900 = #2C2D33) so every
 * surface picks up the Arena theme without touching component markup.
 */
const arenaBlue = {
  50: '#F3F8FE',
  100: '#D9E7FB',
  200: '#B3CFF7',
  300: '#8DB7F3',
  400: '#679FEF',
  500: '#418BEB',
  600: '#1A73E8',
  700: '#155CBA',
  800: '#10458B',
  900: '#0A2E5D',
};

const arenaGrey = {
  50: '#F7F8F9',
  100: '#EDEEF1',
  200: '#DCDEE3',
  300: '#C2C5CD',
  400: '#A5A9B4',
  500: '#898E9C',
  600: '#6D717F',
  700: '#575A66',
  800: '#41444D',
  900: '#2C2D33',
};

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#2C2D33',
        paper: '#F7F8F9',
        indigo: arenaBlue,
        slate: arenaGrey,
        brand: arenaBlue,
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'ds-sm': '0 1px 2px rgba(44, 45, 51, 0.08)',
        'ds-md': '0 2px 8px rgba(44, 45, 51, 0.10)',
        'ds-lg': '0 4px 16px rgba(44, 45, 51, 0.12)',
        'ds-xl': '0 8px 32px rgba(44, 45, 51, 0.16)',
      },
    },
  },
  plugins: [typography],
};

export default config;
