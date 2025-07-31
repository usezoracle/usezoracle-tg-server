import { CdpClient } from "@coinbase/cdp-sdk";
import {
  createPublicClient,
  http,
  getContract,
  parseEther,
} from "viem";
import { base } from "viem/chains";
import dotenv from "dotenv";
dotenv.config();

const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const erc20Abi = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const tokenCache = new Map();

async function fetchTokenMetadata(contractAddress) {
  if (contractAddress === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
    return {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
    };
  }

  if (tokenCache.has(contractAddress)) {
    return tokenCache.get(contractAddress);
  }

  try {
    const contract = getContract({
      address: contractAddress,
      abi: erc20Abi,
      client: publicClient,
    });

    const [name, symbol, decimals] = await Promise.all([
      contract.read.name(),
      contract.read.symbol(),
      contract.read.decimals(),
    ]);

    const metadata = {
      name,
      symbol,
      decimals: Number(decimals),
    };

    tokenCache.set(contractAddress, metadata);
    return metadata;
  } catch (error) {
    console.warn(
      `Failed to fetch metadata for ${contractAddress}:`,
      error.message
    );

    const fallback = {
      name: "Unknown Token",
      symbol: "UNKNOWN",
      decimals: 18,
    };

    tokenCache.set(contractAddress, fallback);
    return fallback;
  }
}

function formatAmount(amount, decimals) {
  const divisor = BigInt(10 ** decimals);
  const amountBigInt = BigInt(amount);
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmedFractional = fractionalStr.replace(/0+$/, "") || "0";

  return `${wholePart}.${trimmedFractional}`;
}

async function main() {
  try {
    /*   const account = await cdp.evm.createAccount({ name: "techwithmide-ox" });
  console.log(`Created EVM account: ${account.address}`);
  console.log(`\n--------------------------------`);
  console.log(`\n- Account Details -`);
  console.log("Account: ", account); 
  const accounts = await cdp.evm.listAccounts();
  console.log("Accounts: ", accounts); */
    const user = await cdp.evm.getAccount({
      name: "techwithmide-ox",
    });

    console.log("User: ", user);

    /*   const { transactionHash } = await cdp.evm.sendTransaction({
      address: account.address,
      transaction: {
        to: "0x4252e0c9A3da5A2700e7d91cb50aEf522D0C6Fe8",
        value: parseEther("0.000001"),
        // Fields below are optional, CDP API will populate them if omitted.
        // nonce
        // maxPriorityFeePerGas
        // maxFeePerGas
        // gas
      },
      network: "base-sepolia",
    }); */

 /*    const { transactionHash } = await cdp.evm.sendTransaction({
      address: user.address,
      transaction: {
        to: "0x702B1F7207240B6070d3CE314261782D06A96192",
        value: parseEther("0.00024"),
      },
      network: "base",
    });

    console.log("Transaction Hash: ", transactionHash); */

    const { transactionHash } = await user.transfer({
      to: "0x702B1F7207240B6070d3CE314261782D06A96192",
      amount: parseEther("0.00028"),
      token: "eth",
      network: "base"
    });

    console.log("Transaction Hash: ", transactionHash);
  } catch (error) {
    console.error("❌ Error fetching balances:", error);
  }
}

main().catch(console.error);
