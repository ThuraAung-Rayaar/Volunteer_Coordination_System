/**
 * @format
 */

import { defaultTokenStore, TokenStore } from './tokenStore';

export type UnauthorizedListener = () => void;

export class SessionManager {
  private tokenStore: TokenStore;
  private unauthorizedListeners: Set<UnauthorizedListener> = new Set();

  constructor(tokenStore: TokenStore = defaultTokenStore) {
    this.tokenStore = tokenStore;
  }

  /**
   * Registers a listener callback invoked ONLY on HTTP 401 Unauthorized responses.
   * Returns an unsubscribe function.
   */
  public onUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  /**
   * Invoked ONLY when an HTTP 401 Unauthorized response is received.
   * Clears the active auth token and notifies listeners.
   *
   * STRICT ARCHITECTURAL INVARIANT:
   * NEVER called on HTTP 403 (Forbidden), 404 (Not Found), 409 (Conflict),
   * 429 (Rate Limited), 5xx (Server Error), or network/timeout errors.
   */
  public async handleUnauthorized(): Promise<void> {
    await this.tokenStore.clearToken();
    for (const listener of this.unauthorizedListeners) {
      try {
        listener();
      } catch {
        // Listener error must not prevent other listeners from being called
      }
    }
  }

  /**
   * Stores a new session token.
   */
  public async setToken(token: string): Promise<void> {
    await this.tokenStore.setToken(token);
  }

  /**
   * Retrieves the current session token.
   */
  public async getToken(): Promise<string | null> {
    return this.tokenStore.getToken();
  }

  /**
   * Checks whether a non-empty token is stored.
   */
  public async hasValidToken(): Promise<boolean> {
    const token = await this.tokenStore.getToken();
    return Boolean(token && token.trim().length > 0);
  }

  /**
   * Explicitly logs out the user and clears the persisted session token.
   */
  public async logout(): Promise<void> {
    await this.tokenStore.clearToken();
  }

  /**
   * Allows swapping the underlying TokenStore (useful for tests or custom store injection).
   */
  public setTokenStore(store: TokenStore): void {
    this.tokenStore = store;
  }
}

export const sessionManager = new SessionManager();
