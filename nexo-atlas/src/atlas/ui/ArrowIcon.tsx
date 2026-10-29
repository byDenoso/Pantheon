/** Navigation icon uses geometry rather than optional font glyphs. */
export default function ArrowIcon({direction='up-right'}:{direction?:'up-right'|'right'|'left'}){
 return <svg className="nexo-arrow-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{direction==='right'?<path d="M5 12h14m-6-6 6 6-6 6"/>:direction==='left'?<path d="M19 12H5m6 6-6-6 6-6"/>:<path d="M6 18 18 6M6 6h12v12"/>}</svg>;
}
