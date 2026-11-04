const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SlashingManager (Slashing Accounting, Reputation Cut & Fund Distribution)", function () {
  let beltToken, mockUSDC, mockLendingPool, citizenReputation, ecoCivicDeposit, slashingManager;
  let admin, oracleSlasher, treasury, inspector, offender, honestCitizen;

  const BASE_STAKE = ethers.parseUnits("1000", 18);

  beforeEach(async function () {
    [admin, oracleSlasher, treasury, inspector, offender, honestCitizen] =
      await ethers.getSigners();

    const BELTToken = await ethers.getContractFactory("BELTToken");
    beltToken = await BELTToken.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "mUSDC");

    const MockLendingPool = await ethers.getContractFactory("MockLendingPool");
    mockLendingPool = await MockLendingPool.deploy();

    const CitizenReputation = await ethers.getContractFactory("CitizenReputation");
    citizenReputation = await CitizenReputation.deploy(BASE_STAKE);

    const EcoCivicDeposit = await ethers.getContractFactory("EcoCivicDeposit");
    ecoCivicDeposit = await EcoCivicDeposit.deploy(
      await mockUSDC.getAddress(),
      await mockLendingPool.getAddress(),
      await citizenReputation.getAddress()
    );

    const SlashingManager = await ethers.getContractFactory("SlashingManager");
    slashingManager = await SlashingManager.deploy(
      await ecoCivicDeposit.getAddress(),
      await citizenReputation.getAddress(),
      treasury.address,
      await beltToken.getAddress()
    );

    // Grant RBAC roles to SlashingManager and oracleSlasher
    await ecoCivicDeposit.grantRole(
      await ecoCivicDeposit.SLASHING_ROLE(),
      await slashingManager.getAddress()
    );
    await citizenReputation.grantRole(
      await citizenReputation.SLASHING_ROLE(),
      await slashingManager.getAddress()
    );
    await beltToken.grantRole(
      await beltToken.SLASHING_ROLE(),
      await slashingManager.getAddress()
    );
    await slashingManager.grantRole(
      await slashingManager.SLASHING_ROLE(),
      oracleSlasher.address
    );

    // Seed deposits for both offender and honestCitizen
    const depositAmount = ethers.parseUnits("1000", 18);
    for (const user of [offender, honestCitizen]) {
      await mockUSDC.mint(user.address, depositAmount);
      await mockUSDC.connect(user).approve(await ecoCivicDeposit.getAddress(), depositAmount);
      await ecoCivicDeposit.connect(user).deposit(depositAmount);
    }
  });

  it("Should accurately deduct offender userDeposits and cut Reputation Score (R_i) by 50%", async function () {
    const slashAmount = ethers.parseUnits("400", 18);

    expect(await citizenReputation.getReputation(offender.address)).to.equal(100);
    expect(await citizenReputation.getAuditProbabilityBps(offender.address)).to.equal(2000); // 20%

    await expect(
      slashingManager
        .connect(oracleSlasher)
        .slashUser(offender.address, slashAmount, "Tampered Water Meter Detected")
    )
      .to.emit(slashingManager, "UserSlashed")
      .withArgs(offender.address, slashAmount, 50, "Tampered Water Meter Detected");

    // Verify EcoCivicDeposit balance decreased from 1000 to 600 (fixes accounting bug!)
    expect(await ecoCivicDeposit.getUserDeposit(offender.address)).to.equal(
      ethers.parseUnits("600", 18)
    );
    // Honest citizen deposit remains untouched
    expect(await ecoCivicDeposit.getUserDeposit(honestCitizen.address)).to.equal(
      ethers.parseUnits("1000", 18)
    );

    // Attempting to slash 700 USDC now must revert because remaining deposit is only 600 USDC
    await expect(
      slashingManager
        .connect(oracleSlasher)
        .slashUser(offender.address, ethers.parseUnits("700", 18), "Second violation")
    ).to.be.revertedWith("Cannot slash more than user deposit");

    // Reputation is now 50, audit probability doubled to 40% (4000 BPS)
    expect(await citizenReputation.getReputation(offender.address)).to.equal(50);
    expect(await citizenReputation.getAuditProbabilityBps(offender.address)).to.equal(4000);
  });

  it("Should distribute slashed funds between Inspector (20%) and Municipal Treasury (80%) without locking funds", async function () {
    const slashAmount = ethers.parseUnits("500", 18);

    await expect(
      slashingManager
        .connect(oracleSlasher)
        .slashAndDistribute(
          offender.address,
          slashAmount,
          inspector.address,
          "Illegal Waste Dumping Caught"
        )
    )
      .to.emit(slashingManager, "SlashedFundsDistributed")
      .withArgs(
        inspector.address,
        ethers.parseUnits("100", 18), // 20% Inspector reward
        treasury.address,
        ethers.parseUnits("400", 18)  // 80% Municipal Environmental Treasury
      );

    expect(await mockUSDC.balanceOf(inspector.address)).to.equal(ethers.parseUnits("100", 18));
    expect(await mockUSDC.balanceOf(treasury.address)).to.equal(ethers.parseUnits("400", 18));
    expect(await slashingManager.undistributedSlashedFunds()).to.equal(0);
    expect(await mockUSDC.balanceOf(await slashingManager.getAddress())).to.equal(0);
  });

  it("Should prevent arbitrary burnFrom without allowance and enforce max 50% cap on slashBurn", async function () {
    const initialTokens = ethers.parseUnits("200", 18);
    await beltToken.mint(offender.address, initialTokens);

    // 1. Even admin with BURNER_ROLE cannot call burnFrom without user allowance (fixes allowance bypass)
    await expect(
      beltToken.connect(admin).burnFrom(offender.address, ethers.parseUnits("50", 18))
    ).to.be.revertedWithCustomError(beltToken, "ERC20InsufficientAllowance");

    // 2. SlashingManager cannot burn more than 50% of user's BELT balance in one penalty
    await expect(
      slashingManager
        .connect(oracleSlasher)
        .slashUserTokens(offender.address, ethers.parseUnits("120", 18), "Excessive token slash")
    ).to.be.revertedWith("Slash amount exceeds maximum allowed percentage");

    // 3. Rule-bound slash of 50% (100 BELT) succeeds
    await expect(
      slashingManager
        .connect(oracleSlasher)
        .slashUserTokens(offender.address, ethers.parseUnits("100", 18), "Fraudulent QR penalty")
    )
      .to.emit(slashingManager, "TokenPenaltyBurned")
      .withArgs(offender.address, ethers.parseUnits("100", 18), "Fraudulent QR penalty");

    expect(await beltToken.balanceOf(offender.address)).to.equal(ethers.parseUnits("100", 18));
  });
});
