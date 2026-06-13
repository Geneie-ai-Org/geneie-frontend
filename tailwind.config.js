/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'sans-serif'],
        brand: ['"DM Sans"', 'Inter', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      keyframes: {
        'spinner-fade': { '0%': { opacity: '1' }, '100%': { opacity: '0.15' } },
        'thin-pulse': { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.5', transform: 'scale(0.85)' } },
        'pulse-dot': { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.3', transform: 'scale(0.8)' } },
        'bounce-dots': { '0%, 80%, 100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } },
        'typing': { '0%': { opacity: '0.2' }, '20%': { opacity: '1' }, '100%': { opacity: '0.2' } },
        'wave': { '0%, 100%': { transform: 'scaleY(0.5)' }, '50%': { transform: 'scaleY(1.5)' } },
        'wave-bars': { '0%, 100%': { transform: 'scaleY(0.4)' }, '50%': { transform: 'scaleY(1)' } },
        'text-blink': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
        'shimmer': { 'to': { backgroundPosition: '-200% center' } },
        'loading-dots': { '0%': { opacity: '0.2' }, '20%': { opacity: '1' }, '100%': { opacity: '0.2' } },
      },
      animation: {
        'spinner-fade': 'spinner-fade 1.2s linear infinite',
      },
    },
  },
  plugins: [],
}
