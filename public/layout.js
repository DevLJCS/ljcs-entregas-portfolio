// Keep complete monetary values readable. Large totals shrink before wrapping.
export function initLayout() {
 const main = document.querySelector('main');
 const selectors = '.stat-card > strong, .work-metric > strong, .goal-target strong, #goal-earned';
 let scheduled = false;
 const canvas = document.createElement('canvas');
 const measure = canvas.getContext('2d');
 if (!main || !measure) return;
 const fit = () => {
  scheduled = false;
  main.querySelectorAll(selectors).forEach(element => {
   if (!element.getClientRects().length || element.clientWidth === 0) return;
   element.style.fontSize = '';
   const style = getComputedStyle(element);
   const available = element.clientWidth;
   const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
   measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
   const width = measure.measureText(text).width;
   if (width > available) element.style.fontSize = `${Math.max(16, Math.floor(parseFloat(style.fontSize) * available / width * .96))}px`;
  });
 };
 const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(fit); } };
 new ResizeObserver(schedule).observe(main);
 new MutationObserver(schedule).observe(main, {subtree:true,childList:true,characterData:true});
 window.addEventListener('resize', schedule);
 document.addEventListener('ljcs-layout', schedule);
 schedule();
}
