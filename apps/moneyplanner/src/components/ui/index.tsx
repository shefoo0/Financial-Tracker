// Shared UI kit ("Bold cards + Glass fintech", 2026 redesign). One file per component
// (plus text.tsx, internal.tsx and surfaces.tsx); everything is re-exported from here.
// Every interactive element takes a `testID` (for Maestro) and has an
// accessibility label. Tap targets are at least 44pt tall. Text scales with the
// system font size.

export { T, type Tone } from './text';
export { AuroraBackground, Avatar, Card, HeroCard, IconBadge, Pill, StatTile } from './surfaces';
export { Screen, ScreenHeader } from './Screen';
export { Sheet } from './Sheet';
export { SectionHeader } from './SectionHeader';
export { Button } from './Button';
export { TextField } from './TextField';
export { KeyboardDoneBar } from './KeyboardDoneBar';
export { MoneyField } from './MoneyField';
export { DateField } from './DateField';
export { type SelectOption, SelectField } from './SelectField';
export { Segmented } from './Segmented';
export { ToggleRow } from './ToggleRow';
export { ListRow } from './ListRow';
export { EmptyState } from './EmptyState';
export { Stat } from './Stat';
