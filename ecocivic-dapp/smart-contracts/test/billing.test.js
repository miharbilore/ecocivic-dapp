const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WaterBilling (EIP-712 Oracle & Perverse Incentive Fix)", function () {
  let beltToken, citizenReputation, waterBilling;
  let admin, oracleSigner, attacker, saverCitizen, wasterCitizen;
  let chainId;

  const BASE_STAKE = ethers.parseUnits("1000", 18);

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
    [admin, oracleSigner, attacker, saverCitizen, wasterCitizen] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;

    const BELTToken = await ethers.getContractFactory("BELTToken");
    beltToken = await BELTToken.deploy();

    const CitizenReputation = await ethers.getContractFactory("CitizenReputation");
    citizenReputation = await CitizenReputation.deploy(BASE_STAKE);

    const WaterBilling = await ethers.getContractFactory("WaterBilling");
    waterBilling = await WaterBilling.deploy(
      await beltToken.getAddress(),
      await citizenReputation.getAddress()
    );

    // Grant RBAC roles
    await beltToken.grantRole(await beltToken.MINTER_ROLE(), await waterBilling.getAddress());
    await beltToken.grantRole(await beltToken.BURNER_ROLE(), await waterBilling.getAddress());
    await citizenReputation.grantRole(
      await citizenReputation.REPUTATION_UPDATER_ROLE(),
      await waterBilling.getAddress()
    );
    await waterBilling.grantRole(
      await waterBilling.ORACLE_SIGNER_ROLE(),
      oracleSigner.address
    );
  });

  it("Should reward water savings and eliminate the perverse incentive of rewarding high consumption", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const contractAddr = await waterBilling.getAddress();

    // Baseline is 20 m3, Base reward = 10 BELT, Saving bonus = 5 BELT per saved m3
    // 1. Saver Citizen consumes only 12 m3 (saves 8 m3 -> 10 + 8*5 = 50 BELT)
    const saverVoucher = {
      citizen: saverCitizen.address,
      currentReading: 12,
      meterId: "METER-SAVER-01",
      nonce: 1,
      deadline,
    };
    const saverSig = await signWaterVoucher(oracleSigner, contractAddr, saverVoucher);

    await expect(
      waterBilling
        .connect(saverCitizen)
        .payBill(
          saverVoucher.citizen,
          saverVoucher.currentReading,
          saverVoucher.meterId,
          saverVoucher.nonce,
          saverVoucher.deadline,
          saverSig
        )
    )
      .to.emit(waterBilling, "BillPaid")
      .withArgs(
        saverCitizen.address,
        "METER-SAVER-01",
        12,
        12,
        8,
        ethers.parseUnits("50", 18),
        1
      );

    // 2. Waster Citizen consumes 45 m3 (exceeds 20 m3 baseline -> 0 saved m3 -> only 10 BELT base declaration reward)
    const wasterVoucher = {
      citizen: wasterCitizen.address,
      currentReading: 45,
      meterId: "METER-WASTER-01",
      nonce: 1,
      deadline,
    };
    const wasterSig = await signWaterVoucher(oracleSigner, contractAddr, wasterVoucher);

    await waterBilling
      .connect(wasterCitizen)
      .payBill(
        wasterVoucher.citizen,
        wasterVoucher.currentReading,
        wasterVoucher.meterId,
        wasterVoucher.nonce,
        wasterVoucher.deadline,
        wasterSig
      );

    const saverBalance = await beltToken.balanceOf(saverCitizen.address);
    const wasterBalance = await beltToken.balanceOf(wasterCitizen.address);

    expect(saverBalance).to.equal(ethers.parseUnits("50", 18));
    expect(wasterBalance).to.equal(ethers.parseUnits("10", 18));
    expect(saverBalance).to.be.gt(wasterBalance);
  });

  it("Should increase citizen reputation (R_i) by +5 and apply reputation multiplier on subsequent readings", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const contractAddr = await waterBilling.getAddress();

    expect(await citizenReputation.getReputation(saverCitizen.address)).to.equal(100);

    // Reading 1: 10 m3 (saves 10 m3 vs 20 m3 baseline) at R_i = 100 (1.0x = 10000 BPS)
    const v1 = {
      citizen: saverCitizen.address,
      currentReading: 10,
      meterId: "METER-01",
      nonce: 1,
      deadline,
    };
    const sig1 = await signWaterVoucher(oracleSigner, contractAddr, v1);
    await waterBilling
      .connect(saverCitizen)
      .payBill(v1.citizen, v1.currentReading, v1.meterId, v1.nonce, v1.deadline, sig1);

    // Reputation should now be 105 (Multiplier = 10050 BPS = 1.005x)
    expect(await citizenReputation.getReputation(saverCitizen.address)).to.equal(105);
    expect(await citizenReputation.getRewardMultiplierBps(saverCitizen.address)).to.equal(10050);

    // Historical average updated to (20*3 + 10)/4 = 17 m3
    // Reading 2: index 22 (consumption = 12 m3, saves 5 m3 vs 17 m3 avg -> raw reward = 10 + 5*5 = 35 BELT)
    // With R_i = 105 (1.005x): 35 * 1.005 = 35.175 BELT
    const v2 = {
      citizen: saverCitizen.address,
      currentReading: 22,
      meterId: "METER-01",
      nonce: 2,
      deadline,
    };
    const sig2 = await signWaterVoucher(oracleSigner, contractAddr, v2);
    await waterBilling
      .connect(saverCitizen)
      .payBill(v2.citizen, v2.currentReading, v2.meterId, v2.nonce, v2.deadline, sig2);

    expect(await citizenReputation.getReputation(saverCitizen.address)).to.equal(110);
    // Total balance = 60 + 35.175 = 95.175 BELT
    expect(await beltToken.balanceOf(saverCitizen.address)).to.equal(
      ethers.parseUnits("95.175", 18)
    );
  });

  it("Should reject forged signatures, expired vouchers, replay nonces, and decreasing readings", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const contractAddr = await waterBilling.getAddress();

    const voucher = {
      citizen: saverCitizen.address,
      currentReading: 15,
      meterId: "METER-01",
      nonce: 10,
      deadline,
    };

    // 1. Forged signature signed by attacker instead of ORACLE_SIGNER_ROLE
    const forgedSig = await signWaterVoucher(attacker, contractAddr, voucher);
    await expect(
      waterBilling
        .connect(saverCitizen)
        .payBill(
          voucher.citizen,
          voucher.currentReading,
          voucher.meterId,
          voucher.nonce,
          voucher.deadline,
          forgedSig
        )
    ).to.be.revertedWith("Invalid oracle signature");

    // 2. Expired voucher
    const expiredVoucher = { ...voucher, deadline: Math.floor(Date.now() / 1000) - 100 };
    const expiredSig = await signWaterVoucher(oracleSigner, contractAddr, expiredVoucher);
    await expect(
      waterBilling
        .connect(saverCitizen)
        .payBill(
          expiredVoucher.citizen,
          expiredVoucher.currentReading,
          expiredVoucher.meterId,
          expiredVoucher.nonce,
          expiredVoucher.deadline,
          expiredSig
        )
    ).to.be.revertedWith("Voucher has expired");

    // 3. Valid call succeeds, then replay with same nonce fails
    const validSig = await signWaterVoucher(oracleSigner, contractAddr, voucher);
    await waterBilling
      .connect(saverCitizen)
      .payBill(
        voucher.citizen,
        voucher.currentReading,
        voucher.meterId,
        voucher.nonce,
        voucher.deadline,
        validSig
      );

    const replayVoucher = { ...voucher, currentReading: 25 };
    const replaySig = await signWaterVoucher(oracleSigner, contractAddr, replayVoucher);
    await expect(
      waterBilling
        .connect(saverCitizen)
        .payBill(
          replayVoucher.citizen,
          replayVoucher.currentReading,
          replayVoucher.meterId,
          replayVoucher.nonce,
          replayVoucher.deadline,
          replaySig
        )
    ).to.be.revertedWith("Nonce already used");

    // 4. Decreasing or equal meter reading fails
    const lowerReadingVoucher = { ...voucher, currentReading: 14, nonce: 11 };
    const lowerSig = await signWaterVoucher(oracleSigner, contractAddr, lowerReadingVoucher);
    await expect(
      waterBilling
        .connect(saverCitizen)
        .payBill(
          lowerReadingVoucher.citizen,
          lowerReadingVoucher.currentReading,
          lowerReadingVoucher.meterId,
          lowerReadingVoucher.nonce,
          lowerReadingVoucher.deadline,
          lowerSig
        )
    ).to.be.revertedWith("New reading must be greater than last reading");
  });

  it("Should burn BELT and emit ConvertedToFiatCard on convertBeltToCardBalance (1 BELT = 1.50 TL)", async function () {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const contractAddr = await waterBilling.getAddress();

    // First earn 50 BELT via honest water declaration
    const saverVoucher = {
      citizen: saverCitizen.address,
      currentReading: 12,
      meterId: "METER-CARD-01",
      nonce: 1,
      deadline,
    };
    const saverSig = await signWaterVoucher(oracleSigner, contractAddr, saverVoucher);
    await waterBilling
      .connect(saverCitizen)
      .payBill(
        saverVoucher.citizen,
        saverVoucher.currentReading,
        saverVoucher.meterId,
        saverVoucher.nonce,
        saverVoucher.deadline,
        saverSig
      );

    expect(await beltToken.balanceOf(saverCitizen.address)).to.equal(ethers.parseUnits("50", 18));

    // Convert 20 BELT via BELTToken.convertBeltToCardBalance -> 30 TRY equivalent
    await expect(
      beltToken.connect(saverCitizen).convertBeltToCardBalance(ethers.parseUnits("20", 18))
    )
      .to.emit(beltToken, "ConvertedToFiatCard")
      .withArgs(
        saverCitizen.address,
        ethers.parseUnits("20", 18),
        ethers.parseUnits("30", 18)
      );

    expect(await beltToken.balanceOf(saverCitizen.address)).to.equal(ethers.parseUnits("30", 18));

    // Convert another 10 BELT via WaterBilling.convertBeltToCardBalance -> 15 TRY equivalent
    await expect(
      waterBilling.connect(saverCitizen).convertBeltToCardBalance(ethers.parseUnits("10", 18))
    )
      .to.emit(waterBilling, "ConvertedToFiatCard")
      .withArgs(
        saverCitizen.address,
        ethers.parseUnits("10", 18),
        ethers.parseUnits("15", 18)
      );

    expect(await beltToken.balanceOf(saverCitizen.address)).to.equal(ethers.parseUnits("20", 18));
    expect(await beltToken.totalConvertedFiatTry(saverCitizen.address)).to.equal(
      ethers.parseUnits("45", 18)
    );
  });
});
