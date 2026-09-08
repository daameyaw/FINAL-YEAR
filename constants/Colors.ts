/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#6366f1';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const AppTheme = {
  gradient: ['#1e1b4b', '#3730a3', '#6366f1'] as const,
  gradientLanding: ['#0f0a2e', '#1e1b4b', '#312e81'] as const,
  primary: ['#6366f1', '#4f46e5'] as const,
  accent: ['#8b5cf6', '#7c3aed'] as const,
  warning: ['#f59e0b', '#d97706'] as const,
  success: '#22c55e',
  statusBar: '#1e1b4b',
};
