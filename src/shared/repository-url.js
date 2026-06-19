import { isValidRepositoryName, normalizeRepositoryName } from './storage.js';

export function getRepositoryUrl(repositoryName) {
  const normalizedRepositoryName = normalizeRepositoryName(repositoryName);

  if (!isValidRepositoryName(normalizedRepositoryName)) {
    return '';
  }

  return `https://github.com/${normalizedRepositoryName}`;
}
