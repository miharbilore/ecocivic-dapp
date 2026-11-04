import React, { useEffect, useState } from "react";
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
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import GavelIcon from "@mui/icons-material/Gavel";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ScienceIcon from "@mui/icons-material/Science";
import RefreshIcon from "@mui/icons-material/Refresh";
import SecurityIcon from "@mui/icons-material/Security";
import { useWallet } from "../context/WalletContext";
import {
  getAdminAnomalies,
  simulateGameTheoryMatrix,
  submitAdminAuditDecision,
} from "../services/apiService";
import { slashAndDistributeOnChain } from "../services/contractService";

export default function AdminPortal() {
  const { account, signer, isDemoMode, refreshCitizenProfile } = useWallet();

  const [anomalies, setAnomalies] = useState([]);
  const [slashAmountUsdc, setSlashAmountUsdc] = useState("400");
  const [decisionStatus, setDecisionStatus] = useState(null);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);

  const [fraudGain, setFraudGain] = useState(50);
  const [simData, setSimData] = useState(null);
  const [loadingSim, setLoadingSim] = useState(false);

  const loadAnomalies = async () => {
    setLoadingAnomalies(true);
    const res = await getAdminAnomalies();
    setAnomalies(res.anomalies || []);
    setLoadingAnomalies(false);
  };

  const loadSimulation = async (gainVal = fraudGain) => {
    setLoadingSim(true);
    const data = await simulateGameTheoryMatrix(gainVal);
    setSimData(data);
    setLoadingSim(false);
  };

  useEffect(() => {
    loadAnomalies();
    loadSimulation(50);
  }, []);

  const handleAuditDecision = async (item, decision) => {
    setDecisionStatus(null);
    const res = await submitAdminAuditDecision({
      readingId: item.reading_id,
      decision,
      inspectorAddress: account,
      slashAmountUsdc: Number(slashAmountUsdc),
      reason: item.audit_reason || "Municipal physical audit decision",
    });

    let txHash = null;
    if (decision === "SLASH") {
      const receipt = await slashAndDistributeOnChain(
        signer,
        isDemoMode,
        item.wallet_address,
        Number(slashAmountUsdc),
        account,
        item.audit_reason || "Audit Slashing"
      );
      txHash = receipt.hash;
    }

    setDecisionStatus({
      decision,
      result: res,
      txHash,
      offender: item.wallet_address,
    });

    await loadAnomalies();
    await refreshCitizenProfile();
  };

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
        mb={3}
        spacing={2}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            B2G Belediye Denetim & Akademik Oyun Teorisi Portalı
          </Typography>
          <Typography variant="body2" color="text.secondary">
            TÜBİTAK 2209-B Otonom Denetim Kuyruğu, Zabıta Slashing Yönetimi (%20 Denetçi Ödülü / %80
            Belediye Çevre Fonu) ve 2x2 Karma Stratejili Nash Dengesi Laboratuvarı.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            loadAnomalies();
            loadSimulation(fraudGain);
          }}
        >
          Verileri Yenile
        </Button>
      </Stack>

      {/* SECTION 1: MUNICIPAL INSPECTOR QUEUE & SLASHING */}
      <Card elevation={3} sx={{ mb: 4, border: "1px solid rgba(255, 152, 0, 0.35)" }}>
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            mb={2}
            spacing={2}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <GavelIcon color="warning" />
              <Typography variant="h6" fontWeight="bold">
                Bölüm 1: Zabıta / Denetçi Fiziksel Teftiş Kuyruğu (AUDIT_REQUIRED & SPOOF)
              </Typography>
            </Stack>

            <TextField
              label="Slashing Ceza Tutarı (USDC)"
              type="number"
              size="small"
              value={slashAmountUsdc}
              onChange={(e) => setSlashAmountUsdc(e.target.value)}
              sx={{ width: 210 }}
            />
          </Stack>

          {loadingAnomalies && <LinearProgress sx={{ mb: 2 }} />}

          {decisionStatus && (
            <Alert
              severity={decisionStatus.decision === "APPROVE" ? "success" : "error"}
              sx={{ mb: 2.5 }}
            >
              {decisionStatus.decision === "APPROVE" ? (
                <>
                  <strong>Dürüst Beyan Onaylandı (APPROVED)!</strong> Vatandaş (
                  <code>{decisionStatus.offender.slice(0, 10)}...</code>) İtibar Skoru +5 artırıldı
                  (Yeni $R_i$: {decisionStatus.result.new_reputation_score}) ve EIP-712 Voucher
                  imzalandı.
                </>
              ) : (
                <>
                  <strong>
                    SlashingManager.slashAndDistribute On-Chain Ceza Kesintisi Uygulandı!
                  </strong>{" "}
                  Kesilen: <strong>{decisionStatus.result.slashed_amount_usdc} USDC</strong> |
                  Denetçi Ödülü (%20):{" "}
                  <strong>{decisionStatus.result.inspector_reward_usdc} USDC</strong> | Belediye
                  Çevre Fonu (%80):{" "}
                  <strong>{decisionStatus.result.treasury_share_usdc} USDC</strong> | İtibar ($R_i$):{" "}
                  <strong>
                    {decisionStatus.result.reputation_before} →{" "}
                    {decisionStatus.result.reputation_after}
                  </strong>{" "}
                  (Yeni Min. Teminat Şartı: {decisionStatus.result.new_required_stake_usdc} USDC) |
                  Tx: <code>{decisionStatus.txHash?.slice(0, 18)}...</code>
                </>
              )}
            </Alert>
          )}

          {anomalies.length === 0 ? (
            <Alert severity="info">
              Şu anda fiziksel denetim bekleyen şüpheli beyan bulunmamaktadır. Su Yönetimi
              sayfasından &quot;Örnek Spoof&quot; veya &quot;Rollback&quot; senaryosu tetikleyerek
              kuyruğu test edebilirsiniz.
            </Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID / Sayaç</TableCell>
                  <TableCell>Vatandaş Cüzdanı</TableCell>
                  <TableCell>Endeks / Δ</TableCell>
                  <TableCell>İtibar ($R_i$)</TableCell>
                  <TableCell>Anomali / Spoof</TableCell>
                  <TableCell>Teftiş Nedeni</TableCell>
                  <TableCell>Durum</TableCell>
                  <TableCell align="right">Denetçi Kararı (On-Chain)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {anomalies.map((item) => (
                  <TableRow key={item.reading_id}>
                    <TableCell>
                      <strong>#{item.reading_id}</strong> ({item.meter_no})
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>
                      {item.wallet_address.slice(0, 6)}...{item.wallet_address.slice(-4)}
                    </TableCell>
                    <TableCell>
                      {item.reading_index} m³ (Δ: {item.consumption_m3} m³)
                    </TableCell>
                    <TableCell>{item.reputation_score}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Chip
                          label={`Skor: ${Number(item.anomaly_score).toFixed(2)}`}
                          color={item.anomaly_score >= 0.7 ? "error" : "warning"}
                          size="small"
                        />
                        {item.spoof_detected && (
                          <Chip label="SPOOF" color="error" size="small" />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography variant="caption">{item.audit_reason}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={item.audit_status}
                        color={
                          item.audit_status === "SLASHED"
                            ? "error"
                            : item.audit_status === "APPROVED"
                            ? "success"
                            : "warning"
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="outlined"
                          color="success"
                          size="small"
                          startIcon={<CheckCircleOutlineIcon />}
                          disabled={item.audit_status !== "AUDIT_REQUIRED"}
                          onClick={() => handleAuditDecision(item, "APPROVE")}
                        >
                          Onayla (APPROVE)
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          startIcon={<GavelIcon />}
                          disabled={item.audit_status !== "AUDIT_REQUIRED"}
                          onClick={() => handleAuditDecision(item, "SLASH")}
                        >
                          Hile Kesintisi (SLASH)
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: ACADEMIC GAME THEORY (2x2 INSPECTION GAME) SIMULATOR */}
      <Card elevation={3} sx={{ border: "1px solid rgba(33, 150, 243, 0.35)" }}>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
            mb={2}
            spacing={2}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <ScienceIcon color="info" />
                <Typography variant="h6" fontWeight="bold">
                  Bölüm 2: Akademik Oyun Teorisi (2x2 Inspection Game) Simülasyon Laboratuvarı
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Q1/Q2 Makale Modeli: Farklı İtibar Skorları ($R_i$) ve Anomali Katsayıları altında
                Nash Dengesi Denetim Olasılığı ($p^*$), Dürüst Beklenen Fayda ($E[U_h]$) ve Hile
                Beklenen Faydası ($E[U_c]$) Matrisi.
              </Typography>
            </Box>

            <Paper sx={{ p: 2, minWidth: 280 }} variant="outlined">
              <Typography variant="caption" fontWeight="bold" display="block">
                Varsayılan Hile Kazancı ($G_{fraud}$): {fraudGain} Birim
              </Typography>
              <Slider
                value={fraudGain}
                min={10}
                max={200}
                step={10}
                onChange={(_, val) => setFraudGain(val)}
                onChangeCommitted={(_, val) => loadSimulation(val)}
                color="info"
              />
            </Paper>
          </Stack>

          {loadingSim && <LinearProgress sx={{ mb: 2 }} />}

          {simData && (
            <>
              <Grid container spacing={2} mb={2.5}>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                    <Typography variant="caption" color="text.secondary">
                      Nash Denetim Olasılığı Denklemi
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      p*(R_i, A) = clamp(20/R_i + 0.65·A, 0.02, 1.0)
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                    <Typography variant="caption" color="text.secondary">
                      Dinamik Teminat Fonksiyonu
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      S_req(R_i) = 1000 USDC × (100 / R_i)
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
                    <Typography variant="caption" color="text.secondary">
                      Teşvik Uyumluluk Kısıtı (Deterrence)
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="success.main">
                      E[U_honest] ≥ E[U_cheat] (Nash Caydırıcılığı)
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Divider sx={{ mb: 2 }} />

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>İtibar ($R_i$)</TableCell>
                    <TableCell>Gerekli Teminat ($S_{req}$)</TableCell>
                    <TableCell>Ödül Çarpanı</TableCell>
                    <TableCell>Anomali = 0.00 (Dürüst)</TableCell>
                    <TableCell>Anomali = 0.25 (Düşük)</TableCell>
                    <TableCell>Anomali = 0.50 (Orta)</TableCell>
                    <TableCell>Anomali = 0.75 (Yüksek)</TableCell>
                    <TableCell>Teşvik Uyumluluğu (IC)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {simData.matrix.map((row) => {
                    const s0 = row.scenarios[0];
                    const s1 = row.scenarios[1];
                    const s2 = row.scenarios[2];
                    const s3 = row.scenarios[3];
                    const icAll = row.scenarios.every((s) => s.incentive_compatible);

                    return (
                      <TableRow key={row.reputation_score}>
                        <TableCell>
                          <Chip
                            label={`R_i = ${row.reputation_score}`}
                            color={row.reputation_score >= 100 ? "primary" : "warning"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: "bold" }}>
                          {row.required_stake_usdc} USDC
                        </TableCell>
                        <TableCell>{row.reward_multiplier}x</TableCell>
                        <TableCell>
                          p*=%{(s0.nash_audit_probability * 100).toFixed(0)} | E[U_h]:{" "}
                          {s0.expected_utility_honest} / E[U_c]: {s0.expected_utility_cheat}
                        </TableCell>
                        <TableCell>
                          p*=%{(s1.nash_audit_probability * 100).toFixed(0)} | E[U_c]:{" "}
                          {s1.expected_utility_cheat}
                        </TableCell>
                        <TableCell>
                          p*=%{(s2.nash_audit_probability * 100).toFixed(0)} | E[U_c]:{" "}
                          {s2.expected_utility_cheat}
                        </TableCell>
                        <TableCell>
                          p*=%{(s3.nash_audit_probability * 100).toFixed(0)} | E[U_c]:{" "}
                          {s3.expected_utility_cheat}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={<SecurityIcon />}
                            label={icAll ? "Caydırıcı (IC Sağlandı)" : "Ceza Artırılmalı"}
                            color={icAll ? "success" : "warning"}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
