import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  convertBeltToVirtualCard,
  getCitizenStatus,
  spendVirtualCardBalance,
} from "../services/apiService";
import {
  convertBeltToCardOnChain,
  getBeltBalance,
  getOnChainReputationMetrics,
} from "../services/contractService";
import { setWeb3Instances } from "../services/web3";

const WalletContext = createContext();

export const useWallet = () => useContext(WalletContext);

export const DEMO_ACCOUNTS = {
  citizen: {
    label: "Vatandaş #1 (Dürüst Profil)",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    role: "CITIZEN",
  },
  riskyCitizen: {
    label: "Vatandaş #2 (Riskli / İncelemede)",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    role: "CITIZEN",
  },
  inspector: {
    label: "Belediye Zabıta / Denetçi",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    role: "INSPECTOR",
  },
};

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(DEMO_ACCOUNTS.citizen.address);
  const [balance, setBalance] = useState("2.4500");
  const [beltBalance, setBeltBalance] = useState("150.25");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState("31337");
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [activePersona, setActivePersona] = useState("citizen");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [citizenProfile, setCitizenProfile] = useState({
    wallet_address: DEMO_ACCOUNTS.citizen.address,
    reputation_score: 110,
    honest_declarations_count: 2,
    slashing_count: 0,
    deposit_amount_usdc: 1500.0,
    card_balance_try: 225.0,
    total_burned_belt: 0.0,
    virtual_card: {
      card_holder: "ECOCIVIC CITIZEN (0x90F7...b906)",
      card_scheme: "TROY / Mastercard BaaS Virtual Prepaid",
      card_number_masked: "9792 **** **** 4821",
      card_number_full: "9792 8420 5193 4821",
      expiry_date: "08/29",
      cvv: "642",
      card_balance_try: 225.0,
      conversion_rate_try: 1.5,
      mcc_green_restriction: "ACTIVE",
      transactions: [],
    },
    under_investigation: false,
    eip712_nonce: 2,
    game_theory_profile: {
      required_stake_usdc: 909.09,
      has_sufficient_stake: true,
      reward_multiplier: 1.01,
      reward_multiplier_bps: 10100,
      baseline_audit_probability: 0.1818,
    },
    water_readings: [],
    recycling_submissions: [],
    penalties: [],
  });

  const refreshCitizenProfile = useCallback(
    async (targetAddr = account, currentSigner = signer) => {
      if (!targetAddr) return;
      const apiData = await getCitizenStatus(targetAddr);
      const onChain = await getOnChainReputationMetrics(currentSigner, targetAddr);

      const mergedRep = onChain?.reputationScore ?? apiData.reputation_score ?? 100;
      const mergedDep = onChain?.userDepositUsdc ?? apiData.deposit_amount_usdc ?? 1000.0;
      const reqStake =
        onChain?.requiredStakeUsdc ??
        apiData.game_theory_profile?.required_stake_usdc ??
        Number(((1000 * 100) / mergedRep).toFixed(2));
      const mult =
        onChain?.rewardMultiplier ??
        apiData.game_theory_profile?.reward_multiplier ??
        (mergedRep <= 100 ? mergedRep / 100 : 1 + (mergedRep - 100) * 0.001);
      const auditProb =
        onChain?.auditProbability ??
        apiData.game_theory_profile?.baseline_audit_probability ??
        Math.min(1.0, Math.max(0.02, (0.2 * 100) / mergedRep));

      setCitizenProfile({
        ...apiData,
        reputation_score: mergedRep,
        deposit_amount_usdc: mergedDep,
        under_investigation:
          onChain?.hasActivePenaltyLock ?? apiData.under_investigation ?? false,
        game_theory_profile: {
          required_stake_usdc: Number(reqStake.toFixed(2)),
          has_sufficient_stake: mergedDep >= reqStake,
          reward_multiplier: Number(mult.toFixed(4)),
          reward_multiplier_bps: Math.round(mult * 10000),
          baseline_audit_probability: Number(auditProb.toFixed(4)),
        },
      });

      const beltBal = await getBeltBalance(currentSigner, targetAddr, beltBalance);
      setBeltBalance(beltBal);
    },
    [account, signer, beltBalance]
  );

  useEffect(() => {
    refreshCitizenProfile(account, signer);
  }, [account]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);

    if (!window.ethereum) {
      // MetaMask yoksa kesintisiz Demo Simülasyon Cüzdanını aktifleştir
      setIsDemoMode(true);
      setAccount(DEMO_ACCOUNTS.citizen.address);
      setIsConnecting(false);
      await refreshCitizenProfile(DEMO_ACCOUNTS.citizen.address, null);
      return true;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (!accounts || accounts.length === 0) {
        throw new Error("Cüzdan hesabı bulunamadı.");
      }

      const _provider = new ethers.BrowserProvider(window.ethereum);
      const network = await _provider.getNetwork();
      const _signer = await _provider.getSigner();
      const address = await _signer.getAddress();
      const rawBal = await _provider.getBalance(address);

      setWeb3Instances(_provider, _signer);
      setProvider(_provider);
      setSigner(_signer);
      setAccount(address);
      setChainId(network.chainId.toString());
      setBalance(Number(ethers.formatEther(rawBal)).toFixed(4));
      setIsDemoMode(false);

      await refreshCitizenProfile(address, _signer);
      setIsConnecting(false);
      return true;
    } catch (err) {
      setError(err.message || "Cüzdan bağlantısı başarısız oldu, Demo Mod aktif.");
      setIsDemoMode(true);
      setIsConnecting(false);
      return false;
    }
  };

  const switchDemoAccount = async (personaKey) => {
    const selected = DEMO_ACCOUNTS[personaKey] || DEMO_ACCOUNTS.citizen;
    setActivePersona(personaKey);
    setIsDemoMode(true);
    setSigner(null);
    setProvider(null);
    setAccount(selected.address);
    if (personaKey === "riskyCitizen") {
      setBeltBalance("50.00");
    } else if (personaKey === "citizen") {
      setBeltBalance("150.25");
    } else {
      setBeltBalance("0.00");
    }
    await refreshCitizenProfile(selected.address, null);
  };

  const disconnectWallet = () => {
    setAccount(null);
    setSigner(null);
    setProvider(null);
  };

  const addLocalRewardAndReputation = (beltEarned, repDelta = 5) => {
    setBeltBalance((prev) => (Number(prev || 0) + Number(beltEarned || 0)).toFixed(2));
    setCitizenProfile((prev) => {
      const newRep = Math.min(1000, Math.max(10, (prev.reputation_score || 100) + repDelta));
      const reqStake = Number(((1000 * 100) / newRep).toFixed(2));
      const mult = newRep <= 100 ? newRep / 100 : 1 + (newRep - 100) * 0.001;
      const auditProb = Math.min(1.0, Math.max(0.02, (0.2 * 100) / newRep));
      return {
        ...prev,
        reputation_score: newRep,
        honest_declarations_count: (prev.honest_declarations_count || 0) + (repDelta > 0 ? 1 : 0),
        game_theory_profile: {
          required_stake_usdc: reqStake,
          has_sufficient_stake: (prev.deposit_amount_usdc || 0) >= reqStake,
          reward_multiplier: Number(mult.toFixed(4)),
          reward_multiplier_bps: Math.round(mult * 10000),
          baseline_audit_probability: Number(auditProb.toFixed(4)),
        },
      };
    });
  };

  const updateLocalDeposit = (deltaUsdc) => {
    setCitizenProfile((prev) => {
      const newDep = Math.max(0, Number((prev.deposit_amount_usdc + deltaUsdc).toFixed(2)));
      const reqStake = prev.game_theory_profile?.required_stake_usdc || 1000;
      return {
        ...prev,
        deposit_amount_usdc: newDep,
        game_theory_profile: {
          ...prev.game_theory_profile,
          has_sufficient_stake: newDep >= reqStake,
        },
      };
    });
  };

  const convertBeltToCard = async (beltAmount) => {
    const amt = Number(beltAmount || 0);
    if (amt <= 0) {
      throw new Error("Dönüştürülecek BELT miktarı 0'dan büyük olmalıdır.");
    }
    if (Number(beltBalance || 0) < amt) {
      throw new Error(`Yetersiz BELT bakiyesi (Mevcut: ${Number(beltBalance || 0).toFixed(2)} BELT).`);
    }

    const receipt = await convertBeltToCardOnChain(signer, isDemoMode, amt);
    const apiRes = await convertBeltToVirtualCard(account, amt, receipt?.hash);

    setBeltBalance((prev) => Math.max(0, Number(prev || 0) - amt).toFixed(2));
    setCitizenProfile((prev) => {
      const addedTry = apiRes.fiat_added_try ?? Number((amt * 1.5).toFixed(2));
      const newCardBal =
        apiRes.card_balance_try ??
        Number(((prev.card_balance_try ?? 225.0) + addedTry).toFixed(2));
      const newTx = {
        id: Date.now(),
        tx_type: "CONVERT_LOAD",
        belt_burned: amt,
        amount_try: addedTry,
        balance_after_try: newCardBal,
        mcc_code: "0000",
        merchant_name: "BELT Token Yakım -> Sanal Kart TL Yükleme",
        auth_code: apiRes.auth_code || "CNV-ONLINE",
        blockchain_tx_hash: receipt?.hash,
        created_at: new Date().toISOString(),
      };
      const prevCard = prev.virtual_card || {};
      return {
        ...prev,
        card_balance_try: newCardBal,
        total_burned_belt: Number(((prev.total_burned_belt || 0) + amt).toFixed(2)),
        virtual_card: apiRes.virtual_card || {
          ...prevCard,
          card_balance_try: newCardBal,
          transactions: [newTx, ...(prevCard.transactions || [])],
        },
      };
    });

    return {
      ...apiRes,
      blockchain_tx_hash: receipt?.hash || apiRes.blockchain_tx_hash,
    };
  };

  const spendVirtualCard = async ({ amountTry, mccCode, merchantName }) => {
    const amt = Number(amountTry || 0);
    const currentCardBal = Number(citizenProfile?.card_balance_try ?? 225.0);
    if (amt <= 0) {
      throw new Error("Harcama tutarı 0 TL'den büyük olmalıdır.");
    }
    if (currentCardBal < amt) {
      throw new Error(
        `Yetersiz Sanal Kart TL bakiyesi (Mevcut: ${currentCardBal.toFixed(2)} TL, İstenen: ${amt.toFixed(2)} TL).`
      );
    }

    const apiRes = await spendVirtualCardBalance({
      walletAddress: account,
      amountTry: amt,
      mccCode,
      merchantName,
    });

    setCitizenProfile((prev) => {
      const newCardBal =
        apiRes.card_balance_try ??
        Number(Math.max(0, (prev.card_balance_try ?? 225.0) - amt).toFixed(2));
      const newTx = {
        id: Date.now(),
        tx_type: "MCC_SPEND",
        belt_burned: 0,
        amount_try: amt,
        balance_after_try: newCardBal,
        mcc_code: mccCode,
        merchant_name: merchantName,
        auth_code: apiRes.auth_code || "POS-ONLINE",
        created_at: new Date().toISOString(),
      };
      const prevCard = prev.virtual_card || {};
      return {
        ...prev,
        card_balance_try: newCardBal,
        virtual_card: apiRes.virtual_card || {
          ...prevCard,
          card_balance_try: newCardBal,
          transactions: [newTx, ...(prevCard.transactions || [])],
        },
      };
    });

    return apiRes;
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        balance,
        beltBalance,
        provider,
        signer,
        chainId,
        isDemoMode,
        activePersona,
        isConnecting,
        error,
        citizenProfile,
        connectWallet,
        switchDemoAccount,
        disconnectWallet,
        refreshCitizenProfile,
        addLocalRewardAndReputation,
        updateLocalDeposit,
        convertBeltToCard,
        spendVirtualCard,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
