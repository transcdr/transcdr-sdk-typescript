import type { RequestOptions } from '../core';
import type { AuthResponse, ChangePasswordParams, LoginParams, Me, RegisterParams } from '../types';
import { Resource } from './base';

export class Auth extends Resource {
  /** Create a user and organization. Returns a session token (not stored on the client). */
  register(params: RegisterParams, options?: RequestOptions): Promise<AuthResponse> {
    return this.core.request('POST', '/v1/auth/register', { ...options, body: params });
  }

  /** Exchange email and password for a session token (not stored on the client). */
  login(params: LoginParams, options?: RequestOptions): Promise<AuthResponse> {
    return this.core.request('POST', '/v1/auth/login', { ...options, body: params });
  }

  /**
   * Issue a session token for another of the user's organizations (sessions only).
   * The current token is revoked, so store the new one, e.g. with `setApiKey`.
   */
  switch(organizationId: string, options?: RequestOptions): Promise<AuthResponse> {
    return this.core.request('POST', '/v1/auth/switch', { ...options, body: { organization_id: organizationId } });
  }

  /** Revoke the session token the client is using. */
  async logout(options?: RequestOptions): Promise<void> {
    await this.core.request('POST', '/v1/auth/logout', options);
  }

  /** Change the signed-in user's password. Revokes the user's other sessions. */
  async changePassword(params: ChangePasswordParams, options?: RequestOptions): Promise<void> {
    await this.core.request('POST', '/v1/auth/password', { ...options, body: params });
  }

  /**
   * The caller: the user (for an API key, the user who created it), the organization, the user's
   * organizations (sessions only) and scopes. `isSession(me)` tells a session from an API key.
   */
  me(options?: RequestOptions): Promise<Me> {
    return this.core.request('GET', '/v1/me', options);
  }
}
