export interface AtlasRootLocationLike {
  pathname?: string;
  search?: string;
  hash?: string;
}

export declare function resolveAtlasV4RootRedirect(
  locationLike: AtlasRootLocationLike,
  basePath?: string
): string | null;
