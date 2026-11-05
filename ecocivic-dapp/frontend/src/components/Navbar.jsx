import React from "react";
import { AppBar, Box, Button, Stack, Toolbar, Typography } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import EcoIcon from "@mui/icons-material/Spa";
import WalletConnect from "./WalletConnect";

const NAV_ITEMS = [
  { label: "Panelim", path: "/dashboard" },
  { label: "Su Beyanı", path: "/water" },
  { label: "Atık Kiosku", path: "/recycling" },
  { label: "Belediye Denetim", path: "/admin" },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: "rgba(14, 17, 22, 0.82)",
        backdropFilter: "saturate(180%) blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, md: 60 }, gap: 2 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          component={RouterLink}
          to="/"
          sx={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}
        >
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: "9px",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, #34c759 0%, #0a7d4f 100%)",
            }}
          >
            <EcoIcon sx={{ fontSize: 18, color: "#fff" }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={700} letterSpacing={-0.2}>
            EcoCivic
          </Typography>
        </Stack>

        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            ml: 2,
            flexGrow: 1,
            overflowX: "auto",
            whiteSpace: "nowrap",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Button
                key={item.path}
                component={RouterLink}
                to={item.path}
                size="small"
                sx={{
                  px: 1.5,
                  borderRadius: 999,
                  textTransform: "none",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#fff" : "text.secondary",
                  bgcolor: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#fff" },
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Box>

        <WalletConnect />
      </Toolbar>
    </AppBar>
  );
}
