import React from "react";
import { AppBar, Box, Button, Stack, Toolbar, Typography } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import RecyclingIcon from "@mui/icons-material/Recycling";
import WalletConnect from "./WalletConnect";

const NAV_ITEMS = [
  { label: "Ana Sayfa", path: "/" },
  { label: "Vatandaş Paneli", path: "/dashboard" },
  { label: "Su Yönetimi (AI OCR)", path: "/water" },
  { label: "Atık Kiosku (QR/Fiş)", path: "/recycling" },
  { label: "Belediye & Oyun Teorisi", path: "/admin" },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <AppBar position="sticky" color="default" elevation={2}>
      <Toolbar sx={{ flexWrap: "wrap", justifyContent: "space-between", gap: 1, py: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <RecyclingIcon sx={{ color: "primary.main", fontSize: 30 }} />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{
              fontWeight: "bold",
              textDecoration: "none",
              color: "inherit",
              mr: 2,
            }}
          >
            EcoCivic Hybrid-Trust
          </Typography>

          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Button
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  color={isActive ? "primary" : "inherit"}
                  variant={isActive ? "outlined" : "text"}
                  size="small"
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
        </Stack>

        <WalletConnect />
      </Toolbar>
    </AppBar>
  );
}
