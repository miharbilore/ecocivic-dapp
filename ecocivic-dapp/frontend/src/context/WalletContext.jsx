import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  convertBeltToVirtualCard,
  getCitizenStatus,
  resetDemoPersona,
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

export const BASE_GUARANTEE_USDC = 1000;
export const BELT_TO_TRY_RATE = 1.5;

/**
 * Demo personaları ve deterministik başlangıç (seed) değerleri.
 * Backend'deki DEMO_PERSONA_SEEDS ile birebir aynıdır.
 */
export const DEMO_ACCOUNTS = {
  citizen: {
    label: "Vatandaş #1 · Dürüst Profil",
    shortLabel: "Ayşe Yılmaz",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    role: "CITIZEN",
    seed: {
      reputation_score: 250,
      honest_declarations_count: 30,
      slashing_count: 0,
      deposit_amount_usdc: 1500.0,
      card_balance_try: 225.0,
      under_investigation: false,
      belt_balance: "150.25",
    },
  },
  riskyCitizen: {
    label: "Vatandaş #2 · İncelemede",
    shortLabel: "Mehmet Kaya",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    role: "CITIZEN",
    seed: {
      reputation_score: 45,
      honest_declarations_count: 2,
      slashing_count: 2,
      deposit_amount_usdc: 700.0,
      card_balance_try: 40.0,
      under_investigation: true,
      belt_balance: "50.00",
    },
  },
  inspector: {
    label: "Belediye Denetçisi",
    shortLabel: "Denetçi",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    role: "INSPECTOR",
    seed: {
      reputation_score: 500,
      honest_declarations_count: 0,
      slashing_count: 0,
      deposit_amount_usdc: 0.0,
      card_balance_try: 0.0,
      under_investigation: false,
      belt_balance: "0.00",
    },
  },
};

/**
 * Güven Puanından (Rᵢ) türetilen tüm oyun teorisi metriklerini tek noktada hesaplar.
 */
export const deriveTrustMetrics = (reputation, depositUsdc = 0) => {
  const rep = Math.min(1000, Math.max(10, Number(reputation) || 100));
  const requiredStake = Number(((BASE_GUARANTEE_USDC * 100) / Math.max(rep, 25)).toFixed(2));
  const multiplier = rep <= 100 ? rep / 100 : 1 + (rep - 100) * 0.001;
  const auditProb = Math.min(1.0, Math.max(0.02, (0.2 * 100) / rep));
  return {
    required_stake_usdc: requiredStake,
    has_sufficient_stake: Number(depositUsdc) >= requiredStake,
    reward_multiplier: Number(multiplier.toFixed(4)),
    reward_multiplier_bps: Math.round(multiplier * 10000),
    baseline_audit_probability: Number(auditProb.toFixed(4)),
  };
};

const buildInitialProfile = (personaKey = "citizen") => {
  const persona = DEMO_ACCOUNTS[personaKey] || DEMO_ACCOUNTS.citizen;
  const s = persona.seed;
  return {
    wallet_address: persona.address,
    reputation_score: s.reputation_score,
    honest_declarations_count: s.honest_declarations_count,
    slashing_count: s.slashing_count,
    deposit_amount_usdc: s.deposit_amount_usdc,
    card_balance_try: s.card_balance_try,
    total_burned_belt: 0,
    under_investigation: s.under_investigation,
    virtual_card: {
      card_holder: persona.shortLabel.toUpperCase(),
      card_number_masked: "9792 •••• •••• 4821",
      card_number_full: "9792 8420 5193 4821",
      expiry_date: "08/29",
      cvv: "642",
      card_balance_try: s.card_balance_try,
      conversion_rate_try: BELT_TO_TRY_RATE,
      transactions: [],
    },
    game_theory_profile: deriveTrustMetrics(s.reputation_score, s.deposit_amount_usdc),
    water_readings: [],
    recycling_submissions: [],
    penalties: [],
  };
};

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(DEMO_ACCOUNTS.citizen.address);
  const [balance, setBalance] = useState("2.4500");
  const [beltBalance, setBeltBalance] = useState(DEMO_ACCOUNTS.citizen.seed.belt_balance);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState("31337");
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [activePersona, setActivePersona] = useState("citizen");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [citizenProfile, setCitizenProfile] = useState(() => buildInitialProfile("citizen"));

  const personaRef = useRef("citizen");
  const demoRef = useRef(true);

  const refreshCitizenProfile = useCallback(
    async (targetAddr = account, currentSigner = signer) => {
      if (!targetAddr) return;
      const apiData = await getCitizenStatus(targetAddr);
      const onChain = await getOnChainReputationMetrics(currentSigner, targetAddr);

      const personaKey = personaRef.current;
      const persona = DEMO_ACCOUNTS[personaKey];
      const isDemo = demoRef.current;

      let rep = onChain?.reputationScore ?? apiData.reputation_score ?? 100;
      let underInvestigation =
        onChain?.hasActivePenaltyLock ?? apiData.under_investigation ?? false;

      // Demo persona tutarlılığı: Dürüst profil her zaman yüksek / yeşil, riskli profil her zaman düşük.
      if (isDemo && persona) {
        if (personaKey === "citizen") {
          rep = Math.max(rep, persona.seed.reputation_score);
          underInvestigation = false;
        } else if (personaKey === "riskyCitizen") {
          rep = Math.min(rep, persona.seed.reputation_score);
          underInvestigation = true;
        }
      }

      const deposit = onChain?.userDepositUsdc ?? apiData.deposit_amount_usdc ?? 1000.0;
      const metrics = deriveTrustMetrics(rep, deposit);

      setCitizenProfile({
        ...apiData,
        reputation_score: rep,
        deposit_amount_usdc: deposit,
        under_investigation: underInvestigation,
        game_theory_profile: onChain
          ? {
              ...metrics,
              required_stake_usdc: onChain.requiredStakeUsdc,
              reward_multiplier: onChain.rewardMultiplier,
              baseline_audit_probability: onChain.auditProbability,
            }
          : metrics,
      });

      if (currentSigner) {
        const beltBal = await getBeltBalance(currentSigner, targetAddr, "0.00");
        setBeltBalance(beltBal);
      }
    },
    [account, signer]
  );

  useEffect(() => {
    refreshCitizenProfile(account, signer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);

    if (!window.ethereum) {
      setError("MetaMask bulunamadı — Demo Mod ile devam ediliyor.");
      setIsConnecting(false);
      return false;
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("Cüzdan hesabı bulunamadı.");
      }

      const _provider = new ethers.BrowserProvider(window.ethereum);
      const network = await _provider.getNetwork();
      const _signer = await _provider.getSigner();
      const address = await _signer.getAddress();
      const rawBal = await _provider.getBalance(address);

      setWeb3Instances(_provider, _signer);
      demoRef.current = false;
      personaRef.current = "metamask";
      setProvider(_provider);
      setSigner(_signer);
      setAccount(address);
      setActivePersona("metamask");
      setChainId(network.chainId.toString());
      setBalance(Number(ethers.formatEther(rawBal)).toFixed(4));
      setIsDemoMode(false);

      await refreshCitizenProfile(address, _signer);
      setIsConnecting(false);
      return true;
    } catch (err) {
      setError(err.message || "Cüzdan bağlantısı başarısız oldu, Demo Mod aktif.");
      setIsConnecting(false);
      return false;
    }
  };

  const switchDemoAccount = async (personaKey) => {
    const selected = DEMO_ACCOUNTS[personaKey] || DEMO_ACCOUNTS.citizen;
    personaRef.current = personaKey;
    demoRef.current = true;
    setActivePersona(personaKey);
    setIsDemoMode(true);
    setSigner(null);
    setProvider(null);
    setBeltBalance(selected.seed.belt_balance);
    setCitizenProfile(buildInitialProfile(personaKey));
    if (selected.address === account) {
      await refreshCitizenProfile(selected.address, null);
    } else {
      setAccount(selected.address);
    }
  };

  const resetDemoData = async () => {
    const personaKey = DEMO_ACCOUNTS[activePersona] ? activePersona : "citizen";
    const selected = DEMO_ACCOUNTS[personaKey];
    personaRef.current = personaKey;
    demoRef.current = true;
    setIsDemoMode(true);
    setSigner(null);
    setProvider(null);
    setActivePersona(personaKey);
    await resetDemoPersona(selected.address, personaKey);
    setBeltBalance(selected.seed.belt_balance);
    setCitizenProfile(buildInitialProfile(personaKey));
    setAccount(selected.address);
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
      return {
        ...prev,
        reputation_score: newRep,
        honest_declarations_count: (prev.honest_declarations_count || 0) + (repDelta > 0 ? 1 : 0),
        game_theory_profile: deriveTrustMetrics(newRep, prev.deposit_amount_usdc || 0),
      };
    });
  };

  const updateLocalDeposit = (deltaUsdc) => {
    setCitizenProfile((prev) => {
      const newDep = Math.max(0, Number(((prev.deposit_amount_usdc || 0) + deltaUsdc).toFixed(2)));
      return {
        ...prev,
        deposit_amount_usdc: newDep,
        game_theory_profile: deriveTrustMetrics(prev.reputation_score, newDep),
      };
    });
  };

  const appendCardTransaction = (prev, newTx, newCardBal, apiCard) => {
    const prevCard = prev.virtual_card || {};
    return {
      ...prev,
      card_balance_try: newCardBal,
      virtual_card: apiCard || {
        ...prevCard,
        card_balance_try: newCardBal,
        transactions: [newTx, ...(prevCard.transactions || [])],
      },
    };
  };

  const convertBeltToCard = async (beltAmount) => {
    const amt = Number(beltAmount || 0);
    if (amt <= 0) {
      throw new Error("Lütfen 0'dan büyük bir puan miktarı girin.");
    }
    if (Number(beltBalance || 0) < amt) {
      throw new Error(`Yetersiz puan bakiyesi (Mevcut: ${Number(beltBalance || 0).toFixed(2)} BELT).`);
    }

    const receipt = await convertBeltToCardOnChain(signer, isDemoMode, amt);
    const apiRes = await convertBeltToVirtualCard(account, amt, receipt?.hash);
    const addedTry = apiRes.fiat_added_try ?? Number((amt * BELT_TO_TRY_RATE).toFixed(2));

    setBeltBalance((prev) => Math.max(0, Number(prev || 0) - amt).toFixed(2));
    setCitizenProfile((prev) => {
      const newCardBal =
        apiRes.card_balance_try ?? Number(((prev.card_balance_try ?? 0) + addedTry).toFixed(2));
      const next = appendCardTransaction(
        prev,
        {
          id: Date.now(),
          tx_type: "CONVERT_LOAD",
          belt_burned: amt,
          amount_try: addedTry,
          balance_after_try: newCardBal,
          merchant_name: "Puan → TL Yükleme",
          auth_code: apiRes.auth_code || "CNV-OK",
          created_at: new Date().toISOString(),
        },
        newCardBal,
        apiRes.virtual_card
      );
      return { ...next, total_burned_belt: Number(((prev.total_burned_belt || 0) + amt).toFixed(2)) };
    });

    return { ...apiRes, fiat_added_try: addedTry };
  };

  const spendVirtualCard = async ({ amountTry, mccCode, merchantName }) => {
    const amt = Number(amountTry || 0);
    const currentCardBal = Number(citizenProfile?.card_balance_try ?? 0);
    if (amt <= 0) {
      throw new Error("Ödeme tutarı 0 TL'den büyük olmalıdır.");
    }
    if (currentCardBal < amt) {
      throw new Error(
        `Kart bakiyeniz yetersiz (Mevcut: ₺${currentCardBal.toFixed(2)}). Önce puanlarınızı TL'ye çevirin.`
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
        apiRes.card_balance_try ?? Number(Math.max(0, (prev.card_balance_try ?? 0) - amt).toFixed(2));
      return appendCardTransaction(
        prev,
        {
          id: Date.now(),
          tx_type: "MCC_SPEND",
          amount_try: amt,
          balance_after_try: newCardBal,
          mcc_code: mccCode,
          merchant_name: merchantName,
          auth_code: apiRes.auth_code || "POS-OK",
          created_at: new Date().toISOString(),
        },
        newCardBal,
        apiRes.virtual_card
      );
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
        resetDemoData,
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
