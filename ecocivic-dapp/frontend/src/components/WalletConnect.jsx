import React, { useState } from "react";
import {
  Avatar,
  Box,
  ButtonBase,
  Chip,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CheckIcon from "@mui/icons-material/Check";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { DEMO_ACCOUNTS, useWallet } from "../context/WalletContext";

const initialsOf = (name = "") =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * Kompakt Profil / Cüzdan Seçici (Navbar sağ üst köşe).
 * Demo personaları, MetaMask bağlantısı ve "Demo Verilerini Sıfırla" eylemini tek menüde toplar.
 */
export default function WalletConnect() {
  const {
    account,
    beltBalance,
    isDemoMode,
    activePersona,
    isConnecting,
    connectWallet,
    switchDemoAccount,
    resetDemoData,
  } = useWallet();

  const [anchorEl, setAnchorEl] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const open = Boolean(anchorEl);

  const persona = DEMO_ACCOUNTS[activePersona];
  const displayName = persona ? persona.shortLabel : "MetaMask Cüzdanı";
  const shortAddr = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Bağlı değil";

  const close = () => setAnchorEl(null);

  const handleSwitch = async (key) => {
    close();
    await switchDemoAccount(key);
  };

  const handleReset = async () => {
    setIsResetting(true);
    await resetDemoData();
    setIsResetting(false);
    close();
  };

  const handleMetaMask = async () => {
    close();
    await connectWallet();
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          borderRadius: 999,
          pl: 0.5,
          pr: 1.25,
          py: 0.5,
          gap: 1,
          border: "1px solid rgba(255,255,255,0.10)",
          bgcolor: "rgba(255,255,255,0.04)",
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
        }}
      >
        <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: "primary.dark" }}>
          {initialsOf(displayName)}
        </Avatar>
        <Box sx={{ textAlign: "left", display: { xs: "none", sm: "block" } }}>
          <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
            {displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" lineHeight={1.1}>
            {Number(beltBalance || 0).toFixed(0)} puan
          </Typography>
        </Box>
        <KeyboardArrowDownIcon fontSize="small" sx={{ color: "text.secondary" }} />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 270, borderRadius: 3 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {displayName}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
              {shortAddr}
            </Typography>
            <Chip
              label={isDemoMode ? "Demo" : "Canlı"}
              size="small"
              color={isDemoMode ? "default" : "success"}
              sx={{ height: 18, fontSize: 10 }}
            />
          </Stack>
        </Box>
        <Divider />

        <Typography variant="overline" color="text.secondary" sx={{ px: 2, pt: 1, display: "block" }}>
          Profil Değiştir
        </Typography>
        {Object.entries(DEMO_ACCOUNTS).map(([key, item]) => (
          <MenuItem key={key} onClick={() => handleSwitch(key)} dense>
            <ListItemIcon>
              {activePersona === key ? <CheckIcon fontSize="small" color="primary" /> : null}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </MenuItem>
        ))}

        <MenuItem onClick={handleMetaMask} disabled={isConnecting} dense>
          <ListItemIcon>
            <AccountBalanceWalletOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={isConnecting ? "Bağlanıyor…" : "MetaMask ile Bağlan"} />
        </MenuItem>

        <Divider />
        <MenuItem onClick={handleReset} disabled={isResetting || !persona} dense>
          <ListItemIcon>
            <RestartAltIcon fontSize="small" color="warning" />
          </ListItemIcon>
          <ListItemText
            primary={isResetting ? "Sıfırlanıyor…" : "Demo Verilerini Sıfırla"}
            secondary="Seçili profili ilk haline döndürür"
          />
        </MenuItem>
      </Menu>
    </>
  );
}
