/**
 * «Разбор сайта» (x-ray): `Xray` монтируется в layout один раз, открывают его
 * `openXray(кнопка)` — из палитры ⌘K и из финала мини-игры.
 */
export { Xray } from "./xray";
export { canOpenXray, closeXray, openXray, useXrayOpen, XRAY_MEDIA } from "./store";
