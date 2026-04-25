/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bebas Neue', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          red: '#E8003D',
          redDark: '#B8002E',
          gold: '#F5C842',
          goldDark: '#C9A020',
        },
        surface: {
          950: '#080A0F',
          900: '#0E1117',
          800: '#161B26',
          700: '#1E2535',
          600: '#2A3347',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'seat-pop': 'seatPop 0.2s ease-out',
        'fade-up': 'fadeUp 0.4s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        seatPop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
