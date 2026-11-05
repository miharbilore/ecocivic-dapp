import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VerifiedIcon from "@mui/icons-material/Verified";
import WarningIcon from "@mui/icons-material/Warning";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import BugReportIcon from "@mui/icons-material/BugReport";
import { useWallet } from "../context/WalletContext";
import {
  generateSampleMeterImageFile,
  validateWaterMeter,
} from "../services/apiService";
import { submitWaterBillOnChain } from "../services/contractService";

export default function WaterMeterUpload() {
  const {
    account,
    signer,
    isDemoMode,
    addLocalRewardAndReputation,
    refreshCitizenProfile,
  } = useWallet();

  const [image, setImage] = useState(null);
  const [meterNo, setMeterNo] = useState("MTR-2026");
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [txReceipt, setTxReceipt] = useState(null);
  const [error, setError] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setAnalysisResult(null);
    setTxReceipt(null);
    setError(null);
  };

  const runAnalysis = async (fileToAnalyze, options = {}) => {
    if (!fileToAnalyze) {
      setError("Lütfen bir su sayacı fotoğrafı seçin veya örnek senaryolardan birine tıklayın.");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setTxReceipt(null);

    try {
      const data = await validateWaterMeter(fileToAnalyze, account, {
        meterNo,
        ...options,
      });
      setAnalysisResult(data);
      await refreshCitizenProfile();
    } catch (err) {
      setError(err.message || "AI doğrulama sırasında bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSample = async (mode) => {
    const sampleFile = await generateSampleMeterImageFile(mode);
    setImage(sampleFile);
    const opts =
      mode === "rollback"
        ? { readingOverride: 110, randomDrawOverride: 0.95 }
        : { randomDrawOverride: 0.95 };
    await runAnalysis(sampleFile, opts);
  };

  const handleClaimOnChain = async () => {
    if (!analysisResult?.eip712_voucher) {
      setError("EIP-712 imzalı voucher bulunamadı.");
      return;
    }

    setTxLoading(true);
    setError(null);

    try {
      const receipt = await submitWaterBillOnChain(
        signer,
        isDemoMode,
        analysisResult.eip712_voucher
      );
      setTxReceipt(receipt);
      addLocalRewardAndReputation(analysisResult.reward_amount || 25, 5);
    } catch (err) {
      setError(err.message || "Zincir üstü işlem başarısız oldu.");
    } finally {
      setTxLoading(false);
    }
  };

  return (
    <Box>
      <Card elevation={3} sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <WaterDropIcon color="secondary" />
            <Typography variant="h6" fontWeight="bold">
              AI Destekli Su Sayacı Doğrulama & EIP-712 Ödül Hattı
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2.5}>
            Yüklenen sayaç fotoğrafı sırasıyla 2D FFT Anti-Spoofing, OpenCV CLAHE Ön İşleme,
            Tüketim Deltası ($\Delta$) Analizi ve 2x2 Oyun Teorisi Denetim Motorundan geçerek
            EIP-712 kriptografik voucher ile imzalanır.
          </Typography>

          <Grid container spacing={2} alignItems="center" mb={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Sayaç Numarası (Meter ID)"
                size="small"
                fullWidth
                value={meterNo}
                onChange={(e) => setMeterNo(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <input
                accept="image/*"
                style={{ display: "none" }}
                id="water-meter-file-input"
                type="file"
                onChange={handleImageChange}
              />
              <label htmlFor="water-meter-file-input">
                <Button
                  variant="outlined"
                  component="span"
                  fullWidth
                  startIcon={<CloudUploadIcon />}
                >
                  {image ? image.name.slice(0, 22) : "Sayaç Fotoğrafı Seç"}
                </Button>
              </label>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button
                variant="contained"
                color="secondary"
                fullWidth
                disabled={!image || loading}
                onClick={() => runAnalysis(image, { randomDrawOverride: 0.95 })}
              >
                {loading ? "AI Pipeline Çalışıyor..." : "Analiz Et & İmzala"}
              </Button>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            Hızlı Jüri / Sunum Test Senaryoları (Tek Tıkla Canlı AI Pipeline):
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <Button
              variant="outlined"
              color="success"
              size="small"
              startIcon={<AutoFixHighIcon />}
              onClick={() => handleQuickSample("honest")}
              disabled={loading}
            >
              1. Örnek Dürüst Sayaç Görseli (137 m³ - Tasarruflu)
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<BugReportIcon />}
              onClick={() => handleQuickSample("spoof")}
              disabled={loading}
            >
              2. Örnek Spoof / Ekran Görüntüsü Hilesi (FFT Moiré Reddi)
            </Button>
            <Button
              variant="outlined"
              color="warning"
              size="small"
              startIcon={<WarningIcon />}
              onClick={() => handleQuickSample("rollback")}
              disabled={loading}
            >
              3. Örnek Geriye Giden Sayaç (Δ &lt; 0 Rollback Anomalisi)
            </Button>
          </Stack>

          {loading && <LinearProgress sx={{ mt: 2 }} />}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 5-STEP AI & GAME THEORY PIPELINE RESULTS */}
      {analysisResult && (
        <Grid container spacing={2.5}>
          {/* Step 1: 2D FFT Anti-Spoofing */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2.5, height: "100%" }} elevation={2}>
              <Stack direction="row" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight="bold">
                  1) 2D FFT Anti-Spoofing & Canlılık Analizi
                </Typography>
                <Chip
                  label={
                    analysisResult.spoof_detected ? "SAHTE GÖRÜNTÜ (SPOOF)" : "CANLI / GERÇEK"
                  }
                  color={analysisResult.spoof_detected ? "error" : "success"}
                  size="small"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                • Durum:{" "}
                {analysisResult.spoof_detected
                  ? analysisResult.reason
                  : "Frekans spektrumunda ekran ızgarası (Moiré) veya manipülasyon saptanmadı."}
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                • Slashing Sinyali: {analysisResult.spoof_detected ? "AKTİF (Zabıta Kuyruğunda)" : "Yok"}
              </Typography>
            </Paper>
          </Grid>

          {/* Step 2: OpenCV & OCR */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2.5, height: "100%" }} elevation={2}>
              <Stack direction="row" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight="bold">
                  2) OpenCV CLAHE Ön İşleme & OCR Okuma
                </Typography>
                <Chip
                  label={`Güven: %${((analysisResult.confidence_score || 0) * 100).toFixed(1)}`}
                  color={analysisResult.confidence_score >= 0.75 ? "info" : "warning"}
                  size="small"
                />
              </Stack>
              <Typography variant="body2">
                • Okunan Sayaç No: <strong>{analysisResult.meter_no || meterNo}</strong>
              </Typography>
              <Typography variant="body2">
                • Okunan Güncel Endeks:{" "}
                <strong>
                  {analysisResult.current_index !== undefined
                    ? `${analysisResult.current_index} m³`
                    : "Okunamadı (Spoof Engeli)"}
                </strong>{" "}
                (Önceki: {analysisResult.previous_index ?? 125} m³)
              </Typography>
            </Paper>
          </Grid>

          {/* Step 3: Delta (Δ) Consumption & Water Savings */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2.5, height: "100%" }} elevation={2}>
              <Stack direction="row" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight="bold">
                  3) Δ Tüketim Farkı & Su Tasarruf Modeli
                </Typography>
                <Chip
                  label={
                    analysisResult.anomaly_analysis?.is_anomaly
                      ? "ANOMALİ SAPTANDI"
                      : "DELTA NORMAL"
                  }
                  color={analysisResult.anomaly_analysis?.is_anomaly ? "error" : "success"}
                  size="small"
                />
              </Stack>
              <Typography variant="body2">
                • Bu Ayki Tüketim ($\Delta$):{" "}
                <strong>{analysisResult.consumption_m3 ?? 0} m³</strong> (Geçmiş Ort:{" "}
                {analysisResult.historical_avg ?? 15} m³)
              </Typography>
              <Typography variant="body2">
                • Tasarruf Edilen Su: <strong>{analysisResult.saved_m3 ?? 0} m³</strong> | Z-Skoru:{" "}
                {analysisResult.anomaly_analysis?.z_score ?? 0}
              </Typography>
              <Typography variant="body2" color="primary.main" fontWeight="bold" mt={0.5}>
                • Hesaplanan Tasarruf Ödülü: {analysisResult.reward_amount ?? 0} BELT
              </Typography>
            </Paper>
          </Grid>

          {/* Step 4: Game Theory Decision */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2.5, height: "100%" }} elevation={2}>
              <Stack direction="row" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight="bold">
                  4) 2x2 Oyun Teorisi Denetim Kararı
                </Typography>
                <Chip
                  label={
                    analysisResult.audit_required ? "AUDIT_REQUIRED (Teftiş)" : "AUTO_APPROVED"
                  }
                  color={analysisResult.audit_required ? "warning" : "success"}
                  size="small"
                />
              </Stack>
              <Typography variant="body2">
                • Rutin Kontrol Sıklığı:{" "}
                <strong>
                  %{((analysisResult.game_theory?.nash_audit_probability || 0.2) * 100).toFixed(1)}
                </strong>
              </Typography>
              <Typography variant="body2">
                • Beklenen Fayda (Dürüst / Hile):{" "}
                {analysisResult.game_theory?.expected_utility_honest ?? "27.5"} /{" "}
                {analysisResult.game_theory?.expected_utility_cheat ?? "-25.0"}
              </Typography>
            </Paper>
          </Grid>

          {/* Step 5: EIP-712 Cryptographic Voucher & On-Chain Claim */}
          <Grid item xs={12}>
            <Paper
              sx={{
                p: 2.5,
                border: "1px solid",
                borderColor: analysisResult.eip712_voucher ? "primary.main" : "warning.main",
              }}
              elevation={3}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                spacing={2}
              >
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <VerifiedIcon
                      color={analysisResult.eip712_voucher ? "primary" : "warning"}
                    />
                    <Typography variant="subtitle1" fontWeight="bold">
                      5) EIP-712 Kriptografik AI Oracle Voucher & Akıllı Kontrat Çağrısı
                    </Typography>
                  </Stack>
                  {analysisResult.eip712_voucher ? (
                    <>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: "monospace", display: "block", wordBreak: "break-all" }}
                      >
                        Oracle Signer: {analysisResult.eip712_voucher.signer_address} | Nonce:{" "}
                        {analysisResult.eip712_voucher.nonce}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="primary.main"
                        sx={{ fontFamily: "monospace", display: "block", wordBreak: "break-all" }}
                      >
                        EIP-712 Signature: {analysisResult.eip712_voucher.signature}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="warning.main">
                      Anomali veya Spoof tespit edildiği için AI Oracle tarafından EIP-712 imzası
                      üretilmedi. Kayıt Belediye Denetim Portalına iletildi.
                    </Typography>
                  )}
                </Box>

                {analysisResult.eip712_voucher && (
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleClaimOnChain}
                    disabled={txLoading || Boolean(txReceipt)}
                  >
                    {txLoading
                      ? "Zincire Yazılıyor..."
                      : txReceipt
                      ? "Ödül & +5 İtibar Alındı"
                      : `WaterBilling.payBill Çağır (+${analysisResult.reward_amount} BELT)`}
                  </Button>
                )}
              </Stack>

              {txReceipt && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  <strong>On-Chain İşlem Onaylandı!</strong> Tx Hash:{" "}
                  <code>{txReceipt.hash}</code> | Blok: #{txReceipt.blockNumber} | Kazanılan:{" "}
                  <strong>+{analysisResult.reward_amount} BELT</strong> ve{" "}
                  <strong>+5 Güven Puanı</strong>!
                </Alert>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
