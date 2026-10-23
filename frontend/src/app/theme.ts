import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Light, clean, dark-green brand on top of PrimeNG Aura. */
export const KcalPreset = definePreset(Aura, {
  primitive: {
    green: {
      50: '#eef7f1',
      100: '#d6ecdd',
      200: '#add9bd',
      300: '#7cbf96',
      400: '#4ea06f',
      500: '#2f8453',
      600: '#206a40',
      700: '#195534',
      800: '#14442a',
      900: '#103823',
      950: '#082014',
    },
  },
  semantic: {
    primary: {
      50: '{green.50}',
      100: '{green.100}',
      200: '{green.200}',
      300: '{green.300}',
      400: '{green.400}',
      500: '{green.500}',
      600: '{green.600}',
      700: '{green.700}',
      800: '{green.800}',
      900: '{green.900}',
      950: '{green.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{green.700}',
          contrastColor: '#ffffff',
          hoverColor: '{green.800}',
          activeColor: '{green.900}',
        },
        highlight: {
          background: '{green.50}',
          focusBackground: '{green.100}',
          color: '{green.800}',
          focusColor: '{green.900}',
        },
        surface: {
          0: '#ffffff',
          50: '#f6f8f6',
          100: '#eef1ee',
          200: '#e1e6e2',
          300: '#cbd3cd',
          400: '#a3aea6',
          500: '#7a877e',
          600: '#5c6960',
          700: '#435047',
          800: '#2c3830',
          900: '#1a241d',
          950: '#0f1611',
        },
        text: {
          color: '#14281d',
          hoverColor: '#0b1a12',
          mutedColor: '#5c6960',
          hoverMutedColor: '#435047',
        },
      },
    },
  },
});
