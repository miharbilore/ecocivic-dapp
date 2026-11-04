const hre = require("hardhat");

async function deployEcoCivicSystem() {
  const [deployer, defaultOracle, defaultTreasury] = await hre.ethers.getSigners();

  const oracleSignerAddress =
    process.env.ORACLE_SIGNER_ADDRESS ||
    (defaultOracle ? defaultOracle.address : deployer.address);
  const treasuryAddress =
    process.env.TREASURY_ADDRESS ||
    (defaultTreasury ? defaultTreasury.address : deployer.address);

  console.log("=============================================================");
  console.log("Deploying EcoCivic Smart Contract Suite (Phase 1 RBAC/EIP-712)");
  console.log("Deployer Account :", deployer.address);
  console.log("Oracle Signer    :", oracleSignerAddress);
  console.log("Municipal Fund   :", treasuryAddress);
  console.log("Network          :", hre.network.name);
  console.log("=============================================================");

  // 1. Deploy BELT Token
  const BELTToken = await hre.ethers.getContractFactory("BELTToken");
  const beltToken = await BELTToken.deploy();
  await beltToken.waitForDeployment();
  const beltTokenAddress = await beltToken.getAddress();
  console.log("[1/6] BELTToken deployed to         :", beltTokenAddress);

  // 2. Deploy CitizenReputation (Base Required Stake = 1000 USDC units)
  const baseRequiredStake = hre.ethers.parseUnits("1000", 18);
  const CitizenReputation = await hre.ethers.getContractFactory("CitizenReputation");
  const citizenReputation = await CitizenReputation.deploy(baseRequiredStake);
  await citizenReputation.waitForDeployment();
  const citizenReputationAddress = await citizenReputation.getAddress();
  console.log("[2/6] CitizenReputation deployed to :", citizenReputationAddress);

  // 3. Deploy RecyclingRewards
  const RecyclingRewards = await hre.ethers.getContractFactory("RecyclingRewards");
  const recyclingRewards = await RecyclingRewards.deploy(
    beltTokenAddress,
    citizenReputationAddress
  );
  await recyclingRewards.waitForDeployment();
  const recyclingRewardsAddress = await recyclingRewards.getAddress();
  console.log("[3/6] RecyclingRewards deployed to  :", recyclingRewardsAddress);

  // 4. Deploy WaterBilling
  const WaterBilling = await hre.ethers.getContractFactory("WaterBilling");
  const waterBilling = await WaterBilling.deploy(
    beltTokenAddress,
    citizenReputationAddress
  );
  await waterBilling.waitForDeployment();
  const waterBillingAddress = await waterBilling.getAddress();
  console.log("[4/6] WaterBilling deployed to      :", waterBillingAddress);

  // 5. Deploy Deposit System (with Mock USDC & Mock LendingPool on local networks)
  let depositTokenAddress = process.env.USDC_ADDRESS;
  let lendingPoolAddress = process.env.LENDING_POOL_ADDRESS;
  let mockUSDC = null;
  let mockPool = null;

  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC");
    await mockUSDC.waitForDeployment();
    depositTokenAddress = await mockUSDC.getAddress();
    console.log("      -> Mock USDC deployed to      :", depositTokenAddress);

    const MockLendingPool = await hre.ethers.getContractFactory("MockLendingPool");
    mockPool = await MockLendingPool.deploy();
    await mockPool.waitForDeployment();
    lendingPoolAddress = await mockPool.getAddress();
    console.log("      -> Mock LendingPool deployed  :", lendingPoolAddress);
  }

  if (!depositTokenAddress || !lendingPoolAddress) {
    throw new Error("Missing USDC_ADDRESS or LENDING_POOL_ADDRESS in environment.");
  }

  const EcoCivicDeposit = await hre.ethers.getContractFactory("EcoCivicDeposit");
  const ecoCivicDeposit = await EcoCivicDeposit.deploy(
    depositTokenAddress,
    lendingPoolAddress,
    citizenReputationAddress
  );
  await ecoCivicDeposit.waitForDeployment();
  const ecoCivicDepositAddress = await ecoCivicDeposit.getAddress();
  console.log("[5/6] EcoCivicDeposit deployed to   :", ecoCivicDepositAddress);

  // 6. Deploy SlashingManager
  const SlashingManager = await hre.ethers.getContractFactory("SlashingManager");
  const slashingManager = await SlashingManager.deploy(
    ecoCivicDepositAddress,
    citizenReputationAddress,
    treasuryAddress,
    beltTokenAddress
  );
  await slashingManager.waitForDeployment();
  const slashingManagerAddress = await slashingManager.getAddress();
  console.log("[6/6] SlashingManager deployed to   :", slashingManagerAddress);

  // =============================================================
  // 7. Configure RBAC Roles (Zero Ownership Deadlock)
  // =============================================================
  console.log("-------------------------------------------------------------");
  console.log("Configuring Role-Based Access Control (RBAC)...");

  const MINTER_ROLE = await beltToken.MINTER_ROLE();
  const BURNER_ROLE = await beltToken.BURNER_ROLE();
  const TOKEN_SLASHING_ROLE = await beltToken.SLASHING_ROLE();

  // Grant MINTER_ROLE to both RecyclingRewards and WaterBilling
  await (await beltToken.grantRole(MINTER_ROLE, recyclingRewardsAddress)).wait();
  await (await beltToken.grantRole(MINTER_ROLE, waterBillingAddress)).wait();
  await (await beltToken.grantRole(BURNER_ROLE, waterBillingAddress)).wait();
  await (await beltToken.grantRole(BURNER_ROLE, slashingManagerAddress)).wait();
  await (await beltToken.grantRole(TOKEN_SLASHING_ROLE, slashingManagerAddress)).wait();

  // Grant REPUTATION_UPDATER_ROLE and SLASHING_ROLE on CitizenReputation
  const REPUTATION_UPDATER_ROLE = await citizenReputation.REPUTATION_UPDATER_ROLE();
  const REP_SLASHING_ROLE = await citizenReputation.SLASHING_ROLE();
  await (await citizenReputation.grantRole(REPUTATION_UPDATER_ROLE, recyclingRewardsAddress)).wait();
  await (await citizenReputation.grantRole(REPUTATION_UPDATER_ROLE, waterBillingAddress)).wait();
  await (await citizenReputation.grantRole(REP_SLASHING_ROLE, slashingManagerAddress)).wait();

  // Grant SLASHING_ROLE on EcoCivicDeposit to SlashingManager
  const DEPOSIT_SLASHING_ROLE = await ecoCivicDeposit.SLASHING_ROLE();
  await (await ecoCivicDeposit.grantRole(DEPOSIT_SLASHING_ROLE, slashingManagerAddress)).wait();

  // Grant ORACLE_SIGNER_ROLE on RecyclingRewards & WaterBilling
  const ORACLE_SIGNER_ROLE = await recyclingRewards.ORACLE_SIGNER_ROLE();
  await (await recyclingRewards.grantRole(ORACLE_SIGNER_ROLE, oracleSignerAddress)).wait();
  await (await waterBilling.grantRole(ORACLE_SIGNER_ROLE, oracleSignerAddress)).wait();

  // Grant SLASHING_ROLE on SlashingManager to Oracle Signer (for autonomous AI audit slashing)
  const MANAGER_SLASHING_ROLE = await slashingManager.SLASHING_ROLE();
  await (await slashingManager.grantRole(MANAGER_SLASHING_ROLE, oracleSignerAddress)).wait();

  console.log("RBAC roles successfully granted across all contracts.");
  console.log("=============================================================");

  return {
    beltToken,
    citizenReputation,
    recyclingRewards,
    waterBilling,
    ecoCivicDeposit,
    slashingManager,
    mockUSDC,
    mockPool,
    deployer,
    oracleSignerAddress,
    treasuryAddress,
  };
}

if (require.main === module) {
  deployEcoCivicSystem().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { deployEcoCivicSystem };
