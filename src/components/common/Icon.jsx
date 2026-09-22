import * as LucideIcons from 'lucide-react';
import { pxToRem } from '../../utils/uiScale';

// Icons that point somewhere (next, back, forward). In right-to-left languages
// these are mirrored by CSS so "next" still points the way the eye is travelling.
const DIRECTIONAL_ICONS = new Set([
  'ChevronRight',
  'ChevronLeft',
  'ChevronsRight',
  'ChevronsLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowUpRight',
  'ExternalLink',
  'Reply',
  'Send',
  'LogOut',
]);

/**
 * Resolves a lucide-react icon component from its string name, so config
 * files (navigation.js, etc.) can reference icons by name without every
 * consumer needing its own import list.
 *
 * `size` is written as pixels at the base design size; it is handed to the SVG
 * in rem, so icons grow with the rest of the UI on large / 4K screens.
 */
function Icon({ name, size = 18, className = '', ...rest }) {
  const LucideIcon = LucideIcons[name];

  if (!LucideIcon) {
    return null;
  }

  const classes = DIRECTIONAL_ICONS.has(name) ? `${className} icon-directional`.trim() : className;

  return <LucideIcon size={pxToRem(size)} className={classes} {...rest} />;
}

export default Icon;
