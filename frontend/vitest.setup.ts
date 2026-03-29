import '@testing-library/jest-dom';
import { vi } from 'vitest';

class IntersectionObserverMock {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}

  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = IntersectionObserverMock;

vi.mock('axios', () => {
  const instance = {
    get: vi.fn(async () => ({ data: { success: true, data: [] } })),
    post: vi.fn(async () => ({ data: { success: true } })),
    put: vi.fn(async () => ({ data: { success: true } })),
    delete: vi.fn(async () => ({ data: { success: true } })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});
