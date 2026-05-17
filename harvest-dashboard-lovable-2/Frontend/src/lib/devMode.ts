/**
 * Set VITE_DEV=true in Frontend/.env to enable developer tooltips (the "D" button on KPI cards).
 * Remove or set to false to hide them from regular users.
 */
export const IS_DEV_MODE = import.meta.env.VITE_DEV === "true";
