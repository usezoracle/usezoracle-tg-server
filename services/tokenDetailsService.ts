interface TokenDetailsResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      name: string;
      address: string;
      symbol: string;
      decimals: number;
      total_supply: string;
      coingecko_coin_id: string;
      price_usd: string;
      fdv_usd: string;
      total_reserve_in_usd: string;
      volume_usd: Record<string, any>;
      market_cap_usd: string;
    };
    relationships: Record<string, any>;
  };
}

interface TokenDetailsParams {
  network: string;
  address: string;
  include?: string;
}

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

export class TokenDetailsService {
  private static instance: TokenDetailsService;
  private baseUrl = config.geckoTerminalBaseUrl;
  private cache: Map<string, { data: TokenDetailsResponse; expiresAt: number }> = new Map();
  private defaultTtlMs = 30_000; // 30s cache TTL
  private requestTimeoutMs = 10_000; // 10s per attempt
  private maxRetries = 2; // total attempts = 1 + retries

  private constructor() {}

  static getInstance(): TokenDetailsService {
    if (!TokenDetailsService.instance) {
      TokenDetailsService.instance = new TokenDetailsService();
    }
    return TokenDetailsService.instance;
  }

  async getTokenDetails(params: TokenDetailsParams): Promise<TokenDetailsResponse> {
    try {
      const { network, address, include } = params;
      
      // Validate and sanitize address parameter against SSRF
      if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        logger.error({ address }, 'Invalid token address provided');
        throw new Error('Invalid address parameter');
      }

      // Restrict the include parameter to an allowlist
      const allowedIncludes = [undefined, 'top_pools'];
      if (include !== undefined && !allowedIncludes.includes(include)) {
        logger.error({ include }, 'Invalid include parameter provided');
        throw new Error('Invalid include parameter');
      }

      // Build the URL
      let url = `${this.baseUrl}/networks/${network}/tokens/${address}`;
      
      // Add include parameter if provided
      if (include) {
        url += `?include=${include}`;
      }

      // Simple cache key
      const cacheKey = include ? `${network}:${address}:include=${include}` : `${network}:${address}`;

      // Serve from cache if valid
      const cached = this.cache.get(cacheKey);
      const now = Date.now();
      if (cached && cached.expiresAt > now) {
        logger.debug({ cacheKey }, 'Token details cache hit');
        return cached.data;
      }

      logger.info({ url }, 'Fetching token details');

      // Fetch with timeout + retry/backoff
      const data = await this.fetchWithRetry(url) as TokenDetailsResponse;
      
      logger.info({ address, network }, 'Successfully fetched token details');

      // Cache success
      this.cache.set(cacheKey, { data, expiresAt: now + this.defaultTtlMs });
      return data;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching token details');
      throw error;
    }
  }

  async getTokenDetailsWithPools(params: TokenDetailsParams): Promise<TokenDetailsResponse> {
    // Include top_pools in the request
    return this.getTokenDetails({
      ...params,
      include: 'top_pools'
    });
  }

  private async fetchWithRetry(url: string): Promise<unknown> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`GeckoTerminal API error: ${response.status} - ${errorText}`);
        }

        return (await response.json());
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt > this.maxRetries) break;
        const backoffMs = 300 * attempt; // linear backoff
        logger.warn({ attempt, backoffMs, err }, 'Retrying token details fetch');
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Failed to fetch after retries');
  }
} 