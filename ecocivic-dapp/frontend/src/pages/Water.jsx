import React from "react";
import { Box, Grid, Typography } from "@mui/material";
import WaterMeterUpload from "../components/WaterMeterUpload";
import RewardsDashboard from "../components/RewardsDashboard";

export default function Water() {
  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Akıllı Su Yönetimi & AI Oracle Doğrulama
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Su sayacınızın fotoğrafını yükleyin; 2D FFT Anti-Spoofing, OpenCV CLAHE OCR ve
          Tüketim Deltası ($\Delta$) analizinden geçerek geçmiş ortalamanıza göre su tasarruf
          bonusunuzu EIP-712 imzasıyla anında kazanın.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <WaterMeterUpload />
        </Grid>
        <Grid item xs={12}>
          <RewardsDashboard />
        </Grid>
      </Grid>
    </Box>
  );
}
