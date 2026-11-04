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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { useWallet } from "../context/WalletContext";
import {
  depositCollateralOnChain,
  withdrawCollateralOnChain,
} from "../services/contractService";

export default function DepositPanel() {
  const { signer, isDemoMode, citizenProfile, updateLocalDeposit } = useWallet();
  const [amount, setAmount] = useState("250");
  const [loading, setLoading] = useState(false);
  const [txMessage, setTxMessage] = useState(null);
  const [error, setError] = useState(null);

  const currentDeposit = citizenProfile?.deposit_amount_usdc ?? 1000.0;
  const requiredStake =
    citizenProfile?.game_theory_profile?.required_stake_usdc ?? 1000.0;
  const isSufficient = currentDeposit >= requiredStake;
  const isLocked = Boolean(citizenProfile?.under_investigation);

  // Simulated Aave v3 USDC Lending Pool Yield (4.85% APY)
  const aaveApy = 4.85;
  const estimatedAnnualYield = ((currentDeposit * aaveApy) / 100).toFixed(2);

  const handleDeposit = async () => {
    const val = Number(amount);
    if (!val || val <= 0) {
      setError("Lütfen 0'dan büyük bir USDC tutarı girin.");
      return;
    }
    setLoading(true);
    setError(null);
    setTxMessage(null);

    try {
      const receipt = await depositCollateralOnChain(signer, isDemoMode, val);
      updateLocalDeposit(val);
      setTxMessage(
        `${val.toFixed(2)} USDC Aave Likidite Havuzuna yatırıldı. Tx: ${receipt.hash.slice(
          0,
          14
        )}...`
      );
    } catch (err) {
      setError(err.message || "Teminat yatırma işlemi başarısız oldu.");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const val = Number(amount);
    if (!val || val <= 0) {
      setError("Lütfen geçerli bir çekim tutarı girin.");
      return;
    }
    if (isLocked) {
      setError(
        "Hesabınızda aktif bir anomali/teftiş kilidi (hasActivePenaltyLock) bulunduğu için teminat çekilemez."
      );
      return;
    }
    if (val > currentDeposit) {
      setError("Çekmek istediğiniz tutar mevcut teminat bakiyenizden fazla.");
      return;
    }

    setLoading(true);
    setError(null);
    setTxMessage(null);

    try {
      const receipt = await withdrawCollateralOnChain(signer, isDemoMode, val);
      updateLocalDeposit(-val);
      setTxMessage(
        `${val.toFixed(2)} USDC teminat cüzdanınıza iade edildi (withdrawCitizenDeposit). Tx: ${receipt.hash.slice(
          0,
          14
        )}...`
      );
    } catch (err) {
      setError(err.message || "Teminat çekme işlemi başarısız oldu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card elevation={3} sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AccountBalanceIcon color="secondary" />
            <Typography variant="h6" fontWeight="bold">
              DeFi Escrow & Aave v3 Teminat Havuzu
            </Typography>
          </Stack>
          <Chip
            icon={isLocked ? <LockIcon /> : <LockOpenIcon />}
            label={isLocked ? "Teftiş Kilidi Aktif" : "Çekime Açık"}
            color={isLocked ? "error" : "success"}
            size="small"
          />
        </Stack>

        <Grid container spacing={2} mb={2}>
          <Grid item xs={12} sm={4}>
            <Box sx={{ p: 1.5, bgcolor: "background.default", borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Yatırılan Teminat (userDeposits)
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="secondary.main">
                {currentDeposit.toFixed(2)} USDC
              </Typography>
              <Chip
                label={isSufficient ? "Teminat Yeterli" : "Teminat Eksik"}
                color={isSufficient ? "success" : "warning"}
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box sx={{ p: 1.5, bgcolor: "background.default", borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Gerekli Min. Teminat (R_i Bazlı)
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {requiredStake.toFixed(2)} USDC
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Dürüst beyanla R_i arttıkça düşer
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box sx={{ p: 1.5, bgcolor: "background.default", borderRadius: 1.5 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <TrendingUpIcon color="success" fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Aave Lending APY (%{aaveApy})
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight="bold" color="success.main">
                +{estimatedAnnualYield} USDC/yıl
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Atıl kalmayan verimli teminat
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
          <TextField
            label="Tutar (USDC)"
            type="number"
            size="small"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ minWidth: 160 }}
          />
          <Button
            variant="contained"
            color="secondary"
            onClick={handleDeposit}
            disabled={loading}
          >
            Teminat Yatır (Aave Deposit)
          </Button>
          <Button
            variant="outlined"
            color="warning"
            onClick={handleWithdraw}
            disabled={loading || isLocked}
          >
            Teminat Çek (withdrawCitizenDeposit)
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {txMessage && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {txMessage}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
