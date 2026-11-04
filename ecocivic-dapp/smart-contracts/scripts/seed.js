const hre = require("hardhat");
const { deployEcoCivicSystem } = require("./deploy");

async function main() {
  console.log("Seeding local EcoCivic test environment...");

  const signers = await hre.ethers.getSigners();
  const [deployer, oracleSigner, treasury, citizen1, citizen2, inspector] = signers;

  const {
    beltToken,
    citizenReputation,
    recyclingRewards,
    waterBilling,
    ecoCivicDeposit,
    slashingManager,
    mockUSDC,
  } = await deployEcoCivicSystem();

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // 1. Mint Mock USDC & Deposit Collateral for Citizens
  const initialStake = hre.ethers.parseUnits("1500", 18);
  for (const citizen of [citizen1, citizen2]) {
    await (await mockUSDC.mint(citizen.address, initialStake)).wait();
    await (await mockUSDC.connect(citizen).approve(await ecoCivicDeposit.getAddress(), initialStake)).wait();
    await (await ecoCivicDeposit.connect(citizen).deposit(initialStake)).wait();
    console.log(`Seeded deposit for ${citizen.address}: 1500 mUSDC`);
  }

  // 2. Seed Honest Recycling Voucher for Citizen 1 (EIP-712)
  const recyclingDomain = {
    name: "EcoCivicRecyclingRewards",
    version: "1",
    chainId,
    verifyingContract: await recyclingRewards.getAddress(),
  };
  const recyclingTypes = {
    RecyclingVoucher: [
      { name: "citizen", type: "address" },
      { name: "material", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "qrHash", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const recyclingAmount = hre.ethers.parseUnits("50", 18);
  const recyclingValue = {
    citizen: citizen1.address,
    material: 2, // Metal (2.0x)
    amount: recyclingAmount,
    qrHash: "QR-SEED-001",
    nonce: 1,
    deadline,
  };
  const recyclingSig = await oracleSigner.signTypedData(
    recyclingDomain,
    recyclingTypes,
    recyclingValue
  );
  await (
    await recyclingRewards
      .connect(citizen1)
      .rewardRecycling(
        citizen1.address,
        recyclingValue.material,
        recyclingValue.amount,
        recyclingValue.qrHash,
        recyclingValue.nonce,
        recyclingValue.deadline,
        recyclingSig
      )
  ).wait();

  // 3. Seed Honest Water Meter Saving Declaration for Citizen 1 (EIP-712)
  const waterDomain = {
    name: "EcoCivicWaterBilling",
    version: "1",
    chainId,
    verifyingContract: await waterBilling.getAddress(),
  };
  const waterTypes = {
    WaterVoucher: [
      { name: "citizen", type: "address" },
      { name: "currentReading", type: "uint256" },
      { name: "meterId", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const waterValue = {
    citizen: citizen1.address,
    currentReading: 12, // Saves 8 m3 compared to 20 m3 baseline
    meterId: "MTR-IST-1001",
    nonce: 1,
    deadline,
  };
  const waterSig = await oracleSigner.signTypedData(waterDomain, waterTypes, waterValue);
  await (
    await waterBilling
      .connect(citizen1)
      .payBill(
        citizen1.address,
        waterValue.currentReading,
        waterValue.meterId,
        waterValue.nonce,
        waterValue.deadline,
        waterSig
      )
  ).wait();

  // 4. Seed Anomaly Slashing & Fund Distribution for Citizen 2
  const slashAmount = hre.ethers.parseUnits("400", 18);
  await (
    await slashingManager
      .connect(oracleSigner)
      .slashAndDistribute(
        citizen2.address,
        slashAmount,
        inspector.address,
        "AI Anomaly Detection: Tampered Water Meter Bypass"
      )
  ).wait();

  console.log("-------------------------------------------------------------");
  console.log("Seed Summary:");
  console.log(
    "Citizen 1 (Honest) BELT Balance :",
    hre.ethers.formatEther(await beltToken.balanceOf(citizen1.address)),
    "BELT"
  );
  console.log(
    "Citizen 1 Reputation (R_i)      :",
    (await citizenReputation.getReputation(citizen1.address)).toString()
  );
  console.log(
    "Citizen 2 (Slashed) Deposit     :",
    hre.ethers.formatEther(await ecoCivicDeposit.getUserDeposit(citizen2.address)),
    "mUSDC"
  );
  console.log(
    "Citizen 2 Reputation (R_i)      :",
    (await citizenReputation.getReputation(citizen2.address)).toString()
  );
  console.log(
    "Inspector Reward Balance        :",
    hre.ethers.formatEther(await mockUSDC.balanceOf(inspector.address)),
    "mUSDC"
  );
  console.log(
    "Municipal Treasury Balance      :",
    hre.ethers.formatEther(await mockUSDC.balanceOf(treasury.address)),
    "mUSDC"
  );
  console.log("=============================================================");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
