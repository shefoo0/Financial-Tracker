/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Contrast: text and accent colours meet WCAG AA (4.5:1) on `background` and
// `backgroundElement` in both schemes. Use `positive`/`negative`/`warning`
// together with a sign, word or icon, never colour alone.
export const Colors = {
  light: {
    text: '#0B0D10',
    background: '#FFFFFF',
    backgroundElement: '#F2F3F5',
    backgroundSelected: '#E2E4E8',
    textSecondary: '#5A606A',
    border: '#D5D8DE',
    accent: '#0B6E5F',
    onAccent: '#FFFFFF',
    positive: '#0A7A3E',
    negative: '#B4232C',
    warning: '#8A5A00',
  },
  dark: {
    text: '#F5F6F8',
    background: '#0B0D10',
    backgroundElement: '#1A1D22',
    backgroundSelected: '#2A2E35',
    textSecondary: '#AEB4BE',
    border: '#3A3F47',
    accent: '#3CC4A9',
    onAccent: '#06201B',
    positive: '#4CC98A',
    negative: '#FF7A82',
    warning: '#F2B84B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
