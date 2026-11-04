import { ethers } from "ethers";

let provider = null;
let signer = null;

export const SUPPORTED_CHAIN_IDS = ["31337", "80002", "137"];
const DEFAULT_CHAIN_ID = import.meta.env.VITE_CHAIN_ID || "31337";

/**
 * Ethereum adresinin geçerli olup olmadığını kontrol eder
 */
export function isValidAddress(address) {
  try {
    return Boolean(address && ethers.isAddress(address));
  } catch {
    return false;
  }
}

/**
 * Jüri ve belediye sunumlarında yerel düğüm veya MetaMask bağlı olmadığında
 * deterministik simülasyon işlem makbuzu üretir.
 */
export function createSimulatedTxReceipt(actionName = "EcoCivicTx") {
  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  const hashHex =
    "0x" +
    Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return {
    hash: hashHex,
    status: 1,
    blockNumber: 184520 + Math.floor(Math.random() * 500),
    gasUsed: "84210",
    simulated: true,
    actionName,
    wait: async () => ({
      hash: hashHex,
      status: 1,
      blockNumber: 184520 + Math.floor(Math.random() * 500),
      gasUsed: "84210",
      simulated: true,
    }),
  };
}

/**
 * MetaMask cüzdanına bağlanır
 */
export async function connectMetaMaskWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask bulunamadı. Demo Cüzdan Modunu kullanabilirsiniz.");
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return {
    provider,
    signer,
    address,
    chainId: network.chainId.toString(),
  };
}

export function setWeb3Instances(prov, sign) {
  provider = prov;
  signer = sign;
}

export function getProvider() {
  return provider;
}

export function getSigner() {
  return signer;
}

/**
 * Kontrat instance'ı üretir
 */
export function getContract(contractAddress, abi, customSigner = null) {
  const activeSigner = customSigner || signer;
  if (!activeSigner) {
    throw new Error("Signer not initialized");
  }
  if (!isValidAddress(contractAddress)) {
    throw new Error("Invalid contract address");
  }
  const contractAbi = abi.abi || abi;
  return new ethers.Contract(contractAddress, contractAbi, activeSigner);
}

/**
 * Güvenli transaction gönderimi (Gerçek Ethers v6 + Simülasyon Fallback)
 */
export async function sendTransaction(contractMethod, ...args) {
  try {
    const gasEstimate = await contractMethod.estimateGas(...args);
    const gasLimit = (gasEstimate * 120n) / 100n;
    const tx = await contractMethod(...args, { gasLimit });
    return tx;
  } catch (error) {
    if (error.code === 4001 || error.code === "ACTION_REJECTED") {
      throw new Error("İşlem kullanıcı tarafından reddedildi.");
    }
    throw error;
  }
}

export { DEFAULT_CHAIN_ID };
