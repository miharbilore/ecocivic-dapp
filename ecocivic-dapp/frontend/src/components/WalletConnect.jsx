import React from "react";
import {
  Box,
  Button,
  Chip,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Tooltip,
} from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ScienceIcon from "@mui/icons-material/Science";
import { DEMO_ACCOUNTS, useWallet } from "../context/WalletContext";

export default function WalletConnect() {
  const {
    account,
    beltBalance,
    isDemoMode,
    activePersona,
    isConnecting,
    connectWallet,
    switchDemoAccount,
  } = useWallet();

  const formatAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "Bağlı Değil";

  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <FormControl size="small" sx={{ minWidth: 195 }}>
        <Select
          value={activePersona}
          onChange={(e) => switchDemoAccount(e.target.value)}
          sx={{ fontSize: "0.82rem", height: 34 }}
        >
          {Object.entries(DEMO_ACCOUNTS).map(([key, item]) => (
            <MenuItem key={key} value={key} sx={{ fontSize: "0.82rem" }}>
              {item.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Chip
        icon={<ScienceIcon />}
        label={isDemoMode ? "Simülasyon / Hibrit Mod" : "Canlı Web3"}
        color={isDemoMode ? "secondary" : "success"}
        variant="outlined"
        size="small"
      />

      <Chip
        label={`${Number(beltBalance || 0).toFixed(2)} BELT`}
        color="primary"
        size="small"
        sx={{ fontWeight: "bold" }}
      />

      {account ? (
        <Tooltip title={`Aktif Cüzdan: ${account}`}>
          <Chip
            icon={<AccountBalanceWalletIcon />}
            label={formatAddress(account)}
            color="primary"
            variant="filled"
            size="small"
          />
        </Tooltip>
      ) : null}

      <Box>
        <Button
          variant="outlined"
          color="primary"
          size="small"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? "Bağlanıyor..." : "MetaMask Bağla"}
        </Button>
      </Box>
    </Stack>
  );
}
