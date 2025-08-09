import crypto from 'crypto';

export interface WebhookData {
  body: any;
  signature: string;
  secret: string;
}

/**
 * Verify webhook signature from Coinbase
 * @param signature - The x-webhook-signature header value
 * @param body - The request body
 * @param secret - Your webhook secret
 * @returns boolean indicating if signature is valid
 */
export function verifyWebhookSignature(signature: string, body: any, secret: string): boolean {
  try {
    // Convert body to string if it's an object
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    
    // Create HMAC SHA256 hash
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(bodyString);
    const expectedSignature = hmac.digest('hex');
    
    // Compare signatures
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Process webhook data with optional signature verification
 * @param data - Webhook data object
 * @param requireSignature - Whether to require signature verification
 * @returns Processed webhook result
 */
export function processWebhook(data: WebhookData, requireSignature: boolean = false) {
  const { body, signature, secret } = data;
  
  if (requireSignature && !signature) {
    throw new Error('Webhook signature required but not provided');
  }
  
  if (signature && secret) {
    const isValid = verifyWebhookSignature(signature, body, secret);
    if (!isValid) {
      throw new Error('Invalid webhook signature');
    }
  }
  
  // Process the webhook data here
  return {
    processed: true,
    data: body,
    timestamp: new Date().toISOString(),
    signatureVerified: !!signature
  };
}

/**
 * Extract webhook signature from headers
 * @param headers - Request headers
 * @returns The webhook signature or null
 */
export function extractWebhookSignature(headers: any): string | null {
  // Coinbase uses x-coinbase-signature header
  return headers['x-coinbase-signature'] || headers['x-webhook-signature'] || null;
}

/**
 * Generate expected signature for debugging
 * @param body - Request body
 * @param secret - Webhook secret
 * @returns Expected signature
 */
export function generateExpectedSignature(body: any, secret: string): string {
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(bodyString);
  return hmac.digest('hex');
}
