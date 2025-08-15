import { Interface } from 'ethers';
export type DecodedTx = {
  method: string;
  methodId: string;
  rawData: string;
};

export type SwapDetection = {
  isBuy: boolean;
  isSwap: boolean;
  tokenAddress?: string;
};

/**
 * Decode transaction input data by matching the 4-byte method selector
 * against a small set of common DeFi function signatures. Falls back to
 * unknown with raw data when no match is found.
 */
export function decodeTransactionInput(data: string): DecodedTx {
  try {
    const functionSignatures: Record<string, string> = {
      '0xa9059cbb': 'transfer(address,uint256)',
      '0x23b872dd': 'transferFrom(address,address,uint256)',
      '0x095ea7b3': 'approve(address,uint256)',
      '0x38ed1739': 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      '0x7ff36ab5': 'swapExactETHForTokens(uint256,address[],address,uint256)',
      '0x18cbafe5': 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
      '0xfb3bdb41': 'swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
      '0xb6f9de95': 'swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)',
      '0x4a25d94a': 'swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)'
    };

    const methodId = data.slice(0, 10);
    const method = functionSignatures[methodId] || 'unknown';
    const params = data.slice(10);

    return {
      method,
      methodId,
      rawData: params,
    };
  } catch {
    return {
      method: 'unknown',
      methodId: data.slice(0, 10),
      rawData: data,
    };
  }
}

/**
 * Heuristically detect if a transaction is a buy and extract the bought token address for common swap methods.
 * - Treat direct ETH transfers (data === '0x' and value > 0) as buys to a token contract
 * - For UniswapV2-like methods, derive token address from path in calldata (best-effort)
 */
export function detectBuyAndToken(data: string): SwapDetection {
  if (!data || data === '0x') {
    return { isBuy: false, isSwap: false };
  }
  const methodId = data.slice(0, 10);
  const isSwapMethod = [
    '0x7ff36ab5', // swapExactETHForTokens
    '0xb6f9de95', // swapExactETHForTokensSupportingFeeOnTransferTokens
    '0x38ed1739', // swapExactTokensForTokens
    '0xfb3bdb41', // swapExactTokensForTokensSupportingFeeOnTransferTokens
    '0x18cbafe5', // swapExactTokensForETH
    '0x4a25d94a', // swapExactTokensForETHSupportingFeeOnTransferTokens
    // Uniswap V3 methods
    '0x04e45aaf', // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    '0xb858183f', // exactInput((bytes,address,uint256,uint256,uint256))
    // Uniswap Universal Router execute(bytes,bytes[],uint256)
    '0x3593564c',
  ].includes(methodId);

  if (!isSwapMethod) return { isBuy: false, isSwap: false };

  // Try ABI-based decoding first
  try {
    const UNIV2_ABI = [
      'function swapExactETHForTokens(uint256,address[],address,uint256)',
      'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)',
      'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
      'function swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
      'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)'
    ];
    const iface = new Interface(UNIV2_ABI);
    const parsed = iface.parseTransaction({ data });
    const path: string[] | undefined = parsed?.args?.[1] as any;
    if (Array.isArray(path) && path.length > 0) {
      const tokenAddress = path[path.length - 1];
      const isBuy = ['0x7ff36ab5', '0xb6f9de95'].includes(methodId);
      return { isBuy, isSwap: true, tokenAddress };
    }
  } catch {
    // Fallback to heuristic below
  }

  // Try Uniswap V3 decoding
  try {
    if (methodId === '0x04e45aaf') {
      // exactInputSingle: selector + tuple fields, tokenOut is second field (address)
      // For robustness with Interface, declare minimal ABI and parse
      const UNIV3_SINGLE = [
        'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96))',
      ];
      const iface = new Interface(UNIV3_SINGLE);
      const parsed = iface.parseTransaction({ data });
      const params = parsed?.args?.[0] as any;
      const tokenAddress: string | undefined = params?.tokenOut;
      if (tokenAddress) {
        // Buy if input is ETH is not strictly detectable here; conservatively mark as swap and non-buy
        return { isBuy: false, isSwap: true, tokenAddress };
      }
    } else if (methodId === '0xb858183f') {
      // exactInput(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)
      const UNIV3_INPUT = [
        'function exactInput(bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)'
      ];
      const iface = new Interface(UNIV3_INPUT);
      const parsed = iface.parseTransaction({ data });
      const pathBytes: string | undefined = parsed?.args?.[0] as any;
      if (pathBytes && pathBytes.startsWith('0x') && pathBytes.length >= 2 + 20 * 2) {
        // V3 path encodes alternating (address(20) fee(3) address(20) ...)
        // TokenOut is the last 20-byte address
        const hex = pathBytes.slice(2);
        const tokenOutHex = hex.slice(-40);
        const tokenAddress = `0x${tokenOutHex}`;
        return { isBuy: false, isSwap: true, tokenAddress };
      }
    }
  } catch {
    // ignore and continue
  }

  // Try Universal Router (v4) coarse detection
  try {
    if (methodId === '0x3593564c') {
      // execute(bytes, bytes[], uint256)
      const UR_ABI = [
        'function execute(bytes commands, bytes[] inputs, uint256 deadline)'
      ];
      const iface = new Interface(UR_ABI);
      const parsed = iface.parseTransaction({ data });
      const inputs: string[] = parsed?.args?.[1] as any;
      if (Array.isArray(inputs) && inputs.length > 0) {
        // Very coarse: search trailing 20-byte addresses in inputs for a plausible tokenOut
        for (const enc of inputs) {
          if (typeof enc === 'string' && enc.startsWith('0x') && enc.length >= 2 + 40) {
            const hex = enc.slice(-40);
            const tokenAddress = `0x${hex}`;
            // Cannot reliably decide buy/sell here without full UR decoders
            return { isBuy: false, isSwap: true, tokenAddress };
          }
        }
        return { isBuy: false, isSwap: true };
      }
    }
  } catch {
    // ignore and continue
  }

  // Heuristic fallback
  const raw = data.slice(10);
  const hex = raw.replace(/^0x/, '');
  const lastWord = hex.slice(-64);
  const maybeAddr = lastWord.slice(-40);
  const tokenAddress = maybeAddr ? `0x${maybeAddr}` : undefined;

  // Heuristic: ETH->Token paths indicate a buy
  const isBuy = ['0x7ff36ab5', '0xb6f9de95'].includes(methodId);
  return { isBuy, isSwap: true, tokenAddress };
}

