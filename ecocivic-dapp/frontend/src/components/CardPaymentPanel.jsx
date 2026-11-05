import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import DirectionsBusOutlinedIcon from "@mui/icons-material/DirectionsBusOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useWallet } from "../context/WalletContext";

const PAYMENT_OPTIONS = [
  {
    key: "water",
    mcc: "9399",
    title: "Su Faturası",
    subtitle: "Tüm belediyelerin online veznesi",
    merchant: "Belediye Online Su Veznesi",
    amount: 120,
    icon: <WaterDropOutlinedIcon />,
    color: "#0a84ff",
  },
  {
    key: "transit",
    mcc: "4111",
    title: "Ulaşım",
    subtitle: "Metro / otobüs temassız",
    merchant: "Toplu Ulaşım Temassız Ödeme",
    amount: 45,
    icon: <DirectionsBusOutlinedIcon />,
    color: "#ff9f0a",
  },
  {
    key: "market",
    mcc: "5411",
    title: "Yerel Market",
    subtitle: "Halk market & kooperatif",
    merchant: "Belediye Halk Market",
    amount: 85,
    icon: <StorefrontOutlinedIcon />,
    color: "#30d158",
  },
];

const formatTry = (v) =>
  `₺${Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Harcama & Fatura Ödeme — sanal kartla tek dokunuşla ödeme.
 */
export default function CardPaymentPanel() {
  const { citizenProfile, spendVirtualCard } = useWallet();
  const [selected, setSelected] = useState(PAYMENT_OPTIONS[0]);
  const [amount, setAmount] = useState(String(PAYMENT_OPTIONS[0].amount));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const transactions = citizenProfile?.virtual_card?.transactions || [];

  const choose = (opt) => {
    setSelected(opt);
    setAmount(String(opt.amount));
    setFeedback(null);
  };

  const pay = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await spendVirtualCard({
        amountTry: Number(amount),
        mccCode: selected.mcc,
        merchantName: selected.merchant,
      });
      setFeedback({
        severity: "success",
        text: `${selected.title} ödemesi onaylandı · ${formatTry(amount)} · Onay kodu ${res.auth_code}`,
      });
    } catch (err) {
      setFeedback({ severity: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Grid container spacing={4}>
      <Grid item xs={12} md={7}>
        <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
          Ne ödemek istiyorsunuz?
        </Typography>
        <Grid container spacing={1.5} mb={3}>
          {PAYMENT_OPTIONS.map((opt) => {
            const active = selected.key === opt.key;
            return (
              <Grid item xs={12} sm={4} key={opt.key}>
                <Box
                  onClick={() => choose(opt)}
                  sx={{
                    cursor: "pointer",
                    p: 2,
                    borderRadius: 3,
                    border: "1.5px solid",
                    borderColor: active ? opt.color : "rgba(255,255,255,0.08)",
                    bgcolor: active ? `${opt.color}14` : "rgba(255,255,255,0.02)",
                    transition: "all .15s ease",
                    "&:hover": { borderColor: opt.color },
                  }}
                >
                  <Box sx={{ color: opt.color, mb: 1 }}>{opt.icon}</Box>
                  <Typography variant="body2" fontWeight={700}>
                    {opt.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {opt.subtitle}
                  </Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
          <TextField
            label="Tutar"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ maxWidth: { sm: 180 } }}
            InputProps={{ startAdornment: <InputAdornment position="start">₺</InputAdornment> }}
          />
          <Button
            variant="contained"
            size="large"
            disableElevation
            disabled={busy || Number(amount) <= 0}
            onClick={pay}
            sx={{ borderRadius: 999, textTransform: "none", fontWeight: 600, px: 4, py: 1.5 }}
          >
            {busy ? "Ödeniyor…" : `${formatTry(amount)} Öde`}
          </Button>
        </Stack>

        {feedback && (
          <Alert severity={feedback.severity} sx={{ mt: 2.5, borderRadius: 2 }}>
            {feedback.text}
          </Alert>
        )}
      </Grid>

      <Grid item xs={12} md={5}>
        <Typography variant="subtitle2" color="text.secondary" mb={1}>
          Son Kart Hareketleri
        </Typography>
        {transactions.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
            Henüz kart hareketi yok.
          </Typography>
        ) : (
          <List disablePadding>
            {transactions.slice(0, 6).map((tx) => {
              const isLoad = tx.tx_type === "CONVERT_LOAD";
              const opt = PAYMENT_OPTIONS.find((o) => o.mcc === tx.mcc_code);
              return (
                <ListItem key={tx.id} disableGutters sx={{ py: 0.75 }}>
                  <ListItemAvatar sx={{ minWidth: 48 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: isLoad ? "rgba(48,209,88,0.15)" : `${opt?.color || "#888"}22`,
                        color: isLoad ? "#30d158" : opt?.color || "text.secondary",
                      }}
                    >
                      {isLoad ? <SwapHorizIcon fontSize="small" /> : opt?.icon || <StorefrontOutlinedIcon fontSize="small" />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={isLoad ? "Puan → TL Yükleme" : opt?.title || tx.merchant_name}
                    secondary={tx.auth_code}
                    primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                  <Typography variant="body2" fontWeight={700} color={isLoad ? "success.main" : "text.primary"}>
                    {isLoad ? "+" : "−"}
                    {formatTry(tx.amount_try)}
                  </Typography>
                </ListItem>
              );
            })}
          </List>
        )}
      </Grid>
    </Grid>
  );
}
