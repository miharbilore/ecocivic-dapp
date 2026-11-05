import React, { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { BASE_GUARANTEE_USDC, useWallet } from "../context/WalletContext";

const trustLevel = (rep) => {
  if (rep >= 200) return { label: "Güvenilir Vatandaş · Düşük Denetim Riski", color: "success" };
  if (rep >= 100) return { label: "Standart Profil", color: "info" };
  return { label: "İncelemede · Yüksek Denetim Riski", color: "warning" };
};

function Metric({ label, value, hint }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700} lineHeight={1.3}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Çevre & Güven Puanım — vatandaş dostu özet kartı.
 * Akademik formüller yalnızca (i) ikonuna tıklandığında açılır.
 */
export default function TrustScoreCard({ compact = false }) {
  const { beltBalance, citizenProfile } = useWallet();
  const [showFormulas, setShowFormulas] = useState(false);

  const rep = citizenProfile?.reputation_score ?? 100;
  const gt = citizenProfile?.game_theory_profile || {};
  const requiredStake = gt.required_stake_usdc ?? BASE_GUARANTEE_USDC;
  const multiplier = gt.reward_multiplier ?? 1;
  const auditPct = (gt.baseline_audit_probability ?? 0.2) * 100;
  const discountPct = Math.round((1 - requiredStake / BASE_GUARANTEE_USDC) * 100);
  const level = trustLevel(rep);

  const advantageText =
    discountPct > 0
      ? `%${discountPct} İndirimli Güvence Bedeli`
      : discountPct < 0
      ? `Güvence Bedeli %${Math.abs(discountPct)} Artırıldı`
      : "Standart Güvence Bedeli";

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 }, "&:last-child": { pb: { xs: 2.5, sm: 3 } } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="subtitle1" fontWeight={700}>
            Çevre & Güven Puanım
          </Typography>
          <Tooltip title={showFormulas ? "Akademik formülleri gizle" : "Akademik formülleri göster"}>
            <IconButton
              size="small"
              onClick={() => setShowFormulas((v) => !v)}
              color={showFormulas ? "primary" : "default"}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={3} alignItems="flex-end" mb={2.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Puan Bakiyesi
            </Typography>
            <Typography variant="h3" fontWeight={700} letterSpacing={-1} lineHeight={1.1}>
              {Number(beltBalance || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
              <Typography component="span" variant="subtitle1" color="text.secondary" ml={0.75}>
                BELT
              </Typography>
            </Typography>
          </Box>
        </Stack>

        <Box mb={2.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.75}>
            <Typography variant="body2" fontWeight={600}>
              Güven Puanı
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <Box component="span" sx={{ color: "text.primary", fontWeight: 700 }}>
                {rep}
              </Box>{" "}
              / 1000
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(2, rep / 10))}
            color={level.color}
            sx={{ height: 8, borderRadius: 999, bgcolor: "rgba(255,255,255,0.06)" }}
          />
          <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
            <Chip label={level.label} color={level.color} size="small" variant="outlined" />
            <Chip label={advantageText} size="small" color={discountPct > 0 ? "success" : "default"} />
          </Stack>
        </Box>

        {!compact && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" spacing={2}>
              <Metric label="Gerekli Güvence Bedeli" value={`${requiredStake.toFixed(0)} USDC`} />
              <Metric label="Rutin Kontrol Sıklığı" value={`%${auditPct.toFixed(0)}`} />
              <Metric label="Ödül Çarpanı" value={`${multiplier.toFixed(2)}x`} />
            </Stack>
          </>
        )}

        <Collapse in={showFormulas} unmountOnExit>
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.03)",
              border: "1px dashed rgba(255,255,255,0.12)",
              fontFamily: '"SF Mono", "Roboto Mono", monospace',
              fontSize: 12.5,
              lineHeight: 1.9,
              color: "text.secondary",
            }}
          >
            <Typography variant="overline" color="primary">
              Akademik Model (Oyun Teorisi)
            </Typography>
            <div>Güven Puanı Rᵢ ∈ [0, 1000] · dürüst beyan +5 · hile ×0.5</div>
            <div>
              Güvence Bedeli S<sub>req</sub> = {BASE_GUARANTEE_USDC} × 100 / max(Rᵢ, 25) ={" "}
              {requiredStake.toFixed(2)} USDC
            </div>
            <div>
              Kontrol Olasılığı p* = 0.2 × 100 / Rᵢ = {(auditPct / 100).toFixed(4)}
            </div>
            <div>Ödül Çarpanı μ(Rᵢ) = {multiplier.toFixed(4)}x</div>
            <div>Denge koşulu: E[U<sub>dürüst</sub>] ≥ E[U<sub>hile</sub>]</div>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
