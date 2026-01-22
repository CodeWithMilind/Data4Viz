/**
 * Safe Fetch Utility
 * 
 * Provides a robust fetch wrapper with:
 * - Timeout support (default 30s)
 * - AbortController for cancellation
 * - Browser environment checks
 * - File:// protocol detection
 * - Proper error handling
 * - Network error detection
 */

const DEFAULT_TIMEOUT = 30000; // 30 seconds

export interface SafeFetchOptions extends RequestInit {
  timeout?: number;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public code: 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_URL' | 'BROWSER_ERROR' | 'HTTP_ERROR',
    public status?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Check if we're in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof fetch !== 'undefined';
}

/**
 * Check if the current origin is file:// (which doesn't support fetch)
 */
function isFileProtocol(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.location.protocol === 'file:';
  } catch {
    return false;
  }
}

/**
 * Validate and normalize the base URL
 */
function getValidBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new FetchError(
      'API base URL is not configured. Please set NEXT_PUBLIC_API_URL environment variable.',
      'INVALID_URL'
    );
  }

  // Remove trailing slash
  const normalized = baseUrl.trim().replace(/\/+$/, '');

  // Check for file:// protocol
  if (normalized.startsWith('file://')) {
    throw new FetchError(
      'Cannot use file:// protocol for API calls. Please use http://localhost:PORT or https://',
      'INVALID_URL'
    );
  }

  // Ensure it's a valid HTTP(S) URL
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    throw new FetchError(
      `Invalid API base URL: ${normalized}. Must start with http:// or https://`,
      'INVALID_URL'
    );
  }

  return normalized;
}

/**
 * Safe fetch wrapper with timeout and error handling
 * 
 * @param url Full URL or path (will be combined with baseUrl if provided)
 * @param options Fetch options including timeout
 * @param baseUrl Optional base URL (defaults to NEXT_PUBLIC_API_URL)
 * @returns Response object
 * @throws FetchError on failure
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
  baseUrl?: string
): Promise<Response> {
  // Check browser environment
  if (!isBrowser()) {
    throw new FetchError(
      'Fetch is not available in this environment. This function must be called client-side.',
      'BROWSER_ERROR'
    );
  }

  // Check for file:// protocol
  if (isFileProtocol()) {
    throw new FetchError(
      'Cannot make API calls from file:// protocol. Please use http://localhost:PORT',
      'BROWSER_ERROR'
    );
  }

  // Resolve full URL
  let fullUrl: string;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Absolute URL
      fullUrl = url;
    } else {
      // Relative URL - need base URL
      const apiBaseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL;
      const validBaseUrl = getValidBaseUrl(apiBaseUrl);
      fullUrl = `${validBaseUrl}${url.startsWith('/') ? url : `/${url}`}`;
    }
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }
    throw new FetchError(
      `Failed to construct URL: ${error instanceof Error ? error.message : String(error)}`,
      'INVALID_URL',
      undefined,
      error
    );
  }

  // Setup timeout
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  // Merge abort signal
  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
  };

  try {
    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(timeoutId);

    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new FetchError(
        `HTTP ${response.status}: ${errorText || response.statusText}`,
        'HTTP_ERROR',
        response.status
      );
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchError(
        `Request timed out after ${timeout}ms`,
        'TIMEOUT'
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new FetchError(
        'Network error: Failed to fetch. Check your connection and ensure the backend is running.',
        'NETWORK_ERROR',
        undefined,
        error
      );
    }

    // Re-throw FetchError as-is
    if (error instanceof FetchError) {
      throw error;
    }

    // Wrap other errors
    throw new FetchError(
      error instanceof Error ? error.message : String(error),
      'NETWORK_ERROR',
      undefined,
      error
    );
  }
}

/**
 * Safe fetch with JSON parsing
 * 
 * @param url Full URL or path
 * @param options Fetch options
 * @param baseUrl Optional base URL
 * @returns Parsed JSON data
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {},
  baseUrl?: string
): Promise<T> {
  const response = await safeFetch(url, options, baseUrl);
  
  try {
    return await response.json();
  } catch (error) {
    throw new FetchError(
      'Failed to parse JSON response',
      'NETWORK_ERROR',
      response.status,
      error
    );
  }
}
