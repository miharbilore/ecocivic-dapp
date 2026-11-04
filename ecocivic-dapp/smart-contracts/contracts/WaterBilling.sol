// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./BELTToken.sol";
import "./interfaces/ICitizenReputation.sol";

/**
 * @title WaterBilling
 * @notice EIP-712 Kriptografik AI Oracle Doğrulamalı, Ters Teşvik (Perverse Incentive)
 *         Korumalı ve İtibar Çarpanlı (R_i) Akıllı Su Faturalandırma ve Tasarruf Ödül Kontratı.
 */
contract WaterBilling is AccessControl, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    bytes32 public constant ORACLE_SIGNER_ROLE = keccak256("ORACLE_SIGNER_ROLE");

    bytes32 public constant WATER_VOUCHER_TYPEHASH = keccak256(
        "WaterVoucher(address citizen,uint256 currentReading,string meterId,uint256 nonce,uint256 deadline)"
    );

    uint256 public constant BPS_DENOMINATOR = 10000;

    BELTToken public immutable beltToken;
    ICitizenReputation public reputationContract;

    // Vatandaşın son sayaç endeksi ve geçmiş tüketim ortalaması (m3)
    mapping(address => uint256) public lastReading;
    mapping(address => uint256) public historicalAvgConsumption;
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // Matematiksel Ödül Modeli Parametreleri
    uint256 public defaultBaselineConsumption = 20; // Varsayılan aylık referans tüketim (20 m3)
    uint256 public baseDeclarationReward = 10 * 10**18; // Zamanında dürüst beyan baz ödülü (10 BELT)
    uint256 public savingBonusPerM3 = 5 * 10**18; // Tasarruf edilen her 1 m3 için bonus (5 BELT)

    bool public paused;

    event BillPaid(
        address indexed user,
        string meterId,
        uint256 newReading,
        uint256 consumption,
        uint256 savedM3,
        uint256 rewardAmount,
        uint256 nonce
    );
    event HistoricalAvgUpdated(address indexed user, uint256 newAvg);
    event RewardParametersUpdated(uint256 baselineM3, uint256 baseReward, uint256 bonusPerM3);
    event ConvertedToFiatCard(address indexed citizen, uint256 beltBurned, uint256 fiatEquivalent);
    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid address");
        _;
    }

    constructor(
        address _beltToken,
        address _reputationContract
    ) EIP712("EcoCivicWaterBilling", "1") validAddress(_beltToken) {
        beltToken = BELTToken(_beltToken);
        if (_reputationContract != address(0)) {
            reputationContract = ICitizenReputation(_reputationContract);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_SIGNER_ROLE, msg.sender);
    }

    /**
     * @notice AI Oracle tarafından EIP-712 ile imzalanmış su sayacı endeksini doğrular,
     *         tüketim tasarrufunu hesaplar ve İtibar Skoru (R_i) çarpanıyla BELT ödülü basar.
     * @dev Ters Teşvik Çözümü: Fazla su harcayan daha çok ödül ALAMAZ. Yalnızca geçmiş
     *      ortalamasının altında su tüketen (tasarruf yapan) vatandaş tasarruf bonusu kazanır.
     */
    function payBill(
        address citizen,
        uint256 newReading,
        string calldata meterId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused nonReentrant validAddress(citizen) {
        require(block.timestamp <= deadline, "Voucher has expired");
        require(newReading > 0, "Reading must be > 0");
        require(bytes(meterId).length > 0, "Meter ID cannot be empty");
        require(!usedNonces[citizen][nonce], "Nonce already used");

        require(newReading > lastReading[citizen], "New reading must be greater than last reading");

        // EIP-712 İmza Doğrulaması
        _verifyVoucher(citizen, newReading, meterId, nonce, deadline, signature);

        // Replay Koruması & Sayaç Durumu Güncellemesi
        usedNonces[citizen][nonce] = true;
        uint256 consumption = newReading - lastReading[citizen];
        lastReading[citizen] = newReading;

        (uint256 savedM3, uint256 finalReward) = _processConsumptionAndReward(citizen, consumption);

        if (finalReward > 0) {
            beltToken.mint(citizen, finalReward);
        }

        emit BillPaid(citizen, meterId, newReading, consumption, savedM3, finalReward, nonce);
    }

    /**
     * @notice Evrensel Sanal Kart Köprüsü: Vatandaşın kazandığı BELT puanlarını yakarak
     *         sabit kurdan (1 BELT = 1.50 TL) EcoCivic Ön Ödemeli Sanal Kart bakiyesine aktarır.
     */
    function convertBeltToCardBalance(uint256 beltAmount)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 fiatEquivalent)
    {
        fiatEquivalent = beltToken.burnForVirtualCard(msg.sender, beltAmount);
        emit ConvertedToFiatCard(msg.sender, beltAmount, fiatEquivalent);
    }

    function _verifyVoucher(
        address citizen,
        uint256 newReading,
        string calldata meterId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                WATER_VOUCHER_TYPEHASH,
                citizen,
                newReading,
                keccak256(bytes(meterId)),
                nonce,
                deadline
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(hasRole(ORACLE_SIGNER_ROLE, signer), "Invalid oracle signature");
    }

    function _processConsumptionAndReward(
        address citizen,
        uint256 consumption
    ) internal returns (uint256 savedM3, uint256 finalReward) {
        uint256 referenceAvg = historicalAvgConsumption[citizen] > 0
            ? historicalAvgConsumption[citizen]
            : defaultBaselineConsumption;

        uint256 savingBonus = 0;
        if (consumption < referenceAvg) {
            savedM3 = referenceAvg - consumption;
            savingBonus = savedM3 * savingBonusPerM3;
        }

        finalReward = baseDeclarationReward + savingBonus;

        // Oyun Teorisi: İtibar Çarpanı (R_i) uygula ve dürüst beyan puanını (+5) işle
        if (address(reputationContract) != address(0)) {
            finalReward = (finalReward * reputationContract.getRewardMultiplierBps(citizen)) / BPS_DENOMINATOR;
            reputationContract.recordHonestAction(citizen);
        }

        // Hareketli Ortalama (EMA) ile vatandaşın geçmiş tüketim ortalamasını güncelle
        uint256 updatedAvg = (referenceAvg * 3 + consumption) / 4;
        if (updatedAvg == 0) {
            updatedAvg = 1;
        }
        historicalAvgConsumption[citizen] = updatedAvg;
    }

    /**
     * @notice Vatandaşın başlangıç/geçmiş tüketim ortalamasını ayarlar.
     */
    function setHistoricalAvgConsumption(address citizen, uint256 avgM3)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(citizen)
    {
        require(avgM3 > 0, "Average must be > 0");
        historicalAvgConsumption[citizen] = avgM3;
        emit HistoricalAvgUpdated(citizen, avgM3);
    }

    /**
     * @notice Ödül ve tasarruf parametrelerini günceller.
     */
    function setRewardParameters(
        uint256 _baselineM3,
        uint256 _baseReward,
        uint256 _bonusPerM3
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_baselineM3 > 0, "Baseline must be > 0");
        defaultBaselineConsumption = _baselineM3;
        baseDeclarationReward = _baseReward;
        savingBonusPerM3 = _bonusPerM3;
        emit RewardParametersUpdated(_baselineM3, _baseReward, _bonusPerM3);
    }

    /**
     * @notice Acil durumlarda kontratı durdurur.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Durdurulmuş kontratı yeniden aktif eder.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }
}
