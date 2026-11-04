const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployEcoCivicSystem } = require("../scripts/deploy");

describe("EcoCivic Full System Integration (RBAC, EIP-712 & Game Theory)", function () {
  let beltToken,
    citizenReputation,
    recyclingRewards,
    waterBilling,
    ecoCivicDeposit,
    slashingManager,
    mockUSDC,
    mockPool;
  let deployer, oracleSigner, treasury, citizen1, citizen2, inspector;
  let chainId;

  async function signRecyclingVoucher(signer, contractAddress, voucher) {
    const domain = {
      name: "EcoCivicRecyclingRewards",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    };
    const types = {
      RecyclingVoucher: [
        { name: "citizen", type: "address" },
        { name: "material", type: "uint8" },
        { name: "amount", type: "uint256" },
        { name: "qrHash", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return await signer.signTypedData(domain, types, voucher);
  }

  async function signWaterVoucher(signer, contractAddress, voucher) {
    const domain = {
      name: "EcoCivicWaterBilling",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    };
    const types = {
      WaterVoucher: [
        { name: "citizen", type: "address" },
        { name: "currentReading", type: "uint256" },
        { name: "meterId", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return await signer.signTypedData(domain, types, voucher);
  }

  beforeEach(async function () {
    [deployer, oracleSigner, treasury, citizen1, citizen2, inspector] =
      await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;

    const deployed = await deployEcoCivicSystem();
    beltToken = deployed.beltToken;
    citizenReputation = deployed.citizenReputation;
    recyclingRewards = deployed.recyclingRewards;
    waterBilling = deployed.waterBilling;
    ecoCivicDeposit = deployed.ecoCivicDeposit;
    slashingManager = deployed.slashingManager;
    mockUSDC = deployed.mockUSDC;
    mockPool = deployed.mockPool;
  });

  describe("RBAC & Co-Existing Minting Rights (Zero Ownership Deadlock)", function () {
    it("Should allow BOTH RecyclingRewards and WaterBilling to mint BELT tokens simultaneously", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // 1. Mint via RecyclingRewards (Metal = 2.0x -> 100 * 2.0 = 200 BELT, R_i: 100 -> 105)
      const recVoucher = {
        citizen: citizen1.address,
        material: 2, // Metal
        amount: ethers.parseUnits("100", 18),
        qrHash: "QR-HASH-101",
        nonce: 1,
        deadline,
      };
      const recSig = await signRecyclingVoucher(
        oracleSigner,
        await recyclingRewards.getAddress(),
        recVoucher
      );

      await expect(
        recyclingRewards
          .connect(citizen1)
          .rewardRecycling(
            recVoucher.citizen,
            recVoucher.material,
            recVoucher.amount,
            recVoucher.qrHash,
            recVoucher.nonce,
            recVoucher.deadline,
            recSig
          )
      )
        .to.emit(recyclingRewards, "RewardGranted")
        .withArgs(
          citizen1.address,
          2,
          ethers.parseUnits("200", 18),
          ethers.parseUnits("200", 18),
          "QR-HASH-101",
          1
        );

      expect(await beltToken.balanceOf(citizen1.address)).to.equal(
        ethers.parseUnits("200", 18)
      );
      expect(await citizenReputation.getReputation(citizen1.address)).to.equal(105);

      // 2. Mint via WaterBilling immediately after (R_i is now 105 -> 1.005x multiplier!)
      // Reading = 10 m3 (saves 10 m3 vs 20 m3 baseline -> raw = 10 + 10*5 = 60 BELT -> * 1.005 = 60.3 BELT)
      const waterVoucher = {
        citizen: citizen1.address,
        currentReading: 10,
        meterId: "METER-900",
        nonce: 1,
        deadline,
      };
      const waterSig = await signWaterVoucher(
        oracleSigner,
        await waterBilling.getAddress(),
        waterVoucher
      );

      await expect(
        waterBilling
          .connect(citizen1)
          .payBill(
            waterVoucher.citizen,
            waterVoucher.currentReading,
            waterVoucher.meterId,
            waterVoucher.nonce,
            waterVoucher.deadline,
            waterSig
          )
      ).to.emit(waterBilling, "BillPaid");

      // Total BELT = 200 + 60.3 = 260.3 BELT
      expect(await beltToken.balanceOf(citizen1.address)).to.equal(
        ethers.parseUnits("260.3", 18)
      );
      expect(await citizenReputation.getReputation(citizen1.address)).to.equal(110);
    });
  });

  describe("RecyclingRewards EIP-712 Security & Replay Protection", function () {
    it("Should reject unsigned/unauthorized recycling claims and prevent QR hash / nonce replay", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const contractAddr = await recyclingRewards.getAddress();

      const voucher = {
        citizen: citizen1.address,
        material: 1, // Paper (1.5x)
        amount: ethers.parseUnits("40", 18),
        qrHash: "QR-UNIQUE-777",
        nonce: 1,
        deadline,
      };

      // Citizen tries to sign their own voucher (self-signing attack)
      const selfSig = await signRecyclingVoucher(citizen1, contractAddr, voucher);
      await expect(
        recyclingRewards
          .connect(citizen1)
          .rewardRecycling(
            voucher.citizen,
            voucher.material,
            voucher.amount,
            voucher.qrHash,
            voucher.nonce,
            voucher.deadline,
            selfSig
          )
      ).to.be.revertedWith("Invalid oracle signature");

      // Valid oracle signature succeeds (40 * 1.5 = 60 BELT)
      const validSig = await signRecyclingVoucher(oracleSigner, contractAddr, voucher);
      await recyclingRewards
        .connect(citizen1)
        .rewardRecycling(
          voucher.citizen,
          voucher.material,
          voucher.amount,
          voucher.qrHash,
          voucher.nonce,
          voucher.deadline,
          validSig
        );

      expect(await beltToken.balanceOf(citizen1.address)).to.equal(
        ethers.parseUnits("60", 18)
      );
      expect(await recyclingRewards.isQrHashUsed("QR-UNIQUE-777")).to.equal(true);

      // Replaying same QR hash with new nonce fails
      const replayQrVoucher = { ...voucher, nonce: 2 };
      const replayQrSig = await signRecyclingVoucher(
        oracleSigner,
        contractAddr,
        replayQrVoucher
      );
      await expect(
        recyclingRewards
          .connect(citizen1)
          .rewardRecycling(
            replayQrVoucher.citizen,
            replayQrVoucher.material,
            replayQrVoucher.amount,
            replayQrVoucher.qrHash,
            replayQrVoucher.nonce,
            replayQrVoucher.deadline,
            replayQrSig
          )
      ).to.be.revertedWith("QR hash already used");
    });
  });

  describe("Game Theory Loop: Stake -> Slashing -> Reduced Reward Multiplier & Higher Required Stake", function () {
    it("Should penalize a slashed citizen with lower future rewards and higher required stake", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const stakeAmount = ethers.parseUnits("1000", 18);

      // 1. Citizen2 deposits 1000 mUSDC
      await mockUSDC.mint(citizen2.address, stakeAmount);
      await mockUSDC
        .connect(citizen2)
        .approve(await ecoCivicDeposit.getAddress(), stakeAmount);
      await ecoCivicDeposit.connect(citizen2).deposit(stakeAmount);

      expect(await ecoCivicDeposit.hasSufficientStake(citizen2.address)).to.equal(true);

      // 2. Citizen2 is caught cheating -> Slashed 300 mUSDC, Reputation drops 100 -> 50
      await slashingManager
        .connect(oracleSigner)
        .slashAndDistribute(
          citizen2.address,
          ethers.parseUnits("300", 18),
          inspector.address,
          "Fake QR code tampering"
        );

      expect(await citizenReputation.getReputation(citizen2.address)).to.equal(50);
      // Required stake at R_i=50 is now 2000 mUSDC, while deposit is 700 mUSDC -> insufficient stake!
      expect(await ecoCivicDeposit.getRequiredStakeForUser(citizen2.address)).to.equal(
        ethers.parseUnits("2000", 18)
      );
      expect(await ecoCivicDeposit.hasSufficientStake(citizen2.address)).to.equal(false);

      // 3. When Citizen2 submits recycling at R_i=50, reward multiplier is 0.5x (5000 BPS)
      // 100 Glass (1.0x) -> base 100 BELT -> * 0.5x = 50 BELT
      const voucher = {
        citizen: citizen2.address,
        material: 0, // Glass
        amount: ethers.parseUnits("100", 18),
        qrHash: "QR-POST-SLASH-01",
        nonce: 1,
        deadline,
      };
      const sig = await signRecyclingVoucher(
        oracleSigner,
        await recyclingRewards.getAddress(),
        voucher
      );

      await recyclingRewards
        .connect(citizen2)
        .rewardRecycling(
          voucher.citizen,
          voucher.material,
          voucher.amount,
          voucher.qrHash,
          voucher.nonce,
          voucher.deadline,
          sig
        );

      expect(await beltToken.balanceOf(citizen2.address)).to.equal(
        ethers.parseUnits("50", 18)
      );
      // Reputation recovers slightly (+5 -> 55) after honest declaration
      expect(await citizenReputation.getReputation(citizen2.address)).to.equal(55);
    });
  });
});
