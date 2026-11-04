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
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import PrintIcon from "@mui/icons-material/Print";
import ScaleIcon from "@mui/icons-material/Scale";
import VerifiedIcon from "@mui/icons-material/Verified";
import MemoryIcon from "@mui/icons-material/Memory";
import { useWallet } from "../context/WalletContext";
import {
  generateRecyclingQR,
  verifyKioskAndPrint,
} from "../services/apiService";
import { submitRecyclingRewardOnChain } from "../services/contractService";

const MATERIAL_OPTIONS = [
  { label: "Cam (1.0x BELT/kg)", value: "glass", contractType: "glass" },
  { label: "Kağıt / Karton (1.5x BELT/kg)", value: "paper", contractType: "paper" },
  { label: "Metal / Alüminyum (2.0x BELT/kg)", value: "metal", contractType: "metal" },
  { label: "Plastik / PET (1.5x BELT/kg)", value: "plastic", contractType: "paper" },
  { label: "Elektronik Atık / E-Waste (2.0x BELT/kg)", value: "ewaste", contractType: "metal" },
];

/**
 * Bağımlılık gerektirmeyen (Zero-Dependency) Deterministik SVG QR Matris Üretici
 */
function DeterministicQrSvg({ hashString = "ecocivic", size = 168 }) {
  const gridSize = 21;
  const cells = [];

  const isFinderPattern = (r, c) => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= gridSize - 7;
    const inBottomLeft = r >= gridSize - 7 && c < 7;
    if (!inTopLeft && !inTopRight && !inBottomLeft) return null;

    const lr = inBottomLeft ? r - (gridSize - 7) : r;
    const lc = inTopRight ? c - (gridSize - 7) : c;

    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const finder = isFinderPattern(r, c);
      let filled = false;
      if (finder !== null) {
        filled = finder;
      } else {
        const charIdx = (r * gridSize + c) % hashString.length;
        const code = hashString.charCodeAt(charIdx) + r * 17 + c * 31;
        filled = code % 2 === 0;
      }
      if (filled) {
        cells.push({ r, c });
      }
    }
  }

  return (
    <Box
      sx={{
        display: "inline-block",
        p: 1.5,
        bgcolor: "#ffffff",
        borderRadius: 2,
        boxShadow: 2,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${gridSize} ${gridSize}`}>
        <rect width={gridSize} height={gridSize} fill="#ffffff" />
        {cells.map(({ r, c }) => (
          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#111827" />
        ))}
      </svg>
    </Box>
  );
}

export default function RecyclingQR() {
  const {
    account,
    signer,
    isDemoMode,
    addLocalRewardAndReputation,
    refreshCitizenProfile,
  } = useWallet();

  const [selectedMaterial, setSelectedMaterial] = useState("metal");
  const [declaredAmount, setDeclaredAmount] = useState("10");
  const [measuredWeight, setMeasuredWeight] = useState("10");
  const [kioskId, setKioskId] = useState("KIOSK-RPI-BESIKTAS-01");
  const [qrToken, setQrToken] = useState(null);
  const [kioskResult, setKioskResult] = useState(null);
  const [txReceipt, setTxReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const activeMatObj =
    MATERIAL_OPTIONS.find((m) => m.value === selectedMaterial) || MATERIAL_OPTIONS[2];

  const handleGenerateQR = async () => {
    const amt = Number(declaredAmount);
    if (!amt || amt <= 0 || amt > 1000) {
      setError("Miktar 0.1 ile 1000 kg arasında olmalıdır.");
      return;
    }

    setLoading(true);
    setError(null);
    setKioskResult(null);
    setTxReceipt(null);

    try {
      const res = await generateRecyclingQR(
        activeMatObj.contractType,
        amt,
        account
      );
      setQrToken({
        ...res.qr_token,
        display_label: activeMatObj.label,
      });
      setMeasuredWeight(String(amt));
    } catch (err) {
      setError(err.message || "QR token üretilirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleKioskVerifyAndPrint = async () => {
    if (!qrToken) {
      setError("Önce bir atık beyan QR kodu oluşturun.");
      return;
    }

    setLoading(true);
    setError(null);
    setTxReceipt(null);

    try {
      const result = await verifyKioskAndPrint({
        materialType: qrToken.material_type,
        qrToken,
        walletAddress: account,
        measuredWeightKg: Number(measuredWeight),
        kioskId,
      });
      setKioskResult(result);
      await refreshCitizenProfile();
    } catch (err) {
      setError(err.message || "Kiosk Load-Cell doğrulaması başarısız oldu.");
    } finally {
      setLoading(false);
    }
  };

  const handleClaimRecyclingOnChain = async () => {
    if (!kioskResult?.eip712_voucher) {
      setError("EIP-712 RecyclingVoucher imzası bulunamadı.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const receipt = await submitRecyclingRewardOnChain(
        signer,
        isDemoMode,
        kioskResult.eip712_voucher
      );
      setTxReceipt(receipt);
      addLocalRewardAndReputation(kioskResult.reward_amount || 15, 5);
    } catch (err) {
      setError(err.message || "Kontrat ödül basımı başarısız oldu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Grid container spacing={3}>
      {/* Left Panel: Citizen QR Declaration */}
      <Grid item xs={12} md={5}>
        <Card elevation={3} sx={{ height: "100%" }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <QrCode2Icon color="primary" />
              <Typography variant="h6" fontWeight="bold">
                1. Vatandaş Atık Beyanı & QR Üretimi
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" mb={2.5}>
              Geri dönüştürülecek malzeme türünü ve tahmini ağırlığı seçerek HMAC/SHA-256
              imzalı tek kullanımlık QR kodunuzu oluşturun.
            </Typography>

            <Stack spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Atık Malzeme Türü</InputLabel>
                <Select
                  value={selectedMaterial}
                  label="Atık Malzeme Türü"
                  onChange={(e) => setSelectedMaterial(e.target.value)}
                >
                  {MATERIAL_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Beyan Edilen Ağırlık (kg)"
                type="number"
                size="small"
                fullWidth
                value={declaredAmount}
                onChange={(e) => setDeclaredAmount(e.target.value)}
              />

              <Button
                variant="contained"
                color="primary"
                onClick={handleGenerateQR}
                disabled={loading}
              >
                Kriptografik QR Kod Üret
              </Button>
            </Stack>

            {qrToken && (
              <Box sx={{ mt: 3, textAlign: "center" }}>
                <DeterministicQrSvg hashString={qrToken.hash} />
                <Typography variant="subtitle2" mt={1.5} fontWeight="bold">
                  Token ID: {qrToken.token_id.slice(0, 14)}...
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", fontFamily: "monospace" }}
                >
                  SHA-256: {qrToken.hash.slice(0, 20)}...
                </Typography>
                <Chip
                  label={`Son Kullanma: ${new Date(qrToken.expires_at).toLocaleTimeString()}`}
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ mt: 1 }}
                />
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Right Panel: Raspberry Pi Kiosk Hardware & Thermal Printer Simulator */}
      <Grid item xs={12} md={7}>
        <Card
          elevation={3}
          sx={{ height: "100%", border: "1px solid rgba(33, 150, 243, 0.35)" }}
        >
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <MemoryIcon color="info" />
                <Typography variant="h6" fontWeight="bold">
                  2. Raspberry Pi Atık Kiosku & ESC/POS Termal Yazıcı Simülatörü
                </Typography>
              </Stack>
              <Chip label="GPIO & Load-Cell Aktif" color="info" size="small" />
            </Stack>

            <Typography variant="body2" color="text.secondary" mb={2.5}>
              Kiosk kamera okuyucusu vatandaşın QR kodunu tarar, Load-Cell (ağırlık sensörü)
              ile tartım yapar, ESC/POS termal fiş basar ve EIP-712 <code>RecyclingVoucher</code>{" "}
              üretir.
            </Typography>

            <Grid container spacing={2} alignItems="center" mb={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Kiosk Cihaz Kimliği"
                  size="small"
                  fullWidth
                  value={kioskId}
                  onChange={(e) => setKioskId(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Load-Cell Tartım Sensörü (kg)"
                  type="number"
                  size="small"
                  fullWidth
                  value={measuredWeight}
                  onChange={(e) => setMeasuredWeight(e.target.value)}
                  helperText="Beyandan >%35 sapma varsa Kiosk reddeder"
                />
              </Grid>
            </Grid>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2}>
              <Button
                variant="contained"
                color="info"
                startIcon={<ScaleIcon />}
                onClick={handleKioskVerifyAndPrint}
                disabled={!qrToken || loading}
              >
                QR Okut, Tart ve Termal Fiş Bas
              </Button>
              <Button
                variant="outlined"
                color="warning"
                size="small"
                onClick={() => setMeasuredWeight(String(Number(declaredAmount) * 2))}
                disabled={!qrToken}
              >
                Tartı Sapması Testi (+%100 Hile)
              </Button>
            </Stack>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* Thermal Printer Receipt Output */}
            {kioskResult?.thermal_receipt && (
              <Box mt={2}>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12} md={7}>
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: "#f8f9fa",
                        color: "#111827",
                        fontFamily: "'Courier New', Courier, monospace",
                        borderRadius: 1,
                        borderTop: "6px dashed #6b7280",
                        borderBottom: "6px dashed #6b7280",
                        boxShadow: 4,
                      }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        mb={1}
                      >
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <PrintIcon sx={{ fontSize: 18, color: "#374151" }} />
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: "bold", color: "#374151" }}
                          >
                            {kioskResult.thermal_receipt.protocol}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" sx={{ color: "#4b5563" }}>
                          HEX: 0x{kioskResult.thermal_receipt.escpos_hex_header}
                        </Typography>
                      </Stack>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          fontSize: "0.74rem",
                          lineHeight: 1.4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {kioskResult.thermal_receipt.printable_text}
                      </Box>
                    </Paper>
                  </Grid>

                  <Grid item xs={12} md={5}>
                    <Stack spacing={1.5} justifyContent="center" height="100%">
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: "rgba(76, 175, 80, 0.1)",
                          border: "1px solid rgba(76, 175, 80, 0.3)",
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                          <VerifiedIcon color="primary" fontSize="small" />
                          <Typography variant="subtitle2" fontWeight="bold">
                            EIP-712 Voucher Hazır
                          </Typography>
                        </Stack>
                        <Typography variant="body2">
                          Ödül: <strong>+{kioskResult.reward_amount} BELT</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Yeni İtibar ($R_i$): {kioskResult.reputation_score} Puan
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "monospace",
                            display: "block",
                            mt: 0.5,
                            wordBreak: "break-all",
                          }}
                        >
                          Sig: {kioskResult.eip712_voucher.signature.slice(0, 26)}...
                        </Typography>
                      </Box>

                      <Button
                        variant="contained"
                        color="success"
                        fullWidth
                        onClick={handleClaimRecyclingOnChain}
                        disabled={loading || Boolean(txReceipt)}
                      >
                        {txReceipt
                          ? "BELT Ödülü Cüzdana Basıldı"
                          : "Kontrata Gönder (rewardRecycling)"}
                      </Button>
                    </Stack>
                  </Grid>
                </Grid>

                {txReceipt && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    <strong>RecyclingRewards.rewardRecycling On-Chain Tamamlandı!</strong> Tx:{" "}
                    <code>{txReceipt.hash}</code> | <strong>+{kioskResult.reward_amount} BELT</strong>{" "}
                    ve <strong>+5 İtibar Puanı ($R_i$)</strong> cüzdanınıza eklendi.
                  </Alert>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
