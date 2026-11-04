const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EcoCivicDeposit & CitizenReputation (DeFi Escrow & Dynamic Stake)", function () {
  let mockUSDC, mockLendingPool, citizenReputation, ecoCivicDeposit;
  let admin, slasher, citizen1, citizen2;

  const BASE_REQUIRED_STAKE = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [admin, slasher, citizen1, citizen2] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC");

    const MockLendingPool = await ethers.getContractFactory("MockLendingPool");
    mockLendingPool = await MockLendingPool.deploy();

    const CitizenReputation = await ethers.getContractFactory("CitizenReputation");
    citizenReputation = await CitizenReputation.deploy(BASE_REQUIRED_STAKE);

    const EcoCivicDeposit = await ethers.getContractFactory("EcoCivicDeposit");
    ecoCivicDeposit = await EcoCivicDeposit.deploy(
      await mockUSDC.getAddress(),
      await mockLendingPool.getAddress(),
      await citizenReputation.getAddress()
    );

    await ecoCivicDeposit.grantRole(
      await ecoCivicDeposit.SLASHING_ROLE(),
      slasher.address
    );
  });

  it("Should deposit citizen funds into Aave LendingPool and track accounting accurately", async function () {
    const amount = ethers.parseUnits("1000", 18);
    await mockUSDC.mint(citizen1.address, amount);
    await mockUSDC.connect(citizen1).approve(await ecoCivicDeposit.getAddress(), amount);

    await expect(ecoCivicDeposit.connect(citizen1).deposit(amount))
      .to.emit(ecoCivicDeposit, "Deposited")
      .withArgs(citizen1.address, amount, amount);

    expect(await ecoCivicDeposit.getUserDeposit(citizen1.address)).to.equal(amount);
    expect(await ecoCivicDeposit.totalDeposits()).to.equal(amount);
    expect(await ecoCivicDeposit.hasSufficientStake(citizen1.address)).to.equal(true);

    const poolBalance = await mockLendingPool.deposits(
      await mockUSDC.getAddress(),
      await ecoCivicDeposit.getAddress()
    );
    expect(poolBalance).to.equal(amount);
  });

  it("Should allow citizens to safely withdraw their deposit when no penalty lock is active", async function () {
    const depositAmount = ethers.parseUnits("1000", 18);
    const withdrawAmount = ethers.parseUnits("400", 18);

    await mockUSDC.mint(citizen1.address, depositAmount);
    await mockUSDC.connect(citizen1).approve(await ecoCivicDeposit.getAddress(), depositAmount);
    await ecoCivicDeposit.connect(citizen1).deposit(depositAmount);

    await expect(ecoCivicDeposit.connect(citizen1).withdrawCitizenDeposit(withdrawAmount))
      .to.emit(ecoCivicDeposit, "CitizenWithdrawn")
      .withArgs(citizen1.address, withdrawAmount, depositAmount - withdrawAmount);

    expect(await ecoCivicDeposit.getUserDeposit(citizen1.address)).to.equal(
      depositAmount - withdrawAmount
    );
    expect(await mockUSDC.balanceOf(citizen1.address)).to.equal(withdrawAmount);
  });

  it("Should block citizen withdrawal when under active penalty/investigation lock", async function () {
    const depositAmount = ethers.parseUnits("1000", 18);
    await mockUSDC.mint(citizen1.address, depositAmount);
    await mockUSDC.connect(citizen1).approve(await ecoCivicDeposit.getAddress(), depositAmount);
    await ecoCivicDeposit.connect(citizen1).deposit(depositAmount);

    // Lock citizen account during anomaly investigation
    await ecoCivicDeposit.connect(slasher).setPenaltyLock(citizen1.address, true);

    await expect(
      ecoCivicDeposit.connect(citizen1).withdrawCitizenDeposit(ethers.parseUnits("100", 18))
    ).to.be.revertedWith("Citizen has an active penalty/investigation lock");

    // Unlock and verify withdrawal works again
    await ecoCivicDeposit.connect(slasher).setPenaltyLock(citizen1.address, false);
    await expect(
      ecoCivicDeposit.connect(citizen1).withdrawCitizenDeposit(ethers.parseUnits("100", 18))
    ).to.not.be.reverted;
  });

  it("Should dynamically adjust required stake based on citizen Reputation Score (R_i)", async function () {
    // Initial R_i = 100 -> Required Stake = 1000 USDC
    expect(await ecoCivicDeposit.getRequiredStakeForUser(citizen1.address)).to.equal(
      BASE_REQUIRED_STAKE
    );

    // Simulate 20 honest declarations (+100 reputation -> R_i = 200)
    for (let i = 0; i < 20; i++) {
      await citizenReputation.recordHonestAction(citizen1.address);
    }
    expect(await citizenReputation.getReputation(citizen1.address)).to.equal(200);

    // At R_i = 200, Required Stake drops to 500 USDC (honest citizen rewarded with lower collateral requirement)
    const honestRequiredStake = await ecoCivicDeposit.getRequiredStakeForUser(citizen1.address);
    expect(honestRequiredStake).to.equal(ethers.parseUnits("500", 18));

    // Simulate fraud slashing on citizen2 (R_i drops from 100 to 50)
    await citizenReputation.recordSlashing(citizen2.address);
    expect(await citizenReputation.getReputation(citizen2.address)).to.equal(50);

    // At R_i = 50, Required Stake doubles to 2000 USDC
    const riskyRequiredStake = await ecoCivicDeposit.getRequiredStakeForUser(citizen2.address);
    expect(riskyRequiredStake).to.equal(ethers.parseUnits("2000", 18));
  });
});
