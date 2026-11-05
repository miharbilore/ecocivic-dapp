import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import { useWallet } from "../context/WalletContext";
import {
  depositCollateralOnChain,
  withdrawCollateralOnChain,
} from "../services/contractService";

const YEARLY_YIELD_PCT = 4.85;

function StatBox({ label, value, sub, color }) {
  return (
    <Box sx={{ p: 2, borderRadius: 3, bgcolor: "rgba(255,255,255,0.03)", height: "100%" }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} color={color} letterSpacing={-0.3}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Güvence Bedeli — vatandaşın iade edilebilir teminatı ve getirisi.
 */
export default function DepositPanel() {
  const { signer, isDemoMode, citizenProfile, updateLocalDeposit } = useWallet();
  const [amount, setAmount] = useState("250");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const currentDeposit = citizenProfile?.deposit_amount_usdc ?? 0;
  const requiredStake = citizenProfile?.game_theory_profile?.required_stake_usdc ?? 1000.0;
  const isSufficient = currentDeposit >= requiredStake;
  const isLocked = Boolean(citizenProfile?.under_investigation);
  const yearlyYield = (currentDeposit * YEARLY_YIELD_PCT) / 100;

  const run = async (direction) => {
    const val = Number(amount);
    if (!val || val <= 0) {
      setFeedback({ severity: "error", text: "Lütfen geçerli bir tutar girin." });
      return;
    }
    if (direction === "withdraw") {
      if (isLocked) {
        setFeedback({ severity: "error", text: "Hesabınız incelemede olduğu için şu an çekim yapılamaz." });
        return;
      }
      if (val > currentDeposit) {
        setFeedback({ severity: "error", text: "Çekmek istediğiniz tutar güvence bakiyenizden fazla." });
        return;
      }
    }

    setLoading(true);
    setFeedback(null);
    try {
      if (direction === "deposit") {
        await depositCollateralOnChain(signer, isDemoMode, val);
        updateLocalDeposit(val);
        setFeedback({ severity: "success", text: `${val.toFixed(2)} USDC güvence bedeli yatırıldı.` });
      } else {
        await withdrawCollateralOnChain(signer, isDemoMode, val);
        updateLocalDeposit(-val);
        setFeedback({ severity: "success", text: `${val.toFixed(2)} USDC hesabınıza iade edildi.` });
      }
    } catch (err) {
      setFeedback({ severity: "error", text: err.message || "İşlem tamamlanamadı." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2.5}>
        <Typography variant="body2" color="text.secondary">
          Güvence bedeliniz size aittir; dilediğiniz zaman çekebilir, bu sürede getiri kazanırsınız.
        </Typography>
        <Chip
          icon={isLocked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />}
          label={isLocked ? "İnceleme sürüyor" : "Çekime açık"}
          color={isLocked ? "warning" : "success"}
          variant="outlined"
          size="small"
        />
      </Stack>

      <Grid container spacing={1.5} mb={3}>
        <Grid item xs={12} sm={4}>
          <StatBox
            label="Yatırdığınız Güvence"
            value={`${currentDeposit.toFixed(2)} USDC`}
            sub={isSufficient ? "Yeterli" : "Eksik"}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatBox
            label="Gerekli Güvence Bedeli"
            value={`${requiredStake.toFixed(2)} USDC`}
            sub="Güven puanınız arttıkça düşer"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatBox
            label={`Tahmini Yıllık Getiri (%${YEARLY_YIELD_PCT})`}
            value={`+${yearlyYield.toFixed(2)} USDC`}
            color="success.main"
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <TextField
          label="Tutar"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          sx={{ maxWidth: { sm: 200 } }}
          InputProps={{ endAdornment: <InputAdornment position="end">USDC</InputAdornment> }}
        />
        <Button
          variant="contained"
          disableElevation
          onClick={() => run("deposit")}
          disabled={loading}
          sx={{ borderRadius: 999, textTransform: "none", fontWeight: 600, px: 3, py: 1.25 }}
        >
          Yatır
        </Button>
        <Button
          variant="outlined"
          onClick={() => run("withdraw")}
          disabled={loading || isLocked}
          sx={{ borderRadius: 999, textTransform: "none", fontWeight: 600, px: 3, py: 1.25 }}
        >
          Çek
        </Button>
      </Stack>

      {feedback && (
        <Alert severity={feedback.severity} sx={{ mt: 2.5, borderRadius: 2 }}>
          {feedback.text}
        </Alert>
      )}
    </Box>
  );
}
