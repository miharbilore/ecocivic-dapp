require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * ENV değişkenleri (root .env dosyasında olmalı)
 *
 * PRIVATE_KEY=0x....
 * POLYGON_RPC=https://polygon-rpc.com
 * AMOY_RPC=https://rpc-amoy.polygon.technology
 * POLYGONSCAN_API_KEY=...
 */

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },

    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    amoy: {
      url: process.env.AMOY_RPC || "https://rpc-amoy.polygon.technology",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
    },

    polygon: {
      url: process.env.POLYGON_RPC || "https://polygon-rpc.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137,
    },
  },

  etherscan: {
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
