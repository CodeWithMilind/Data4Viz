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
      // Relative URL - check if baseUrl is provided
      const apiBaseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL;
      
      // If baseUrl is empty, use relative URL (will be proxied by Next.js)
      if (!apiBaseUrl || apiBaseUrl === "") {
        fullUrl = url.startsWith('/') ? url : `/${url}`;
      } else {
        // Use provided baseUrl
        const validBaseUrl = getValidBaseUrl(apiBaseUrl);
        fullUrl = `${validBaseUrl}${url.startsWith('/') ? url : `/${url}`}`;
      }
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
      let errorText = response.statusText;
      let errorBody = '';
      
      try {
        // Try to get error body for detailed logging
        errorBody = await response.text();
        if (errorBody) {
          // Limit error body to 500 chars to avoid flooding logs
          const preview = errorBody.substring(0, 500);
          console.error(
            `[safeFetch] HTTP ${response.status} error response body: ${preview}`,
            errorBody.length > 500 ? `(truncated, full length: ${errorBody.length})` : ''
          );
          errorText = errorBody;
        }
      } catch (readError) {
        console.warn(`[safeFetch] Could not read error response body: ${readError instanceof Error ? readError.message : String(readError)}`);
        // Use statusText if we can't read body
        errorText = response.statusText || `HTTP ${response.status}`;
      }

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
      console.error(`[safeFetch] Request timeout after ${timeout}ms to ${fullUrl}`);
      throw new FetchError(
        `Request timed out after ${timeout}ms`,
        'TIMEOUT'
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(
        `[safeFetch] Network error: Failed to fetch from ${fullUrl}. ` +
        `Check your connection and ensure the backend is running. ` +
        `Error: ${error.message}`
      );
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[safeFetch] Unexpected error during fetch: ${errorMessage}`,
      error
    );
    
    throw new FetchError(
      `Fetch failed: ${errorMessage}`,
      'NETWORK_ERROR',
      undefined,
      error
    );
  }
}

/**
 * Safe fetch with JSON parsing
 * 
 * Enterprise-level error handling with:
 * - Safe JSON parsing with detailed error messages
 * - Proper handling of empty response bodies
 * - Content-Type validation
 * - Detailed logging of backend error responses
 * - Prevents returning undefined
 * 
 * @param url Full URL or path
 * @param options Fetch options
 * @param baseUrl Optional base URL
 * @returns Parsed JSON data
 * @throws FetchError on JSON parsing failure or invalid response
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {},
  baseUrl?: string
): Promise<T> {
  const response = await safeFetch(url, options, baseUrl);
  
  try {
    // Check for empty response body
    const contentLength = response.headers?.get('content-length');
    const contentType = response.headers?.get('content-type') || 'unknown';
    
    // If no content, return appropriate empty structure
    if (response.status === 204 || contentLength === '0') {
      console.warn(
        `[safeFetchJson] Empty response body (HTTP ${response.status}, Content-Length: ${contentLength}). ` +
        `This may indicate a server error or an incomplete response.`
      );
      throw new FetchError(
        `Unexpected empty response from server (HTTP ${response.status})`,
        'HTTP_ERROR',
        response.status
      );
    }

    // Validate content type
    if (!contentType.includes('application/json')) {
      const bodyPreview = await response.text().catch(() => '<unable to read>');
      const preview = bodyPreview.substring(0, 200);
      console.error(
        `[safeFetchJson] Invalid Content-Type for JSON endpoint (HTTP ${response.status}): ` +
        `got "${contentType}", expected "application/json". ` +
        `Response body preview: ${preview}`
      );
      throw new FetchError(
        `Invalid Content-Type: expected application/json, got ${contentType}. ` +
        `The server may have returned an error page or malformed response.`,
        'HTTP_ERROR',
        response.status
      );
    }

    // Try to parse JSON
    let data: unknown;
    try {
      data = await response.json();
    } catch (parseError) {
      // JSON parsing failed - try to get response text for error logging
      try {
        const bodyText = await response.clone().text();
        console.error(
          `[safeFetchJson] Failed to parse JSON (HTTP ${response.status}): ${parseError instanceof Error ? parseError.message : String(parseError)}. ` +
          `Response body: ${bodyText.substring(0, 500)}`
        );
      } catch {
        console.error(
          `[safeFetchJson] Failed to parse JSON (HTTP ${response.status}): ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }
      throw new FetchError(
        `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        'NETWORK_ERROR',
        response.status,
        parseError
      );
    }

    // Validate parsed data is not null or undefined
    if (data === null || data === undefined) {
      console.warn(
        `[safeFetchJson] Parsed JSON is null/undefined (HTTP ${response.status}). ` +
        `Server returned empty JSON response.`
      );
      throw new FetchError(
        `Server returned null/undefined JSON response`,
        'HTTP_ERROR',
        response.status
      );
    }

    // Validate data is an object or array
    if (typeof data !== 'object' && !Array.isArray(data)) {
      console.warn(
        `[safeFetchJson] Invalid JSON type (HTTP ${response.status}): ` +
        `expected object/array, got ${typeof data}. ` +
        `Value: ${String(data).substring(0, 100)}`
      );
      throw new FetchError(
        `Expected JSON object or array, got ${typeof data}`,
        'HTTP_ERROR',
        response.status
      );
    }

    return data as T;
  } catch (error) {
    // If error is already a FetchError, re-throw as-is
    if (error instanceof FetchError) {
      throw error;
    }

    // Wrap unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[safeFetchJson] Unexpected error during JSON parsing: ${errorMessage}`,
      error
    );
    
    throw new FetchError(
      `Unexpected error parsing JSON response: ${errorMessage}`,
      'NETWORK_ERROR',
      response.status,
      error
    );
  }
}
