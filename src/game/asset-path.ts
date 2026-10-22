const MODELS_PREFIX = '/models/';

export function modelUrl(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '');
  return `${MODELS_PREFIX}${normalized}`;
}
