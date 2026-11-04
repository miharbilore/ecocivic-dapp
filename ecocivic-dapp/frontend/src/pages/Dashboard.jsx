import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import RewardsDashboard from "../components/RewardsDashboard";
import DepositPanel from "../components/DepositPanel";
import PenaltyStatus from "../components/PenaltyStatus";
import { useWallet } from "../context/WalletContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { citizenProfile } = useWallet();

  const waterReadings = citizenProfile?.water_readings || [];
  const recyclings = citizenProfile?.recycling_submissions || [];

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
          <Typography variant="h4" fontWeight="bold">
            Vatandaş Süper-Uygulama Paneli
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sivil İtibar Skorunuzu ($R_i$), Aave DeFi Teminatınızı ve EIP-712 doğrulanmış çevre
            ödüllerinizi tek ekrandan yönetin.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<WaterDropIcon />}
            onClick={() => navigate("/water")}
          >
            Su Sayacı Yükle (AI OCR)
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<QrCodeScannerIcon />}
            onClick={() => navigate("/recycling")}
          >
            Atık Kiosku & QR
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<AdminPanelSettingsIcon />}
            onClick={() => navigate("/admin")}
          >
            Belediye & Oyun Teorisi Portalı
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={3}>
        {/* 1. Citizen Reputation & Game Theory Card */}
        <Grid item xs={12}>
          <RewardsDashboard />
        </Grid>

        {/* 2. DeFi / Aave Escrow Deposit Panel */}
        <Grid item xs={12} md={7}>
          <DepositPanel />
        </Grid>

        {/* 3. Autonomous Audit & Slashing Status */}
        <Grid item xs={12} md={5}>
          <PenaltyStatus />
        </Grid>

        {/* 4. Recent Verified Activity */}
        <Grid item xs={12}>
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Son Doğrulanan Su & Geri Dönüşüm Beyanları
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="secondary.main" gutterBottom>
                    Su Sayacı Okumaları (WaterBilling)
                  </Typography>
                  {waterReadings.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Henüz su sayacı okuması bulunmuyor.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Sayaç</TableCell>
                          <TableCell>Endeks</TableCell>
                          <TableCell>Tüketim / Tasarruf</TableCell>
                          <TableCell>Ödül</TableCell>
                          <TableCell>Durum</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {waterReadings.slice(0, 5).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.meter_no}</TableCell>
                            <TableCell>{r.reading_index} m³</TableCell>
                            <TableCell>
                              {r.consumption_m3} m³ (Tasarruf: {r.saved_m3} m³)
                            </TableCell>
                            <TableCell sx={{ fontWeight: "bold", color: "primary.main" }}>
                              +{r.reward_amount} BELT
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={r.audit_status}
                                color={
                                  r.audit_status === "AUTO_APPROVED" ||
                                  r.audit_status === "APPROVED"
                                    ? "success"
                                    : "warning"
                                }
                                size="small"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" color="primary.main" gutterBottom>
                    Kiosk Geri Dönüşüm Beyanları (RecyclingRewards)
                  </Typography>
                  {recyclings.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Henüz geri dönüşüm beyanı bulunmuyor.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Kiosk</TableCell>
                          <TableCell>Tür</TableCell>
                          <TableCell>Ağırlık</TableCell>
                          <TableCell>Ödül</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {recyclings.slice(0, 5).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{s.kiosk_id}</TableCell>
                            <TableCell sx={{ textTransform: "uppercase" }}>
                              {s.material_type}
                            </TableCell>
                            <TableCell>{s.amount_kg} kg</TableCell>
                            <TableCell sx={{ fontWeight: "bold", color: "primary.main" }}>
                              +{s.reward_amount} BELT
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
