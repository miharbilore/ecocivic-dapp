import React from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import ParkIcon from "@mui/icons-material/Park";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import GavelIcon from "@mui/icons-material/Gavel";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";

export default function Home() {
  const navigate = useNavigate();

  return (
    <Box>
      <Box sx={{ textAlign: "center", mb: 6, mt: 2 }}>
        <Chip
          label="TÜBİTAK 2209-B | Oyun Teorisi & Yapay Zeka Destekli Otonom Denetim"
          color="primary"
          variant="outlined"
          sx={{ mb: 2, fontWeight: "bold" }}
        />
        <Typography
          variant="h2"
          component="h1"
          gutterBottom
          sx={{
            fontWeight: "bold",
            background: "linear-gradient(45deg, #4caf50 25%, #2196f3 85%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Akıllı Şehirlerde Hibrit Güven Modeli
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{ maxWidth: 820, mx: "auto", mb: 3 }}
        >
          Sivil İtibar Skoru ($R_i$), 2D FFT Anti-Spoofing OCR, EIP-712 Kriptografik AI Oracle,
          Aave DeFi Escrow Teminatı ve 2x2 Nash Dengesi Denetim Oyunu ile sıfır suistimalli
          belediye ekosistemi.
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center">
          <Button
            variant="contained"
            size="large"
            color="primary"
            onClick={() => navigate("/dashboard")}
          >
            Vatandaş Süper-Uygulamasına Gir
          </Button>
          <Button
            variant="outlined"
            size="large"
            color="secondary"
            onClick={() => navigate("/admin")}
          >
            B2G Belediye & Oyun Teorisi Portalı
          </Button>
        </Stack>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Paper
            sx={{ p: 3, height: "100%", textAlign: "center", cursor: "pointer" }}
            elevation={3}
            onClick={() => navigate("/water")}
          >
            <WaterDropIcon sx={{ fontSize: 52, color: "#2196f3", mb: 1.5 }} />
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              AI Su Sayacı & Tasarruf
            </Typography>
            <Typography variant="body2" color="text.secondary">
              2D FFT Anti-Spoofing, OpenCV CLAHE OCR ve $\Delta$ tüketim analiziyle su tasarruf
              bonusunuzu EIP-712 imzasıyla kazanın.
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper
            sx={{ p: 3, height: "100%", textAlign: "center", cursor: "pointer" }}
            elevation={3}
            onClick={() => navigate("/recycling")}
          >
            <ParkIcon sx={{ fontSize: 52, color: "#4caf50", mb: 1.5 }} />
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Raspberry Pi Atık Kiosku
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Kriptografik QR kodunuzu Kioskta okutun, Load-Cell ağırlık doğrulaması ve ESC/POS
              termal fiş ile anında BELT token basın.
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper
            sx={{ p: 3, height: "100%", textAlign: "center", cursor: "pointer" }}
            elevation={3}
            onClick={() => navigate("/dashboard")}
          >
            <AccountBalanceIcon sx={{ fontSize: 52, color: "#ab47bc", mb: 1.5 }} />
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Sivil İtibar ($R_i$) & DeFi
            </Typography>
            <Typography variant="body2" color="text.secondary">
              İtibar skorunuz yükseldikçe ödül çarpanınız artsın, yatırmanız gereken Aave USDC
              minimum teminat şartınız düşsün.
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper
            sx={{ p: 3, height: "100%", textAlign: "center", cursor: "pointer" }}
            elevation={3}
            onClick={() => navigate("/admin")}
          >
            <GavelIcon sx={{ fontSize: 52, color: "#ffa726", mb: 1.5 }} />
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Oyun Teorisi & Slashing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              2x2 Karma Stratejili Denetim Oyunu ile şüpheli beyanları yakalayın; cezaların %20&apos;si
              denetçiye, %80&apos;i Çevre Fonuna aktarılsın.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
