/**
 * ANAF OAuth2 Token Manager (TypeScript port)
 *
 * Tarol egy access_token + refresh_token-t a `anaf_tokens` tablaban (CIF szerint).
 * Funkciok:
 *  - getAuthorizationUrl(): URL ahova a bongeszobol be kell lepni dig. tanusitvanyual
 *  - exchangeCodeForToken(code): kezdeti token csere
 *  - getValidToken(cif): visszaad egy ervenyes access_token-t (auto refresh ha kell)
 *  - hasToken(cif): true ha van mentett token
 */

import axios from 'axios';
import pool from '../config/database';
import { anafConfig } from '../config/anaf';

interface TokenRow {
    cif: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;            // PG TIMESTAMPTZ -> ISO string
    token_type: string;
    updated_at: string;
}

interface AnafTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;            // seconds
    token_type?: string;
}

/**
 * URL ahova a usernek a bongeszojebol be kell lepnie a digitalis tanusitvanyaval.
 */
export function getAuthorizationUrl(): string {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: anafConfig.clientId,
        redirect_uri: anafConfig.redirectUri,
        token_content_type: 'jwt',
    });
    return `${anafConfig.authUrl}?${params.toString()}`;
}

/**
 * A bongeszo callbackjebol kapott `code`-t cseres pol access+refresh token-re.
 * A token a DB-be mentodik (cif=anafConfig.cif kulccsal).
 */
export async function exchangeCodeForToken(code: string): Promise<TokenRow> {
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: anafConfig.clientId,
        client_secret: anafConfig.clientSecret,
        redirect_uri: anafConfig.redirectUri,
        token_content_type: 'jwt',
    });

    const response = await axios.post<AnafTokenResponse>(
        anafConfig.tokenUrl,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return await saveToken(anafConfig.cif, response.data);
}

/**
 * Refresh az access_token-t a stored refresh_token-nel.
 */
async function refreshAccessToken(cif: string): Promise<TokenRow> {
    const stored = await loadToken(cif);
    if (!stored?.refresh_token) {
        throw new Error('Nincs mentett refresh_token! Ujra autentikalas szukseges.');
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refresh_token,
        client_id: anafConfig.clientId,
        client_secret: anafConfig.clientSecret,
        token_content_type: 'jwt',
    });

    try {
        const response = await axios.post<AnafTokenResponse>(
            anafConfig.tokenUrl,
            params.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        // ANAF nem mindig kuld vissza uj refresh_token-t — ekkor a regit hasznaljuk
        const data: AnafTokenResponse = {
            ...response.data,
            refresh_token: response.data.refresh_token || stored.refresh_token,
        };
        return await saveToken(cif, data);
    } catch (err: any) {
        console.error('[anafOauth] Token refresh failed:', err.response?.data || err.message);
        throw new Error('Token refresh sikertelen — ujra autentikalni kell');
    }
}

/**
 * Visszaad egy ervenyes access_token-t. Ha 5 percen belul lejarna, frissiti.
 */
export async function getValidToken(cif: string = anafConfig.cif): Promise<string> {
    const stored = await loadToken(cif);
    if (!stored) {
        throw new Error('Nincs mentett ANAF token! Be kell jelentkezni.');
    }

    const expiresAt = new Date(stored.expires_at).getTime();
    const BUFFER_MS = 5 * 60 * 1000;
    if (Date.now() + BUFFER_MS >= expiresAt) {
        console.log('[anafOauth] Token lejart vagy hamarosan lejar, frissites...');
        const refreshed = await refreshAccessToken(cif);
        return refreshed.access_token;
    }

    return stored.access_token;
}

export async function hasToken(cif: string = anafConfig.cif): Promise<boolean> {
    const stored = await loadToken(cif);
    return !!stored;
}

// --- DB helpers ---

async function saveToken(cif: string, data: AnafTokenResponse): Promise<TokenRow> {
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    const result = await pool.query<TokenRow>(`
        INSERT INTO anaf_tokens (cif, access_token, refresh_token, expires_at, token_type, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (cif) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            token_type = EXCLUDED.token_type,
            updated_at = NOW()
        RETURNING *
    `, [cif, data.access_token, data.refresh_token, expiresAt, data.token_type || 'Bearer']);
    return result.rows[0];
}

async function loadToken(cif: string): Promise<TokenRow | null> {
    const result = await pool.query<TokenRow>(`SELECT * FROM anaf_tokens WHERE cif = $1`, [cif]);
    return result.rows[0] || null;
}
