import React, { useRef, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import VirtualCard from "../components/VirtualCard";
import TrustScoreCard from "../components/TrustScoreCard";
import ConvertPointsDialog from "../components/ConvertPointsDialog";
import CardPaymentPanel from "../components/CardPaymentPanel";
import DepositPanel from "../components/DepositPanel";
import PenaltyStatus from "../components/PenaltyStatus";
import { DEMO_ACCOUNTS, useWallet } from "../context/WalletContext";

export default function Dashboard() {
  const { activePersona } = useWallet();
  const [activeTab, setActiveTab] = useState(0);
  const [convertOpen, setConvertOpen] = useState(false);
  const tabsRef = useRef(null);

  const personaName = DEMO_ACCOUNTS[activePersona]?.shortLabel || "Vatandaş";

  const handleFocusPayTab = () => {
    setActiveTab(0);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Box sx={{ maxWidth: 1160, mx: "auto" }}>
      {/* Üst Karşılama Başlığı (Tekrarlayan dev yönlendirme butonları kaldırıldı) */}
      <Stack spacing={0.5} mb={3}>
        <Typography variant="h4" fontWeight={700} letterSpacing={-0.5}>
          Merhaba, {personaName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          EcoCivic sanal kartınızı, çevre ödüllerinizi ve güvence bedelinizi tek ekrandan yönetin.
        </Typography>
      </Stack>

      {/* Üst Bölüm: Yan Yana 2 Şık Kart (Sol: EcoCivic Sanal Kartım | Sağ: Çevre & Güven Puanım) */}
      <Grid container spacing={3} alignItems="stretch" mb={4}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%", borderRadius: 4 }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 }, height: "100%" }}>
              <VirtualCard
                onConvert={() => setConvertOpen(true)}
                onPay={handleFocusPayTab}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box sx={{ height: "100%", "& > .MuiCard-root": { borderRadius: 4 } }}>
            <TrustScoreCard />
          </Box>
        </Grid>
      </Grid>

      {/* Alt Bölüm: 3 Sekmeli Ferah Yapı (MUI Tabs) */}
      <Card ref={tabsRef} sx={{ borderRadius: 4 }}>
        <Box sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)", px: { xs: 1.5, sm: 3 } }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.95rem",
                minHeight: 56,
              },
            }}
          >
            <Tab
              icon={<PointOfSaleOutlinedIcon fontSize="small" />}
              iconPosition="start"
              label="Harcama & Fatura Ödeme (POS)"
            />
            <Tab
              icon={<ShieldOutlinedIcon fontSize="small" />}
              iconPosition="start"
              label="Güvence Bedeli (Teminat & Getiri)"
            />
            <Tab
              icon={<HistoryOutlinedIcon fontSize="small" />}
              iconPosition="start"
              label="İşlem & Denetim Geçmişim"
            />
          </Tabs>
        </Box>

        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          {activeTab === 0 && <CardPaymentPanel />}
          {activeTab === 1 && <DepositPanel />}
          {activeTab === 2 && <PenaltyStatus />}
        </CardContent>
      </Card>

      <ConvertPointsDialog open={convertOpen} onClose={() => setConvertOpen(false)} />
    </Box>
  );
}
