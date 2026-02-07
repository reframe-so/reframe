/**
 * Server interface for handling HTTP requests
 */
export interface Server {
  /**
   * Handles an HTTP request and returns a response
   * @param request The HTTP request to handle
   * @returns A promise that resolves to an HTTP response
   */
  fetch(request: Request): Promise<Response>;
}
