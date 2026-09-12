export class AtlasApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'AtlasApiError';
    this.code = code;
    this.status = status;
  }
}

export function errorMessage(error: unknown, fallback = 'API_ERROR'): string {
  if (error instanceof AtlasApiError) return error.code;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

