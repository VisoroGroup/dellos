import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';

let graphClient: Client | null = null;
let initPromise: Promise<Client> | null = null;

/**
 * Get or create Microsoft Graph client (application credentials).
 * Thread-safe: concurrent calls wait for the same init promise.
 */
function getGraphClient(): Client {
    if (graphClient) return graphClient;

    // Synchronous init — no race condition possible in single-threaded Node,
    // but guard against double-init just in case
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Missing Azure credentials: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET');
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
    });

    graphClient = Client.initWithMiddleware({ authProvider });
    return graphClient;
}

/**
 * The sender email — must be a valid Microsoft 365 mailbox in your tenant.
 * Set GRAPH_SENDER_EMAIL in Railway Variables.
 * Example: notifications@visoro.ro
 */
const SENDER_EMAIL = process.env.GRAPH_SENDER_EMAIL || 'notifications@visoro-global.ro';

/**
 * Custom error class for email sending failures.
 * Callers can check `retryable` to decide on retry.
 */
export class EmailSendError extends Error {
    public readonly retryable: boolean;
    public readonly statusCode?: number;
    constructor(message: string, retryable: boolean, statusCode?: number) {
        super(message);
        this.name = 'EmailSendError';
        this.retryable = retryable;
        this.statusCode = statusCode;
    }
}

/**
 * Send an email using Microsoft Graph API (Mail.Send application permission)
 */
export async function sendEmail(params: {
    to: string;
    subject: string;
    htmlBody: string;
    displayName?: string;
}): Promise<void> {
    const message = {
        subject: params.subject,
        body: {
            contentType: 'HTML',
            content: params.htmlBody,
        },
        toRecipients: [
            {
                emailAddress: {
                    address: params.to,
                    name: params.displayName || params.to,
                },
            },
        ],
    };

    try {
        const client = getGraphClient();
        await client
            .api(`/users/${SENDER_EMAIL}/sendMail`)
            .post({ message, saveToSentItems: false });
    } catch (err: any) {
        const statusCode = err?.statusCode || err?.code;
        const errMessage = err?.message || 'Unknown email error';

        // Log the error
        console.error(`[EMAIL] Failed to send to ${params.to}:`, errMessage);

        // Token expired or invalid credentials — reset client for next attempt
        if (statusCode === 401 || statusCode === 403 || errMessage.includes('token')) {
            console.warn('[EMAIL] Token/auth error — resetting Graph client for next call.');
            graphClient = null; // Force re-initialization with fresh token
            throw new EmailSendError(`Auth error: ${errMessage}`, true, statusCode);
        }

        // Rate limiting — retryable
        if (statusCode === 429) {
            throw new EmailSendError(`Rate limited: ${errMessage}`, true, 429);
        }

        // Network/timeout errors — retryable
        if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
            throw new EmailSendError(`Network error: ${errMessage}`, true);
        }

        // All other errors — not retryable (bad request, invalid recipient, etc.)
        throw new EmailSendError(`Email send failed: ${errMessage}`, false, statusCode);
    }
}

/**
 * Send a test email to verify Graph API configuration
 */
export async function sendTestEmail(toEmail: string, toName: string): Promise<void> {
    await sendEmail({
        to: toEmail,
        subject: '[Sarcinator Visoro] Test email — configurare Graph API',
        htmlBody: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
                <div style="background: #1E3A5F; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; font-size: 20px;">Sarcinator Visoro</h1>
                    <p style="margin: 5px 0 0; opacity: 0.8; font-size: 14px;">Test email configurare</p>
                </div>
                <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px; color: #333;">Bună, <strong>${toName}</strong>!</p>
                    <div style="background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 16px; margin: 16px 0;">
                        <p style="color: #065f46; margin: 0; font-weight: bold;">✅ Configurarea Microsoft Graph API funcționează corect!</p>
                    </div>
                    <p style="color: #666; font-size: 14px;">Vei primi zilnic (Luni-Vineri, ora 07:00) un sumar cu task-urile tale active.</p>
                    <hr style="margin-top: 24px; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px;">
                        Această notificare a fost generată automat de Sarcinator Visoro.
                    </p>
                </div>
            </div>
        `,
        displayName: toName,
    });
}
