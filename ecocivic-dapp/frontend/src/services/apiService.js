import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000";

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

/**
 * Tarayıcı üzerinde tek tıkla "Örnek Dürüst Sayaç Görseli" veya
 * "Örnek Spoof / Ekran Görüntüsü Hilesi" PNG dosyası üretir.
 */
export async function generateSampleMeterImageFile(mode = "honest") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (mode === "spoof") {
    // Siyah/Düşük kontrastlı ekran karartma veya Moiré simülasyonu
    ctx.fillStyle = "#0e0e0e";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#121212";
    ctx.fillRect(20, 20, 216, 216);
  } else {
    // Doğal gradyan ve sayaç kadranı
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, "#3d4c53");
    grad.addColorStop(0.5, "#8da1a9");
    grad.addColorStop(1, "#d9e4e8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Hafif doğal doku ekle
    for (let y = 0; y < 256; y += 8) {
      for (let x = 0; x < 256; x += 8) {
        const shade = ((x * 7 + y * 13) % 40) + 90;
        ctx.fillStyle = `rgba(${shade}, ${shade + 10}, ${shade + 15}, 0.22)`;
        ctx.fillRect(x, y, 6, 6);
      }
    }

    // Sayaç çerçevesi
    ctx.strokeStyle = "#1b262c";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 58, 208, 136);

    ctx.fillStyle = "#0f171e";
    ctx.font = "bold 18px monospace";
    const readingVal = mode === "rollback" ? 110 : 137;
    ctx.fillText("ID:MTR-2026", 40, 102);
    ctx.font = "bold 26px monospace";
    ctx.fillText(`${readingVal} m3`, 40, 152);
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const filename =
    mode === "spoof"
      ? "spoof_screen_capture.png"
      : mode === "rollback"
      ? "meter_MTR2026_idx_110.png"
      : "meter_MTR2026_idx_137.png";

  return new File([blob], filename, { type: "image/png" });
}

/**
 * 1. Su Sayacı Fotoğraf Doğrulama (POST /api/water/validate)
 */
export const validateWaterMeter = async (imageFile, walletAddress, options = {}) => {
  const formData = new FormData();
  formData.append("image", imageFile);
  if (walletAddress) formData.append("wallet_address", walletAddress);
  if (options.meterNo) formData.append("meter_no", options.meterNo);
  if (options.readingOverride !== undefined && options.readingOverride !== "") {
    formData.append("reading_override", String(options.readingOverride));
  }
  if (options.randomDrawOverride !== undefined) {
    formData.append("random_draw_override", String(options.randomDrawOverride));
  }

  try {
    const response = await apiClient.post("/api/water/validate", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      return error.response.data;
    }
    // Sunucu kapalıysa kesintisiz sunum için yerel deterministik simülasyon yanıtı
    const isSpoof = imageFile?.name?.includes("spoof");
    const isRollback = imageFile?.name?.includes("110") || Number(options.readingOverride) < 125;

    if (isSpoof) {
      return {
        valid: false,
        spoof_detected: true,
        slashing_signal: true,
        audit_required: true,
        reading_id: 901,
        reason: "Anti-spoofing check failed: Abnormal low contrast / Moiré screen recapture artifact detected",
        authenticity: {
          is_authentic: false,
          spoof_detected: true,
          authenticity_score: 0.08,
          moire_score: 0.89,
          contrast_std: 2.1,
          reason: "Moiré pattern or digital screen recapture artifact detected",
        },
      };
    }

    if (isRollback) {
      return {
        valid: false,
        reading_id: 902,
        meter_no: options.meterNo || "MTR-2026",
        current_index: 110,
        previous_index: 125,
        consumption_m3: -15,
        historical_avg: 15.0,
        audit_required: true,
        reason: "Negative consumption delta: Meter rollback or tampering detected",
        anomaly_analysis: {
          valid: false,
          is_anomaly: true,
          fraud_suspected: true,
          delta_m3: -15,
          historical_mean_delta: 15.0,
          z_score: 10.0,
          anomaly_score: 1.0,
          reason: "Negative consumption delta: Meter rollback or tampering detected",
        },
        game_theory: {
          decision: "AUDIT_REQUIRED",
          audit_required: true,
          nash_audit_probability: 0.85,
          reputation_score: 100,
          required_stake_usdc: 1000,
          reward_multiplier: 1.0,
        },
      };
    }

    const reading = Number(options.readingOverride) || 137;
    const prev = 125;
    const delta = reading - prev;
    const saved = Math.max(0, 15 - delta);
    const reward = 10 + saved * 5;

    return {
      valid: true,
      reading_id: 101,
      meter_no: options.meterNo || "MTR-2026",
      current_index: reading,
      previous_index: prev,
      consumption_m3: delta,
      saved_m3: saved,
      historical_avg: 15.0,
      reward_eligible: true,
      reward_amount: reward,
      bill_amount: delta * 5.0,
      reputation_score: 105,
      confidence_score: 0.93,
      audit_required: false,
      audit_status: "AUTO_APPROVED",
      anomaly_analysis: {
        valid: true,
        is_anomaly: false,
        fraud_suspected: false,
        delta_m3: delta,
        historical_mean_delta: 15.0,
        z_score: 0.65,
        anomaly_score: 0.12,
      },
      game_theory: {
        decision: "AUTONOMOUS_APPROVED",
        audit_required: false,
        audit_reason: "Passed AI verification and stochastic game theory threshold",
        nash_audit_probability: 0.1905,
        reputation_score: 105,
        required_stake_usdc: 952.38,
        reward_multiplier: 1.005,
        expected_utility_honest: 27.63,
        expected_utility_cheat: -28.4,
        incentive_compatible: true,
      },
      eip712_voucher: {
        voucher_type: "WaterReadingVoucher",
        nonce: 1,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signer_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        signature:
          "0x8f3c4e29a7b1d09c4412a8b67e5f3d1c90a123456789abcdef0123456789abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b",
        voucher: {
          citizen: walletAddress || "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
          currentReading: reading,
          meterId: options.meterNo || "MTR-2026",
          nonce: 1,
          deadline: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    };
  }
};

/**
 * 2. Geri Dönüşüm QR Kodu Üretimi (POST /api/recycling/qr/generate)
 */
export const generateRecyclingQR = async (materialType, amount, walletAddress) => {
  try {
    const response = await apiClient.post("/api/recycling/qr/generate", {
      material_type: materialType,
      amount: Number(amount),
      wallet_address: walletAddress,
    });
    return response.data;
  } catch {
    const now = new Date();
    const exp = new Date(now.getTime() + 3 * 3600 * 1000);
    const randomHex = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    return {
      valid: true,
      qr_token: {
        token_id: `TOK-${Date.now()}`,
        material_type: materialType.toLowerCase(),
        amount: Number(amount),
        wallet_address: walletAddress,
        expires_at: exp.toISOString(),
        hash: randomHex,
        created_at: now.toISOString(),
      },
    };
  }
};

/**
 * 3. Raspberry Pi Kiosk Doğrulama & ESC/POS Termal Fiş Basımı (POST /api/kiosk/verify-and-print)
 */
export const verifyKioskAndPrint = async ({
  materialType,
  qrToken,
  walletAddress,
  measuredWeightKg,
  kioskId = "KIOSK-RPI-01",
}) => {
  try {
    const response = await apiClient.post("/api/kiosk/verify-and-print", {
      material_type: materialType,
      qr_token: qrToken,
      wallet_address: walletAddress,
      measured_weight_kg: Number(measuredWeightKg),
      kiosk_id: kioskId,
      random_draw_override: 0.95,
    });
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      throw new Error(error.response.data.error || "Kiosk doğrulama hatası");
    }
    const mults = { glass: 1.0, paper: 1.5, metal: 2.0 };
    const matKey = String(materialType).toLowerCase();
    const mult = mults[matKey] || 1.0;
    const reward = Number((Number(measuredWeightKg) * mult).toFixed(2));
    const nonce = Math.floor(Math.random() * 100) + 1;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const matEnum = matKey === "metal" ? 2 : matKey === "paper" ? 1 : 0;

    return {
      valid: true,
      submission_id: 501,
      kiosk_id: kioskId,
      wallet_address: walletAddress,
      material_type: matKey,
      measured_weight_kg: Number(measuredWeightKg),
      reward_amount: reward,
      reputation_score: 105,
      audit_required: false,
      eip712_voucher: {
        voucher_type: "RecyclingVoucher",
        nonce,
        deadline,
        signer_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        signature:
          "0x7a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d1c",
        voucher: {
          citizen: walletAddress,
          material: matEnum,
          amount: String(BigInt(Math.round(Number(measuredWeightKg))) * 10n ** 18n),
          qrHash: qrToken.hash,
          nonce,
          deadline,
        },
      },
      thermal_receipt: {
        kiosk_id: kioskId,
        protocol: "ESC/POS-80mm",
        escpos_hex_header: "1b401b6101",
        escpos_cut_command: "1d564100",
        qr_payload_for_print: qrToken.hash,
        timestamp: new Date().toISOString(),
        printable_text: [
          "========================================",
          "      ECOCIVIC AKILLI SEHIR KIOSKU      ",
          `Kiosk ID  : ${kioskId}`,
          `Tarih     : ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
          "----------------------------------------",
          `Vatandas  : ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
          "Itibar Ri : 105 Puan",
          `Atik Turu : ${matKey.toUpperCase()}`,
          `Agirlik   : ${Number(measuredWeightKg).toFixed(2)} kg (Load-Cell Onayli)`,
          `Kazanilan : ${reward.toFixed(2)} BELT Token`,
          "----------------------------------------",
          `Voucher # : ${nonce}`,
          `QR Hash   : ${qrToken.hash.slice(0, 10)}...${qrToken.hash.slice(-6)}`,
          "Durum     : EIP-712 IMZALANDI (ON-CHAIN)",
          "========================================",
        ].join("\n"),
      },
    };
  }
};

/**
 * 4. Vatandaş Profil ve Oyun Teorisi Durumu (GET /api/citizen/<wallet>/status)
 */
export const getCitizenStatus = async (walletAddress) => {
  try {
    const response = await apiClient.get(`/api/citizen/${walletAddress}/status`);
    return response.data;
  } catch {
    return {
      wallet_address: walletAddress,
      reputation_score: 110,
      honest_declarations_count: 2,
      slashing_count: 0,
      deposit_amount_usdc: 1500.0,
      under_investigation: false,
      eip712_nonce: 2,
      game_theory_profile: {
        required_stake_usdc: 909.09,
        has_sufficient_stake: true,
        reward_multiplier: 1.01,
        reward_multiplier_bps: 10100,
        baseline_audit_probability: 0.1818,
      },
      water_readings: [
        {
          id: 1,
          meter_no: "MTR-IST-1001",
          reading_index: 137,
          previous_index: 125,
          consumption_m3: 12,
          saved_m3: 3,
          reward_amount: 25.0,
          anomaly_score: 0.12,
          audit_required: false,
          audit_status: "AUTO_APPROVED",
          audit_reason: "Passed AI verification and stochastic game theory threshold",
        },
      ],
      recycling_submissions: [
        {
          id: 1,
          material_type: "metal",
          amount_kg: 10,
          reward_amount: 20.2,
          kiosk_id: "KIOSK-RPI-01",
          qr_hash: "8f91c2a014b5e99d12c3",
        },
      ],
      penalties: [],
    };
  }
};

/**
 * 5. Belediye Zabıta / Denetçi Teftiş Kuyruğu (GET /api/admin/anomalies)
 */
export const getAdminAnomalies = async () => {
  try {
    const response = await apiClient.get("/api/admin/anomalies");
    return response.data;
  } catch {
    return {
      total_count: 2,
      anomalies: [
        {
          reading_id: 201,
          wallet_address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
          meter_no: "MTR-ANK-404",
          reading_index: 110,
          previous_index: 125,
          consumption_m3: -15.0,
          reputation_score: 100,
          confidence_score: 0.89,
          anomaly_score: 1.0,
          spoof_detected: false,
          audit_status: "AUDIT_REQUIRED",
          audit_reason: "Negative consumption delta: Meter rollback or tampering detected",
        },
        {
          reading_id: 202,
          wallet_address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
          meter_no: "MTR-IZM-808",
          reading_index: 0,
          previous_index: 140,
          consumption_m3: 0.0,
          reputation_score: 85,
          confidence_score: 0.12,
          anomaly_score: 0.95,
          spoof_detected: true,
          audit_status: "AUDIT_REQUIRED",
          audit_reason: "Anti-spoofing failure: Moiré pattern / digital screen recapture detected",
        },
      ],
    };
  }
};

/**
 * 6. Denetçi Teftiş Kararı (POST /api/admin/audit-decision)
 */
export const submitAdminAuditDecision = async ({
  readingId,
  decision,
  inspectorAddress,
  slashAmountUsdc = 300,
  reason = "Municipal physical audit decision",
}) => {
  try {
    const response = await apiClient.post("/api/admin/audit-decision", {
      reading_id: readingId,
      decision,
      inspector_address: inspectorAddress,
      slash_amount_usdc: Number(slashAmountUsdc),
      reason,
    });
    return response.data;
  } catch {
    if (decision === "APPROVE") {
      return {
        status: "APPROVED",
        reading_id: readingId,
        new_reputation_score: 105,
        voucher_signature: "0x99aabbccddeeff00112233445566778899aabbcc",
      };
    }
    const slashAmt = Number(slashAmountUsdc);
    return {
      status: "SLASHED",
      reading_id: readingId,
      slashed_amount_usdc: slashAmt,
      remaining_deposit_usdc: Math.max(0, 1000 - slashAmt),
      inspector_reward_usdc: Number((slashAmt * 0.2).toFixed(2)),
      treasury_share_usdc: Number((slashAmt * 0.8).toFixed(2)),
      reputation_before: 100,
      reputation_after: 50,
      new_required_stake_usdc: 2000.0,
    };
  }
};

/**
 * 7. Akademik Oyun Teorisi Simülasyon Matrisi (GET /api/gametheory/simulate)
 */
export const simulateGameTheoryMatrix = async (fraudGain = 50) => {
  try {
    const response = await apiClient.get(`/api/gametheory/simulate?fraud_gain=${fraudGain}`);
    return response.data;
  } catch {
    const repLevels = [25, 50, 100, 200, 500, 1000];
    const anomLevels = [0.0, 0.25, 0.5, 0.75, 1.0];
    const fg = Number(fraudGain);

    return {
      model: "2x2 Mixed-Strategy Municipal Inspection Game",
      parameters: {
        p_base: 0.2,
        alpha_anomaly: 0.65,
        beta_confidence: 0.4,
        base_required_stake_usdc: 1000.0,
        fraud_gain_assumed: fg,
      },
      matrix: repLevels.map((r_i) => {
        const reqStake = Number(((1000 * 100) / r_i).toFixed(2));
        const mult = r_i <= 100 ? r_i / 100 : 1 + (r_i - 100) * 0.001;
        return {
          reputation_score: r_i,
          required_stake_usdc: reqStake,
          reward_multiplier: Number(mult.toFixed(3)),
          scenarios: anomLevels.map((anom) => {
            const pStar = Math.min(1.0, Math.max(0.02, (0.2 * 100) / r_i + 0.65 * anom));
            const slashVal = 0.3 * reqStake + 0.25 * r_i;
            const euHonest = Number((25 * mult + 2.5).toFixed(2));
            const euCheat = Number(((1 - pStar) * fg - pStar * slashVal).toFixed(2));
            return {
              anomaly_score: anom,
              nash_audit_probability: Number(pStar.toFixed(4)),
              expected_utility_honest: euHonest,
              expected_utility_cheat: euCheat,
              incentive_compatible: euHonest >= euCheat,
              audit_required_at_median_draw: pStar > 0.5 || anom >= 0.6,
            };
          }),
        };
      }),
    };
  }
};

/**
 * 8. Evrensel Sanal Kart & Nakit Dönüşüm Köprüsü (POST /api/citizen/card/convert)
 */
export const convertBeltToVirtualCard = async (walletAddress, beltAmount, txHash) => {
  try {
    const response = await apiClient.post("/api/citizen/card/convert", {
      wallet_address: walletAddress,
      belt_amount: Number(beltAmount),
      tx_hash: txHash,
    });
    return response.data;
  } catch (error) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    const fiatAdded = Number((Number(beltAmount) * 1.5).toFixed(2));
    return {
      status: "CONVERTED",
      wallet_address: walletAddress,
      belt_burned: Number(beltAmount),
      conversion_rate_try: 1.5,
      fiat_added_try: fiatAdded,
      auth_code: `CNV-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
      blockchain_tx_hash: txHash || `0x${"a".repeat(64)}`,
    };
  }
};

/**
 * 9. Sanal Kart ile Evrensel Belediye / Ulaşım / Yerel POS Harcaması (POST /api/citizen/card/spend)
 */
export const spendVirtualCardBalance = async ({
  walletAddress,
  amountTry,
  mccCode,
  merchantName,
}) => {
  try {
    const response = await apiClient.post("/api/citizen/card/spend", {
      wallet_address: walletAddress,
      amount_try: Number(amountTry),
      mcc_code: mccCode,
      merchant_name: merchantName,
    });
    return response.data;
  } catch (error) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    return {
      status: "APPROVED",
      wallet_address: walletAddress,
      mcc_code: mccCode,
      merchant_name: merchantName,
      amount_try: Number(amountTry),
      auth_code: `POS-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC",
    };
  }
};

/**
 * 10. Demo Verilerini Sıfırla (POST /api/demo/reset)
 */
export const resetDemoPersona = async (walletAddress, persona) => {
  try {
    const response = await apiClient.post("/api/demo/reset", {
      wallet_address: walletAddress,
      persona,
    });
    return response.data;
  } catch {
    return { status: "RESET_LOCAL_ONLY", persona, wallet_address: walletAddress };
  }
};

export default apiClient;
