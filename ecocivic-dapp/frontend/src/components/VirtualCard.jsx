import React, { useState } from "react";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ContactlessOutlinedIcon from "@mui/icons-material/ContactlessOutlined";
import { DEMO_ACCOUNTS, useWallet } from "../context/WalletContext";

const toDots = (pan = "") => pan.replace(/\*/g, "•");

/** Banka kartı üzerindeki EMV çipi */
function CardChip() {
  return (
    <Box
      sx={{
        width: 42,
        height: 32,
        borderRadius: "6px",
        background: "linear-gradient(135deg, #e9d18a 0%, #b8954a 50%, #f1dc9b 100%)",
        position: "relative",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
        "&::before, &::after": {
          content: '""',
          position: "absolute",
          left: 6,
          right: 6,
          height: "1px",
          bgcolor: "rgba(0,0,0,0.25)",
        },
        "&::before": { top: 11 },
        "&::after": { bottom: 11 },
      }}
    />
  );
}

/**
 * EcoCivic Sanal Kartım — gerçek banka kartı görünümü.
 */
export default function VirtualCard({ onConvert, onPay }) {
  const { citizenProfile, activePersona } = useWallet();
  const [reveal, setReveal] = useState(false);

  const vCard = citizenProfile?.virtual_card || {};
  const balance = Number(citizenProfile?.card_balance_try ?? vCard.card_balance_try ?? 0);
  const holder = DEMO_ACCOUNTS[activePersona]?.shortLabel?.toUpperCase() || "ECOCIVIC KART SAHİBİ";
  const panFull = vCard.card_number_full || "9792 8420 5193 4821";
  const panMasked = toDots(vCard.card_number_masked || "9792 **** **** 4821");

  return (
    <Stack spacing={2} sx={{ height: "100%" }}>
      <Box
        sx={{
          position: "relative",
          aspectRatio: "1.586 / 1",
          maxHeight: 260,
          width: "100%",
          borderRadius: "20px",
          p: { xs: 2.5, sm: 3 },
          color: "#fff",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(120% 140% at 0% 0%, #1f6f54 0%, #0f3d30 45%, #121a1f 100%)",
          boxShadow: "0 20px 40px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
          "&::after": {
            content: '""',
            position: "absolute",
            width: 320,
            height: 320,
            right: -120,
            top: -140,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(52,199,89,0.22) 0%, rgba(52,199,89,0) 70%)",
          },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ zIndex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} letterSpacing={0.3}>
            EcoCivic
          </Typography>
          <Tooltip title={reveal ? "Kart bilgilerini gizle" : "Kart bilgilerini göster"}>
            <IconButton size="small" onClick={() => setReveal((v) => !v)} sx={{ color: "rgba(255,255,255,0.8)" }}>
              {reveal ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ zIndex: 1 }}>
          <CardChip />
          <ContactlessOutlinedIcon sx={{ opacity: 0.7 }} />
        </Stack>

        <Box sx={{ zIndex: 1 }}>
          <Typography
            sx={{
              fontFamily: '"SF Mono", "Roboto Mono", monospace',
              fontSize: { xs: "1.05rem", sm: "1.25rem" },
              letterSpacing: 2,
              mb: 1.5,
            }}
          >
            {reveal ? panFull : panMasked}
          </Typography>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
            <Box>
              <Typography variant="caption" sx={{ opacity: 0.6, fontSize: 10, letterSpacing: 1 }}>
                KART SAHİBİ
              </Typography>
              <Typography variant="body2" fontWeight={600} letterSpacing={0.5}>
                {holder}
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="flex-end">
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.6, fontSize: 10, letterSpacing: 1 }}>
                  SKT
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {vCard.expiry_date || "08/29"}
                </Typography>
              </Box>
              {reveal && (
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.6, fontSize: 10, letterSpacing: 1 }}>
                    CVV
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {vCard.cvv || "642"}
                  </Typography>
                </Box>
              )}
              <Typography fontWeight={800} fontStyle="italic" letterSpacing={0.5} sx={{ opacity: 0.9 }}>
                troy
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Box>

      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Kart Bakiyesi
          </Typography>
          <Typography variant="h4" fontWeight={700} letterSpacing={-0.5}>
            ₺{balance.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            disableElevation
            startIcon={<SwapHorizIcon />}
            onClick={onConvert}
            sx={{ borderRadius: 999, textTransform: "none", fontWeight: 600 }}
          >
            Puanları TL'ye Çevir
          </Button>
          <Button
            variant="outlined"
            startIcon={<ReceiptLongOutlinedIcon />}
            onClick={onPay}
            sx={{ borderRadius: 999, textTransform: "none", fontWeight: 600 }}
          >
            Fatura Öde
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
