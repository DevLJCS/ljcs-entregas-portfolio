// LJCS line icons: one 24px grid, rounded strokes, no font or remote asset dependency.
const paths = {
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 building:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M8 9h1M15 9h1M8 13h1M15 13h1"/>',
 route:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h8"/>',
 motorcycle:'<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-8h6l3 8M8 7h4M14 4h3l2 5M8 12l4 5h3M10 9l-2 3H4"/>',
 wallet:'<path d="M20 8V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1 0-4"/><path d="M20 12h-5a2 2 0 0 0 0 4h5"/><path d="M16 14h.01"/>',
 receipt:'<path d="M5 3l2 2 2-2 3 2 3-2 2 2 2-2v18l-2-2-2 2-3-2-3 2-2-2-2 2V3Z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
 history:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 trend:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
 clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3M18 5l2 2"/>',
 fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M2 21h13M4 10h9M13 12h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-4-4M18 6v4h3"/>',
 gauge:'<path d="M4 19a9 9 0 1 1 16 0M5 15H3M7 7l1 1M12 3v2M17 7l-5 6M21 15h-2"/><circle cx="12" cy="13" r="1.5"/>',
 wrench:'<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-4 4-4-4 4-4Z"/>',
 pencil:'<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 chevronLeft:'<path d="m14 5-7 7 7 7"/>',
 chevronRight:'<path d="m10 5 7 7-7 7"/>',
 logout:'<path d="M9 4H4v16h5M10 12h11m-5-5 5 5-5 5"/>',
 search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9M16 16l3-3M19 19l3-3"/>',
 list:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h4M7 8h.01M7 12h.01M7 16h.01"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 play:'<path d="m8 4 12 8-12 8V4Z"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',
 stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 cloud:'<path d="M7 18a5 5 0 1 1-1-10 7 7 0 0 1 13 2 4 4 0 0 1-1 8H7Z"/>',
 cloudCheck:'<path d="M7 18a5 5 0 1 1-1-10 7 7 0 0 1 13 2 4 4 0 0 1-1 8"/><path d="m9 17 3 3 5-6"/>',
 sync:'<path d="M3 10a9 9 0 0 1 15-6l3 3M21 3v4h-4M21 14A9 9 0 0 1 6 20l-3-3M3 21v-4h4"/>',
 offline:'<path d="M3 3l18 18M7 18a5 5 0 0 1-1-10M10 5a7 7 0 0 1 9 5 4 4 0 0 1 2 6M10 18h6"/>',
 warning:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>'
};
export function icon(name) {
 const shape = paths[name];
 if (!shape) throw new Error(`Unknown LJCS icon: ${name}`);
 return `<svg class="svg-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
}
export function hydrateIcons(root = document) {
 const elements = [...(root.matches?.('[data-icon]') ? [root] : []), ...root.querySelectorAll('[data-icon]')];
 for (const element of elements) if (!element.firstElementChild) element.innerHTML = icon(element.dataset.icon);
}
export function initIcons() {
 hydrateIcons();
 new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) hydrateIcons(node);
 }).observe(document.body, {childList:true,subtree:true});
}
