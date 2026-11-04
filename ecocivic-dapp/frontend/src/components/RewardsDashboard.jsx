import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import GavelIcon from "@mui/icons-material/Gavel";
import SecurityIcon from "@mui/icons-material/Security";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useWallet } from "../context/WalletContext";

const MCC_PRESET_OPTIONS = [
  {
    mcc: "9399",
    label: "MCC 9399 — Herhangi Bir Belediyenin Online Su/Vergi Veznesi",
    merchant: "Evrensel Belediye Online Su & Çevre Veznesi (İSKİ/ASKİ/İZSU)",
    defaultAmount: 120,
  },
  {
    mcc: "4111",
    label: "MCC 4111 — Şehir İçi Ulaşım Temassız Ödeme (Metro/Otobüs POS)",
    merchant: "Belediye Toplu Ulaşım Temassız Turnike POS",
    defaultAmount: 45,
  },
  {
    mcc: "5411",
    label: "MCC 5411 — Yerel Market / Üretici Kooperatifi POS",
    merchant: "Belediye Halk Market & Yerel Üretici Kooperatifi",
    defaultAmount: 85,
  },
  {
    mcc: "7995",
    label: "MCC 7995 — [Red Testi] Yeşil Dışı Kategori (MCC Kısıtlama Testi)",
    merchant: "Yetkisiz Kategori İşyeri POS",
    defaultAmount: 50,
  },
];

export default function RewardsDashboard() {
  const {
    account,
    beltBalance,
    citizenProfile,
    convertBeltToCard,
    spendVirtualCard,
  } = useWallet();

  const [showCardSecrets, setShowCardSecrets] = useState(false);
  const [convertBeltInput, setConvertBeltInput] = useState("50");
  const [selectedMccIndex, setSelectedMccIndex] = useState(0);
  const [spendAmountInput, setSpendAmountInput] = useState("120");
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const [cardFeedback, setCardFeedback] = useState(null);
  const [lastPosSlip, setLastPosSlip] = useState(null);

  const repScore = citizenProfile?.reputation_score ?? 100;
  const gt = citizenProfile?.game_theory_profile || {};
  const rewardMult = gt.reward_multiplier ?? 1.0;
  const reqStake = gt.required_stake_usdc ?? 1000.0;
  const auditProb = (gt.baseline_audit_probability ?? 0.2) * 100;
  const honestCount = citizenProfile?.honest_declarations_count ?? 0;
  const slashCount = citizenProfile?.slashing_count ?? 0;

  const vCard = citizenProfile?.virtual_card || {};
  const cardBalanceTry = Number(
    citizenProfile?.card_balance_try ?? vCard.card_balance_try ?? 225.0
  );
  const conversionRateTry = Number(vCard.conversion_rate_try ?? 1.5);
  const cardPanFull = vCard.card_number_full || "9792 8420 5193 4821";
  const cardPanMasked = vCard.card_number_masked || "9792 **** **** 4821";
  const cardExpiry = vCard.expiry_date || "08/29";
  const cardCvv = vCard.cvv || "642";
  const cardHolder =
    vCard.card_holder ||
    `ECOCIVIC CITIZEN (${(account || "0x90F7...b906").slice(0, 6)}...${(
      account || "0x90F7...b906"
    ).slice(-4)})`;
  const cardTransactions = vCard.transactions || [];

  // Normalize reputation between 0 and 100% (Max 1000)
  const repProgress = Math.min(100, Math.max(2, (repScore / 1000) * 100));

  const handleConvertBelt = async () => {
    setCardFeedback(null);
    setIsProcessingCard(true);
    try {
      const res = await convertBeltToCard(Number(convertBeltInput));
      setCardFeedback({
        severity: "success",
        text: `${Number(convertBeltInput).toFixed(2)} BELT yakıldı (burn) ve Sanal Kartınıza +₺${Number(
          res.fiat_added_try ?? Number(convertBeltInput) * conversionRateTry
        ).toFixed(2)} TL yüklendi! (Kod: ${res.auth_code || "CNV-OK"})`,
      });
    } catch (err) {
      setCardFeedback({
        severity: "error",
        text: err.message || "BELT -> Sanal Kart dönüşümü sırasında hata oluştu.",
      });
    } finally {
      setIsProcessingCard(false);
    }
  };

  const handleSelectMccChange = (idx) => {
    setSelectedMccIndex(idx);
    const preset = MCC_PRESET_OPTIONS[idx];
    if (preset) {
      setSpendAmountInput(String(preset.defaultAmount));
    }
  };

  const handlePosSpend = async () => {
    setCardFeedback(null);
    setIsProcessingCard(true);
    const preset = MCC_PRESET_OPTIONS[selectedMccIndex] || MCC_PRESET_OPTIONS[0];
    try {
      const res = await spendVirtualCard({
        amountTry: Number(spendAmountInput),
        mccCode: preset.mcc,
        merchantName: preset.merchant,
      });
      setLastPosSlip({
        authCode: res.auth_code,
        mccCode: preset.mcc,
        merchantName: preset.merchant,
        amountTry: Number(spendAmountInput),
        remainingTry: res.card_balance_try,
        timestamp: res.timestamp || new Date().toLocaleString("tr-TR"),
      });
      setCardFeedback({
        severity: "success",
        text: `Evrensel POS Ödemesi Onaylandı! ₺${Number(spendAmountInput).toFixed(
          2
        )} TL — Provizyon Kodu: ${res.auth_code}`,
      });
    } catch (err) {
      setCardFeedback({
        severity: "error",
        text: err.message || "POS harcama işlemi reddedildi.",
      });
    } finally {
      setIsProcessingCard(false);
    }
  };

  return (
    <Stack spacing={3}>
      {/* 1. Sivil İtibar (R_i) & Oyun Teorisi Profili */}
      <Card elevation={3} sx={{ border: "1px solid rgba(76, 175, 80, 0.3)" }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <VerifiedUserIcon color="primary" />
              <Typography variant="h6" fontWeight="bold">
                Mahremiyet Odaklı Sivil İtibar ($R_i$) & Oyun Teorisi Profili
              </Typography>
            </Stack>
            <Chip
              label={repScore >= 100 ? "Güvenilir Vatandaş" : "Yüksek Denetim Riski"}
              color={repScore >= 100 ? "success" : "warning"}
              size="small"
            />
          </Stack>

          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  bgcolor: "rgba(76, 175, 80, 0.1)",
                  border: "1px solid rgba(76, 175, 80, 0.25)",
                  textAlign: "center",
                }}
              >
                <EmojiEventsIcon color="primary" sx={{ fontSize: 38, mb: 0.5 }} />
                <Typography variant="body2" color="text.secondary">
                  Toplam Ödül Bakiyesi (Kapalı Devre Puan)
                </Typography>
                <Typography variant="h4" color="primary.main" fontWeight="bold" my={0.5}>
                  {Number(beltBalance || 0).toFixed(2)} BELT
                </Typography>
                <Stack direction="row" spacing={1} justifyContent="center" mt={1}>
                  <Chip
                    label={`Ödül Çarpanı: ${rewardMult.toFixed(3)}x`}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                  <Chip
                    label={`1 BELT = ₺${conversionRateTry.toFixed(2)} TL`}
                    color="secondary"
                    size="small"
                  />
                </Stack>
              </Box>
            </Grid>

            <Grid item xs={12} md={8}>
              <Box mb={2.5}>
                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" fontWeight="bold">
                    Sivil İtibar Skoru (R_i): {repScore} / 1000 Puan
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Dürüst Beyan: +{honestCount * 5}p | Ceza (Slashing): {slashCount} kez
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={repProgress}
                  color={repScore >= 100 ? "success" : "warning"}
                  sx={{ height: 10, borderRadius: 5 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Soulbound (Devredilemez) İtibar: Her dürüst beyanda +5 puan artar, hile yakalandığında %50 kesilir.
                </Typography>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ p: 1.5, bgcolor: "background.default", borderRadius: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <SecurityIcon color="info" fontSize="small" />
                      <Typography variant="subtitle2">
                        Dinamik Minimum Teminat (S_req)
                      </Typography>
                    </Stack>
                    <Typography variant="h6" color="info.main" fontWeight="bold">
                      {reqStake.toFixed(2)} USDC
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Formül: S_base (1000) × 100 / R_i
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box sx={{ p: 1.5, bgcolor: "background.default", borderRadius: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <GavelIcon color="secondary" fontSize="small" />
                      <Typography variant="subtitle2">
                        Nash Denetim Olasılığı (p*)
                      </Typography>
                    </Stack>
                    <Typography variant="h6" color="secondary.main" fontWeight="bold">
                      %{auditProb.toFixed(1)}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, auditProb)}
                      color={auditProb > 30 ? "error" : "secondary"}
                      sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 2. EcoCivic Dijital Cüzdan & Ön Ödemeli Sanal Kart (BaaS / Virtual Card Cashback) */}
      <Card
        elevation={4}
        sx={{
          border: "1px solid rgba(33, 150, 243, 0.4)",
          background:
            "linear-gradient(180deg, rgba(18, 28, 45, 0.95) 0%, rgba(15, 20, 30, 0.98) 100%)",
        }}
      >
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={1}
            mb={2.5}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <CreditCardIcon color="secondary" />
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  EcoCivic Dijital Cüzdan & Ön Ödemeli Sanal Kart (BaaS Köprüsü)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Belediyelere özel entegrasyon yaması gerektirmeden, kazanılan BELT puanlarını yakıp (burn) tüm belediye POS/online veznelerinde geçen TL bakiyesine dönüştürün.
                </Typography>
              </Box>
            </Stack>
            <Chip
              icon={<CheckCircleOutlineIcon />}
              label="MCC Yeşil Harcama Kısıtlaması: Aktif"
              color="success"
              variant="outlined"
              size="small"
            />
          </Stack>

          {cardFeedback && (
            <Alert
              severity={cardFeedback.severity}
              sx={{ mb: 2.5 }}
              onClose={() => setCardFeedback(null)}
            >
              {cardFeedback.text}
            </Alert>
          )}

          <Grid container spacing={3} alignItems="stretch">
            {/* Sol: Gerçekçi Troy / Mastercard Sanal Kart Görseli */}
            <Grid item xs={12} md={5}>
              <Box
                sx={{
                  p: 3,
                  borderRadius: 3,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  background:
                    "linear-gradient(135deg, #0d47a1 0%, #1b5e20 55%, #004d40 100%)",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#fff",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="overline" sx={{ opacity: 0.85, letterSpacing: 1.5 }}>
                      ECOCIVIC B2G PREPAIDVIRTUAL
                    </Typography>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: "#a5d6a7" }}>
                      TROY / MASTERCARD YEŞİL KART
                    </Typography>
                  </Box>
                  <Tooltip
                    title={
                      showCardSecrets
                        ? "Kart Numarası ve CVV Gizle"
                        : "16 Haneli Kart Numarası ve CVV Göster"
                    }
                  >
                    <IconButton
                      size="small"
                      onClick={() => setShowCardSecrets((prev) => !prev)}
                      sx={{ color: "#fff", bgcolor: "rgba(255,255,255,0.12)" }}
                    >
                      {showCardSecrets ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Box my={2.5}>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    KULLANILABİLİR SANAL KART BAKİYESİ
                  </Typography>
                  <Typography variant="h3" fontWeight="bold" sx={{ letterSpacing: 0.5 }}>
                    ₺{cardBalanceTry.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#81c784" }}>
                    Sabit Dönüşüm Kuru: 1 BELT = ₺{conversionRateTry.toFixed(2)} TL (0.10 USDC)
                  </Typography>
                </Box>

                <Box>
                  <Typography
                    variant="h6"
                     sx={{
                      fontFamily: "monospace",
                      letterSpacing: 2.5,
                      mb: 1.5,
                      textShadow: "0 2px 4px rgba(0,0,0,0.4)",
                    }}
                  >
                    {showCardSecrets ? cardPanFull : cardPanMasked}
                  </Typography>

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="caption" sx={{ opacity: 0.7, display: "block" }}>
                        KART SAHİBİ
                      </Typography>
                      <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: "monospace" }}>
                        {cardHolder}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={2.5}>
                      <Box>
                        <Typography variant="caption" sx={{ opacity: 0.7, display: "block" }}>
                          SKT
                        </Typography>
                        <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: "monospace" }}>
                          {cardExpiry}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ opacity: 0.7, display: "block" }}>
                          CVV
                        </Typography>
                        <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: "monospace" }}>
                          {showCardSecrets ? cardCvv : "***"}
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </Box>
              </Box>
            </Grid>

            {/* Sağ: 1) BELT -> TL Dönüşüm Köprüsü & 2) Evrensel Belediye POS Simülatörü */}
            <Grid item xs={12} md={7}>
              <Stack spacing={2.5}>
                {/* A) BELT Puanlarını Kart Bakiyesine Çevir */}
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: "rgba(76, 175, 80, 0.08)",
                    border: "1px solid rgba(76, 175, 80, 0.25)",
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                    <SwapHorizIcon color="primary" />
                    <Typography variant="subtitle1" fontWeight="bold">
                      1. BELT Puanlarını Kart Bakiyesine Çevir (On-Chain Burn & Anında TL Yükle)
                    </Typography>
                  </Stack>

                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={5}>
                      <TextField
                        label="Yakılacak BELT Miktarı"
                        type="number"
                        size="small"
                        fullWidth
                        value={convertBeltInput}
                        onChange={(e) => setConvertBeltInput(e.target.value)}
                        inputProps={{ min: 1, step: 5 }}
                        helperText={`Cüzdan: ${Number(beltBalance || 0).toFixed(2)} BELT`}
                      />
                    </Grid>
                    <Grid item xs={12} sm={7}>
                      <Button
                        variant="contained"
                        color="primary"
                        fullWidth
                        disabled={isProcessingCard}
                        startIcon={<SwapHorizIcon />}
                        onClick={handleConvertBelt}
                        sx={{ py: 1.1, fontWeight: "bold" }}
                      >
                        BELT Puanlarını Kart Bakiyesine Çevir (+₺
                        {(Number(convertBeltInput || 0) * conversionRateTry).toFixed(2)} TL)
                      </Button>
                    </Grid>
                  </Grid>
                </Box>

                {/* B) Sanal Kart ile Ödeme Simülatörü (Evrensel Belediye POS) */}
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: "rgba(33, 150, 243, 0.08)",
                    border: "1px solid rgba(33, 150, 243, 0.25)",
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                    <PointOfSaleIcon color="secondary" />
                    <Typography variant="subtitle1" fontWeight="bold">
                      2. Sanal Kart ile Ödeme Simülatörü (Evrensel Belediye POS & MCC Filtresi)
                    </Typography>
                  </Stack>

                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={8}>
                      <FormControl fullWidth size="small">
                        <InputLabel>POS İşyeri / Belediye Veznesi (MCC Kodu)</InputLabel>
                        <Select
                          value={selectedMccIndex}
                          label="POS İşyeri / Belediye Veznesi (MCC Kodu)"
                          onChange={(e) => handleSelectMccChange(Number(e.target.value))}
                        >
                          {MCC_PRESET_OPTIONS.map((item, idx) => (
                            <MenuItem key={item.mcc} value={idx}>
                              {item.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Tutar (TL)"
                        type="number"
                        size="small"
                        fullWidth
                        value={spendAmountInput}
                        onChange={(e) => setSpendAmountInput(e.target.value)}
                        inputProps={{ min: 1, step: 10 }}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        color="secondary"
                        fullWidth
                        disabled={isProcessingCard}
                        startIcon={<PointOfSaleIcon />}
                        onClick={handlePosSpend}
                        sx={{ fontWeight: "bold" }}
                      >
                        Sanal Kart ile Evrensel Belediye / Ulaşım POS Ödemesi Yap (₺
                        {Number(spendAmountInput || 0).toFixed(2)} TL)
                      </Button>
                    </Grid>
                  </Grid>

                  {lastPosSlip && (
                    <Box
                      sx={{
                        mt: 2,
                        p: 1.5,
                        borderRadius: 1.5,
                        bgcolor: "rgba(0,0,0,0.35)",
                        border: "1px dashed rgba(255,255,255,0.25)",
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      <Typography variant="caption" color="success.main" fontWeight="bold">
                        ✓ EVRENSEL POS PROVİZYON DEKONTU (ONAYLANDI)
                      </Typography>
                      <Box mt={0.5}>
                        İşyeri: {lastPosSlip.merchantName} (MCC {lastPosSlip.mccCode}) | Tutar: -₺
                        {Number(lastPosSlip.amountTry).toFixed(2)} TL | Kalan Bakiye: ₺
                        {Number(lastPosSlip.remainingTry).toFixed(2)} TL | Provizyon:{" "}
                        <strong>{lastPosSlip.authCode}</strong>
                      </Box>
                    </Box>
                  )}

                  {cardTransactions.length > 0 && (
                    <Box mt={1.5}>
                      <Typography variant="caption" color="text.secondary">
                        Son Kart Hareketi: {cardTransactions[0].merchant_name} (
                        {cardTransactions[0].tx_type === "CONVERT_LOAD" ? "+" : "-"}₺
                        {Number(cardTransactions[0].amount_try).toFixed(2)} TL — Kod:{" "}
                        {cardTransactions[0].auth_code})
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}
