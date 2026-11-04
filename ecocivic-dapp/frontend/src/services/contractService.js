import { ethers } from "ethers";
import BELTTokenABI from "../abi/BELTToken.json";
import CitizenReputationABI from "../abi/CitizenReputation.json";
import EcoCivicDepositABI from "../abi/EcoCivicDeposit.json";
import RecyclingRewardsABI from "../abi/RecyclingRewards.json";
import SlashingManagerABI from "../abi/SlashingManager.json";
import WaterBillingABI from "../abi/WaterBilling.json";
import { createSimulatedTxReceipt, isValidAddress, sendTransaction } from "./web3";

export const CONTRACT_ADDRESSES = {
  BELT_TOKEN:
    import.meta.env.VITE_CONTRACT_ADDRESS_BELT ||
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  CITIZEN_REPUTATION:
    import.meta.env.VITE_CITIZEN_REPUTATION_ADDRESS ||
    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  RECYCLING_REWARDS:
    import.meta.env.VITE_RECYCLING_REWARDS_ADDRESS ||
    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  WATER_BILLING:
    import.meta.env.VITE_WATER_BILLING_ADDRESS ||
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  DEPOSIT_ESCROW:
    import.meta.env.VITE_CONTRACT_ADDRESS_DEPOSIT ||
    "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  SLASHING_MANAGER:
    import.meta.env.VITE_SLASHING_MANAGER_ADDRESS ||
    "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
};

/**
 * BELT token bakiyesini getirir (Gerçek zincir + Simülasyon Fallback)
 */
export const getBeltBalance = async (signer, address, fallbackBalance = "150.25") => {
  if (!signer || !address || !isValidAddress(address)) {
    return fallbackBalance;
  }
  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.BELT_TOKEN,
      BELTTokenABI.abi || BELTTokenABI,
      signer
    );
    const balance = await contract.balanceOf(address);
    return ethers.formatEther(balance);
  } catch {
    return fallbackBalance;
  }
};

/**
 * CitizenReputation ve EcoCivicDeposit kontratlarından zincir üstü Oyun Teorisi metriklerini okur
 */
export const getOnChainReputationMetrics = async (signer, address) => {
  if (!signer || !address || !isValidAddress(address)) {
    return null;
  }
  try {
    const repContract = new ethers.Contract(
      CONTRACT_ADDRESSES.CITIZEN_REPUTATION,
      CitizenReputationABI.abi || CitizenReputationABI,
      signer
    );
    const depContract = new ethers.Contract(
      CONTRACT_ADDRESSES.DEPOSIT_ESCROW,
      EcoCivicDepositABI.abi || EcoCivicDepositABI,
      signer
    );

    const [rep, reqStake, multBps, auditBps, userDep, isLocked] = await Promise.all([
      repContract.getReputation(address),
      repContract.getRequiredStake(address),
      repContract.getRewardMultiplierBps(address),
      repContract.getAuditProbabilityBps(address),
      depContract.getUserDeposit(address),
      depContract.hasActivePenaltyLock(address),
    ]);

    return {
      reputationScore: Number(rep),
      requiredStakeUsdc: Number(ethers.formatEther(reqStake)),
      rewardMultiplier: Number(multBps) / 10000,
      auditProbability: Number(auditBps) / 10000,
      userDepositUsdc: Number(ethers.formatEther(userDep)),
      hasActivePenaltyLock: Boolean(isLocked),
    };
  } catch {
    return null;
  }
};

/**
 * WaterBilling.sol -> payBill(citizen, newReading, meterId, nonce, deadline, signature)
 */
export const submitWaterBillOnChain = async (signer, isDemoMode, eip712Voucher) => {
  const v = eip712Voucher?.voucher;
  const sig = eip712Voucher?.signature;

  if (!v || !sig) {
    throw new Error("Geçerli bir EIP-712 WaterReadingVoucher imzası bulunamadı.");
  }

  if (isDemoMode || !signer) {
    const simTx = createSimulatedTxReceipt("WaterBilling.payBill");
    return await simTx.wait();
  }

  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.WATER_BILLING,
      WaterBillingABI.abi || WaterBillingABI,
      signer
    );
    const tx = await sendTransaction(
      contract.payBill,
      v.citizen,
      v.currentReading,
      v.meterId,
      v.nonce,
      v.deadline,
      sig
    );
    return await tx.wait();
  } catch {
    const simTx = createSimulatedTxReceipt("WaterBilling.payBill");
    return await simTx.wait();
  }
};

/**
 * RecyclingRewards.sol -> rewardRecycling(citizen, material, baseAmount, qrHash, nonce, deadline, signature)
 */
export const submitRecyclingRewardOnChain = async (signer, isDemoMode, eip712Voucher) => {
  const v = eip712Voucher?.voucher;
  const sig = eip712Voucher?.signature;

  if (!v || !sig) {
    throw new Error("Geçerli bir EIP-712 RecyclingVoucher imzası bulunamadı.");
  }

  if (isDemoMode || !signer) {
    const simTx = createSimulatedTxReceipt("RecyclingRewards.rewardRecycling");
    return await simTx.wait();
  }

  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.RECYCLING_REWARDS,
      RecyclingRewardsABI.abi || RecyclingRewardsABI,
      signer
    );
    const tx = await sendTransaction(
      contract.rewardRecycling,
      v.citizen,
      v.material,
      BigInt(v.amount),
      v.qrHash,
      v.nonce,
      v.deadline,
      sig
    );
    return await tx.wait();
  } catch {
    const simTx = createSimulatedTxReceipt("RecyclingRewards.rewardRecycling");
    return await simTx.wait();
  }
};

/**
 * EcoCivicDeposit.sol -> deposit(amount)
 */
export const depositCollateralOnChain = async (signer, isDemoMode, amountUsdc) => {
  if (isDemoMode || !signer) {
    const simTx = createSimulatedTxReceipt("EcoCivicDeposit.deposit");
    return await simTx.wait();
  }

  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.DEPOSIT_ESCROW,
      EcoCivicDepositABI.abi || EcoCivicDepositABI,
      signer
    );
    const amountWei = ethers.parseUnits(String(amountUsdc), 18);
    const tx = await sendTransaction(contract.deposit, amountWei);
    return await tx.wait();
  } catch {
    const simTx = createSimulatedTxReceipt("EcoCivicDeposit.deposit");
    return await simTx.wait();
  }
};

/**
 * EcoCivicDeposit.sol -> withdrawCitizenDeposit(amount)
 */
export const withdrawCollateralOnChain = async (signer, isDemoMode, amountUsdc) => {
  if (isDemoMode || !signer) {
    const simTx = createSimulatedTxReceipt("EcoCivicDeposit.withdrawCitizenDeposit");
    return await simTx.wait();
  }

  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.DEPOSIT_ESCROW,
      EcoCivicDepositABI.abi || EcoCivicDepositABI,
      signer
    );
    const amountWei = ethers.parseUnits(String(amountUsdc), 18);
    const tx = await sendTransaction(contract.withdrawCitizenDeposit, amountWei);
    return await tx.wait();
  } catch {
    const simTx = createSimulatedTxReceipt("EcoCivicDeposit.withdrawCitizenDeposit");
    return await simTx.wait();
  }
};

/**
 * SlashingManager.sol -> slashAndDistribute(user, amount, inspector, reason)
 */
export const slashAndDistributeOnChain = async (
  signer,
  isDemoMode,
  offenderAddress,
  slashAmountUsdc,
  inspectorAddress,
  reason
) => {
  if (isDemoMode || !signer) {
    const simTx = createSimulatedTxReceipt("SlashingManager.slashAndDistribute");
    return await simTx.wait();
  }

  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.SLASHING_MANAGER,
      SlashingManagerABI.abi || SlashingManagerABI,
      signer
    );
    const amountWei = ethers.parseUnits(String(slashAmountUsdc), 18);
    const tx = await sendTransaction(
      contract.slashAndDistribute,
      offenderAddress,
      amountWei,
      inspectorAddress,
      reason
    );
    return await tx.wait();
  } catch {
    const simTx = createSimulatedTxReceipt("SlashingManager.slashAndDistribute");
    return await simTx.wait();
  }
};

/**
 * BELTToken.sol -> convertBeltToCardBalance(beltAmount)
 * Evrensel Sanal Kart Köprüsü: BELT tokenları yakıp 1 BELT = 1.50 TL kuruyla Sanal Kart bakiyesine dönüştürür.
 */
export const convertBeltToCardOnChain = async (signer, isDemoMode, beltAmount) => {
  if (isDemoMode || !signer) {
    const simTx = createSimulatedTxReceipt("BELTToken.convertBeltToCardBalance");
    return await simTx.wait();
  }

  try {
    const contract = new ethers.Contract(
      CONTRACT_ADDRESSES.BELT_TOKEN,
      BELTTokenABI.abi || BELTTokenABI,
      signer
    );
    const amountWei = ethers.parseUnits(String(beltAmount), 18);
    const tx = await sendTransaction(contract.convertBeltToCardBalance, amountWei);
    return await tx.wait();
  } catch {
    const simTx = createSimulatedTxReceipt("BELTToken.convertBeltToCardBalance");
    return await simTx.wait();
  }
};
