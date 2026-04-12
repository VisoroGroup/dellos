// Stub — webhook dispatching is optional for standalone financiar app
export async function dispatchWebhook(_event: string, _payload: any): Promise<void> {
    // No-op in standalone mode
}
