export type CinemaAssets = {
  videos: Record<'dark'|'light', Record<'portrait'|'landscape', string>>;
  videosHd?: Partial<Record<'dark'|'light', Partial<Record<'portrait'|'landscape', string>>>>;
  posters: Record<'dark'|'light', Record<'portrait'|'landscape', string[]>>;
};
export declare function createCinemaMedia(container: HTMLElement, assets: CinemaAssets, options?: {paused?: boolean; onMode?: (mode: string) => void}): {
  setPaused(value: boolean): void;
  getState(): {mode: string; paused: boolean; reducedMotion: boolean; hidden: boolean; failed: boolean; theme: string; orientation: string; source: string; time: number};
  dispose(): void;
};

export declare function selectCinemaSource(assets: CinemaAssets, theme: 'dark'|'light', orientation: 'portrait'|'landscape', options: {width: number; coarse?: boolean; saveData?: boolean; effectiveType?: string}): string;
