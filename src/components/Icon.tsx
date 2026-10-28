// Inline stroke icons drawn with currentColor, so CSS colour and opacity carry every state (better-ui).
// Static markup only — nothing user-supplied ever reaches dangerouslySetInnerHTML here.
const PATHS = {
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'undo': '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  'bot': '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v1M15 13v1"/>',
  'review': '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>',
  'cards': '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v10M21 7v10"/>',
  'list': '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  'flow': '<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3a3 3 0 003 3h4.5"/>',
  'seq': '<path d="M6 3v18M18 3v18"/><path d="M6 8h12l-3-3M18 16H6l3 3"/>',
  'spec': '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M10 13l-2 2 2 2M14 13l2 2-2 2"/>',
  'send': '<path d="M5 12h13M13 6l6 6-6 6"/>',
  'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
  'chev-d': '<path d="M6 9l6 6 6-6"/>',
  'chev-l': '<path d="M15 6l-6 6 6 6"/>',
  'chev-r': '<path d="M9 6l6 6-6 6"/>',
  'alert': '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'moon': '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
  'panel': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  'link': '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  'edit': '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/>',
  'paste': '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  'minus': '<path d="M5 12h14"/>',
  'fit': '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  'tracks': '<path d="M6 4v16M18 4v6M18 14v6"/><circle cx="18" cy="12" r="2"/>',
  'live': '<path d="M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  'retry': '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5"/>',
  'key': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  'logout': '<path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9"/>',
  'code': '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
  'monitor': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
}
