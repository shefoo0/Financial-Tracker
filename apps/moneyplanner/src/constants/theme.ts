/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 2026 redesign ("Bold cards + Glass fintech", design/redesign-2026.png):
// an aurora background, frosted glass cards and a gradient hero card.
// Contrast: text, textSecondary, accent, positive, negative and warning meet
// WCAG AA (4.5:1) on `background` and on `glass` over the aurora in both
// schemes. Use positive/negative/warning together with a sign, word or icon,
// never colour alone. White text meets AA on every hero gradient stop.
export const Colors = {
  light: {
    text: '#12142B',
    background: '#F4F5FB',
    /** Solid surface for inputs, sheets and pressed rows. */
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E4FF',
    textSecondary: '#555A75',
    border: '#DCDDEB',
    accent: '#5A4DFF',
    onAccent: '#FFFFFF',
    positive: '#087A48',
    negative: '#D02A64',
    onNegative: '#FFFFFF',
    warning: '#9A5C00',
    /** Frosted glass card fill and its hairline border. */
    glass: 'rgba(255,255,255,0.66)',
    glassBorder: 'rgba(255,255,255,0.95)',
    /** Soft shadow under glass cards (light mode only; dark uses the border). */
    shadow: 'rgba(60,50,140,0.10)',
    /** Three aurora blobs behind every screen: top-left, right, bottom-left. */
    aurora: ['#D9D6FF', '#FFD6EC', '#CCF5EA'],
    /** The gradient hero card (balance) and primary buttons; white text on top. */
    hero: ['#5B4DFF', '#8B45F0', '#D8458F'],
    /** Glow colour for chart lines and the selected tab. */
    glow: '#5A4DFF',
    tabBar: 'rgba(255,255,255,0.80)',
  },
  dark: {
    text: '#EEF2FF',
    background: '#070914',
    backgroundElement: '#151831',
    backgroundSelected: '#262A4D',
    textSecondary: '#A9B0CC',
    border: '#2C3152',
    accent: '#5EF0FF',
    onAccent: '#04202A',
    positive: '#3EE39A',
    negative: '#FF6B9A',
    onNegative: '#2A0A14',
    warning: '#FFC25A',
    glass: 'rgba(255,255,255,0.07)',
    glassBorder: 'rgba(255,255,255,0.14)',
    shadow: 'rgba(0,0,0,0)',
    aurora: ['#2A2A8A', '#6A1FB0', '#0B6B62'],
    hero: ['#5B4DFF', '#8B45F0', '#D8458F'],
    glow: '#5EF0FF',
    tabBar: 'rgba(10,12,24,0.85)',
  },
} as const;

/** Category and profile colours (icon tiles and avatars), readable in both schemes. */
export const Palette = ['#FF8A4C', '#5B4DFF', '#1FB57A', '#E0447C', '#1FA2D6', '#C78A00', '#8B45F0', '#5E6B85'] as const;

export const Radius = { sm: 12, md: 18, lg: 22, xl: 28, pill: 999 } as const;

/** Keys whose value is a single colour (not the aurora/hero lists). */
export type ThemeColor = {
  [K in keyof typeof Colors.light]: (typeof Colors.light)[K] extends string ? K : never;
}[keyof typeof Colors.light];
export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];

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
