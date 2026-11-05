import React from "react";
import { Box, Grid, Typography } from "@mui/material";
import RecyclingQR from "../components/RecyclingQR";
import RewardsDashboard from "../components/RewardsDashboard";

export default function Recycling() {
  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Sıfır Atık Beyanı & Raspberry Pi Kiosk Simülatörü
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Geri dönüşüm QR kodunuzu oluşturun, Akıllı Kiosk üzerinde tartım doğrulamasını
          tamamlayın, termal fişinizi alın ve çevre puanı ödülünüzü anında cüzdanınıza ekleyin.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <RecyclingQR />
        </Grid>
        <Grid item xs={12}>
          <RewardsDashboard />
        </Grid>
      </Grid>
    </Box>
  );
}
