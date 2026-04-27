/**
 * ANAF SPV configuration.
 * Read from environment variables; throws helpful errors at startup if missing.
 */

export const anafConfig = {
    clientId: process.env.ANAF_CLIENT_ID || '',
    clientSecret: process.env.ANAF_CLIENT_SECRET || '',
    redirectUri: process.env.ANAF_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3099'}/api/anaf/oauth/callback`,
    authUrl: process.env.ANAF_AUTH_URL || 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize',
    tokenUrl: process.env.ANAF_TOKEN_URL || 'https://logincert.anaf.ro/anaf-oauth2/v1/token',
    apiBase: process.env.ANAF_API_BASE || 'https://api.anaf.ro/prod/FCTEL/rest',
    cif: process.env.ANAF_CIF || process.env.CIF || '',
    checkIntervalMinutes: parseInt(process.env.ANAF_CHECK_INTERVAL_MINUTES || '5', 10),
};

export function isAnafConfigured(): boolean {
    return !!(anafConfig.clientId && anafConfig.clientSecret && anafConfig.cif);
}
