import React from "react";
import {
  Alert,
  Box,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useWallet } from "../context/WalletContext";

const STATUS_LABELS = {
  AUTO_APPROVED: { label: "Onaylandı", color: "success" },
  APPROVED: { label: "Onaylandı", color: "success" },
  AUDIT_REQUIRED: { label: "Kontrolde", color: "warning" },
  SLASHED: { label: "Reddedildi", color: "error" },
};

function SectionTitle({ children }) {
  return (
    <Typography variant="subtitle2" color="text.secondary" mb={1}>
      {children}
    </Typography>
  );
}

/**
 * İşlem & Denetim Geçmişim — su beyanları, atık teslimleri ve varsa cezalar.
 */
export default function PenaltyStatus() {
  const { citizenProfile } = useWallet();

  const penalties = citizenProfile?.penalties || [];
  const waterReadings = citizenProfile?.water_readings || [];
  const recyclings = citizenProfile?.recycling_submissions || [];
  const underInvestigation = Boolean(citizenProfile?.under_investigation);

  return (
    <Box>
      {underInvestigation ? (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 3, borderRadius: 2 }}>
          Son beyanınız belediye tarafından kontrol ediliyor. Sonuçlanana kadar güvence bedeli çekimi geçici olarak kapalıdır.
        </Alert>
      ) : (
        <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 3, borderRadius: 2 }}>
          Temiz sicil — aktif bir inceleme veya ceza bulunmuyor.
        </Alert>
      )}

      <Grid container spacing={4}>
        <Grid item xs={12} md={6}>
          <SectionTitle>Su Beyanlarım</SectionTitle>
          {waterReadings.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              Henüz su beyanı yok.
            </Typography>
          ) : (
            <List disablePadding>
              {waterReadings.slice(0, 6).map((r) => {
                const st = STATUS_LABELS[r.audit_status] || { label: r.audit_status, color: "default" };
                return (
                  <ListItem key={r.id} disableGutters divider sx={{ py: 1 }}>
                    <ListItemText
                      primary={`${r.reading_index} m³ · ${r.consumption_m3} m³ tüketim`}
                      secondary={`Sayaç ${r.meter_no}`}
                      primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                    <Stack alignItems="flex-end" spacing={0.5}>
                      <Typography variant="body2" fontWeight={700} color="success.main">
                        +{Number(r.reward_amount || 0).toFixed(1)} puan
                      </Typography>
                      <Chip label={st.label} color={st.color} size="small" variant="outlined" />
                    </Stack>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionTitle>Atık Teslimlerim</SectionTitle>
          {recyclings.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              Henüz atık teslimi yok.
            </Typography>
          ) : (
            <List disablePadding>
              {recyclings.slice(0, 6).map((s) => (
                <ListItem key={s.id} disableGutters divider sx={{ py: 1 }}>
                  <ListItemText
                    primary={`${String(s.material_type).toUpperCase()} · ${s.amount_kg} kg`}
                    secondary={s.kiosk_id}
                    primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                  <Typography variant="body2" fontWeight={700} color="success.main">
                    +{Number(s.reward_amount || 0).toFixed(1)} puan
                  </Typography>
                </ListItem>
              ))}
            </List>
          )}
        </Grid>

        {penalties.length > 0 && (
          <Grid item xs={12}>
            <SectionTitle>Cezalar</SectionTitle>
            <List disablePadding>
              {penalties.map((p) => (
                <ListItem key={p.id} disableGutters divider sx={{ py: 1 }}>
                  <ListItemText
                    primary={p.description || "Belediye denetim cezası"}
                    secondary={`Güven puanı ${p.reputation_before} → ${p.reputation_after}`}
                    primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                  <Typography variant="body2" fontWeight={700} color="error.main">
                    −{Number(p.penalty_amount).toFixed(2)} USDC
                  </Typography>
                </ListItem>
              ))}
            </List>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
