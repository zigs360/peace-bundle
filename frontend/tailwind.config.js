/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
        xl: '2.5rem',
      },
    },
    extend: {
      colors: {
        app: '#f4f7fb',
        ink: '#0f172a',
        muted: '#64748b',
        primary: {
          50: '#eefaf7',
          100: '#d7f3ec',
          200: '#b1e8da',
          300: '#7dd5c0',
          400: '#4fbaa3',
          500: '#24977f',
          600: '#1b7c68',
          700: '#176355',
          800: '#154f44',
          900: '#123f37',
        },
        accent: {
          50: '#fff9ec',
          100: '#ffefc8',
          200: '#ffdf8b',
          300: '#f8c958',
          400: '#edab2e',
          500: '#db8a18',
          600: '#bd6812',
          700: '#9a4b13',
          800: '#7d3b17',
          900: '#682f17',
        },
        secondary: {
          DEFAULT: '#db8a18',
          50: '#fff9ec',
          100: '#ffefc8',
          200: '#ffdf8b',
          300: '#f8c958',
          400: '#edab2e',
          500: '#db8a18',
          600: '#bd6812',
          700: '#9a4b13',
          800: '#7d3b17',
          900: '#682f17',
        },
      },
      boxShadow: {
        soft: '0 16px 40px rgba(15, 23, 42, 0.08)',
        'soft-lg': '0 24px 64px rgba(15, 23, 42, 0.12)',
        focus: '0 0 0 4px rgba(36, 151, 127, 0.18)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
