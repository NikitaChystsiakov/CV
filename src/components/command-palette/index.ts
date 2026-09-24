/**
 * Командная палитра (⌘K): `CommandPalette` монтируется в layout один раз,
 * `CommandPaletteTrigger` — кнопка для верхней панели. Состояние у них общее.
 */
export { CommandPalette } from "./command-palette";
export { CommandPaletteTrigger } from "./trigger";
export { closePalette, openPalette, togglePalette, usePaletteOpen } from "./store";
