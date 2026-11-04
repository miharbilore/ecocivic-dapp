import React from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import PolicyIcon from "@mui/icons-material/Policy";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useWallet } from "../context/WalletContext";

export default function PenaltyStatus() {
  const { citizenProfile } = useWallet();

  const penalties = citizenProfile?.penalties || [];
  const underInvestigation = Boolean(citizenProfile?.under_investigation);

  return (
    <Card elevation={3} sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PolicyIcon color="warning" />
            <Typography variant="h6" fontWeight="bold">
              Otonom Denetim & Ceza (Slashing) Sicili
            </Typography>
          </Stack>
          <Chip
            icon={underInvestigation ? <WarningAmberIcon /> : <CheckCircleIcon />}
            label={
              underInvestigation
                ? "Zabıta / Fiziksel Teftiş Bekleniyor"
                : "Temiz Sicil / Aktif İhlal Yok"
            }
            color={underInvestigation ? "warning" : "success"}
            size="small"
          />
        </Stack>

        {underInvestigation && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Son beyanınızda AI veya Oyun Teorisi motoru tarafından{" "}
            <strong>AUDIT_REQUIRED</strong> sinyali üretilmiştir. Belediye denetçisi
            onaylayana kadar teminat çekimi kilitlidir.
          </Alert>
        )}

        <Divider sx={{ mb: 2 }} />

        {penalties.length === 0 ? (
          <Box sx={{ py: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Cüzdanınıza ait herhangi bir Slashing (teminat kesintisi) kaydı bulunmamaktadır.
              Dürüst beyanlarınızla İtibar Skorunuzu ($R_i$) yükseltmeye devam edebilirsiniz.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ceza Tipi</TableCell>
                <TableCell>Kesilen Teminat</TableCell>
                <TableCell>İtibar Değişimi ($R_i$)</TableCell>
                <TableCell>Fon Dağılımı (%20 Denetçi / %80 Çevre Fonu)</TableCell>
                <TableCell>Açıklama</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {penalties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Chip label={p.penalty_type} color="error" size="small" />
                  </TableCell>
                  <TableCell sx={{ fontWeight: "bold", color: "error.main" }}>
                    -{Number(p.penalty_amount).toFixed(2)} USDC
                  </TableCell>
                  <TableCell>
                    {p.reputation_before} → {p.reputation_after}
                  </TableCell>
                  <TableCell>
                    Denetçi: {Number(p.inspector_reward).toFixed(1)} USDC | Belediye:{" "}
                    {Number(p.treasury_share).toFixed(1)} USDC
                  </TableCell>
                  <TableCell>{p.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
