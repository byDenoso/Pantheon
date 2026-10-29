import {useEffect, useRef} from 'react';
import {createCinemaMedia, type CinemaAssets} from '../cinema/media-controller.mjs';
import '../cinema/cinema.css';
const files = import.meta.glob('../cinema/assets/*.{jpg,mp4}', {eager: true, query: '?url', import: 'default'}) as Record<string, string>;
const asset = (name: string) => files[`../cinema/assets/${name}`];
const themes = ['light','dark'] as const;
const orientations = ['portrait','landscape'] as const;
const assets = {videos: {}, videosHd: {}, posters: {}} as CinemaAssets;
for (const theme of themes) {
  assets.videos[theme] = {} as CinemaAssets['videos']['dark'];
  assets.videosHd![theme] = {landscape: asset(`cinema-${theme}-landscape-1080.mp4`)};
  assets.posters[theme] = {} as CinemaAssets['posters']['dark'];
  for (const orientation of orientations) {
    assets.videos[theme][orientation] = asset(`cinema-${theme}-${orientation}.mp4`);
    assets.posters[theme][orientation] = [1,2,3].map(i => asset(`poster-${theme}-${orientation}-${i}.jpg`));
  }
}
export default function CinematicBackdrop({paused}: {paused: boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  const cinema = useRef<ReturnType<typeof createCinemaMedia> | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    cinema.current = createCinemaMedia(ref.current, assets, {paused});
    return () => { cinema.current?.dispose(); cinema.current = null; };
  }, []);
  useEffect(() => { cinema.current?.setPaused(paused); }, [paused]);
  return <div ref={ref} className="nexo-cinema-backdrop" aria-hidden="true"/>;
}
