/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:  ['DM Sans', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        // Editorial paper theme
        brand: '#D9481C',
        'brand-dark': '#B83A13',
        ink: '#1B1710',
        paper: '#F5F0E4',
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          900: '#0d1117',
          800: '#161b22',
          700: '#21262d',
          600: '#2d333b',
        },
      },
      animation: {
        'slide-up': 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)',
        'fade-in':  'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        'pop':      'pop 0.15s ease-out',
      },
      keyframes: {
        slideUp:  { from: { transform: 'translateY(100%)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        scaleIn:  { from: { transform: 'scale(0.9)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } },
        pop:      { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(0.94)' }, '100%': { transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
}
