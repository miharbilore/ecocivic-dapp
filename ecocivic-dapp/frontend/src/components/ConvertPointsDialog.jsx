import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { BELT_TO_TRY_RATE, useWallet } from "../context/WalletContext";

/**
 * Puanları TL'ye Çevir — BELT puanlarını yakıp sanal kart bakiyesine yükler.
 */
export default function ConvertPointsDialog({ open, onClose }) {
  const { beltBalance, convertBeltToCard } = useWallet();
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (open) {
      setFeedback(null);
      setAmount(String(Math.min(50, Math.floor(Number(beltBalance || 0)))));
    }
  }, [open, beltBalance]);

  const tryValue = Number(amount || 0) * BELT_TO_TRY_RATE;

  const handleConvert = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await convertBeltToCard(Number(amount));
      setFeedback({
        severity: "success",
        text: `Kartınıza ₺${Number(res.fiat_added_try).toFixed(2)} yüklendi.`,
      });
    } catch (err) {
      setFeedback({ severity: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4 } }}>
      <DialogTitle fontWeight={700}>Puanları TL'ye Çevir</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2.5}>
          1 puan = ₺{BELT_TO_TRY_RATE.toFixed(2)} · Mevcut: {Number(beltBalance || 0).toFixed(2)} puan
        </Typography>
        <TextField
          autoFocus
          fullWidth
          type="number"
          label="Çevrilecek puan"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputProps={{ min: 1 }}
          InputProps={{ endAdornment: <InputAdornment position="end">BELT</InputAdornment> }}
        />
        <Stack direction="row" spacing={1} mt={1.5}>
          {[25, 50, 100].map((v) => (
            <Button key={v} size="small" variant="outlined" onClick={() => setAmount(String(v))} sx={{ borderRadius: 999 }}>
              {v}
            </Button>
          ))}
          <Button
            size="small"
            variant="outlined"
            onClick={() => setAmount(String(Math.floor(Number(beltBalance || 0))))}
            sx={{ borderRadius: 999 }}
          >
            Tümü
          </Button>
        </Stack>
        <Typography variant="h5" fontWeight={700} mt={3} textAlign="center">
          +₺{tryValue.toFixed(2)}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
          kart bakiyenize eklenecek
        </Typography>
        {feedback && (
          <Alert severity={feedback.severity} sx={{ mt: 2 }}>
            {feedback.text}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Kapat
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={handleConvert}
          disabled={busy || Number(amount) <= 0}
          sx={{ borderRadius: 999, textTransform: "none", fontWeight: 600, px: 3 }}
        >
          {busy ? "Yükleniyor…" : "Çevir ve Yükle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
