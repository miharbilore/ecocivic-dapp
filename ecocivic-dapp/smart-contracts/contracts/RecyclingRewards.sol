// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./BELTToken.sol";
import "./interfaces/ICitizenReputation.sol";

/**
 * @title RecyclingRewards
 * @notice EIP-712 Kriptografik AI/Kiosk Oracle Doğrulamalı ve İtibar Skoru (R_i)
 *         Çarpanlı Geri Dönüşüm Ödül Kontratı.
 */
contract RecyclingRewards is AccessControl, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    bytes32 public constant ORACLE_SIGNER_ROLE = keccak256("ORACLE_SIGNER_ROLE");

    bytes32 public constant RECYCLING_VOUCHER_TYPEHASH = keccak256(
        "RecyclingVoucher(address citizen,uint8 material,uint256 amount,string qrHash,uint256 nonce,uint256 deadline)"
    );

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_BASE_AMOUNT = 10000 * 10**18;

    enum MaterialType {
        Glass,
        Paper,
        Metal
    }

    BELTToken public immutable beltToken;
    ICitizenReputation public reputationContract;

    mapping(MaterialType => uint256) public rewardMultiplier;
    mapping(string => bool) public usedQrHashes;
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    bool public paused;

    event RewardGranted(
        address indexed user,
        MaterialType material,
        uint256 baseReward,
        uint256 finalReward,
        string qrHash,
        uint256 nonce
    );
    event Paused(address account);
    event Unpaused(address account);
    event RewardMultiplierUpdated(MaterialType material, uint256 newMultiplier);
    event ReputationContractUpdated(address indexed newReputationContract);

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
    ) EIP712("EcoCivicRecyclingRewards", "1") validAddress(_beltToken) {
        beltToken = BELTToken(_beltToken);
        if (_reputationContract != address(0)) {
            reputationContract = ICitizenReputation(_reputationContract);
        }

        // Malzeme baz katsayıları (10 = 1.0x, 15 = 1.5x, 20 = 2.0x)
        rewardMultiplier[MaterialType.Glass] = 10;
        rewardMultiplier[MaterialType.Paper] = 15;
        rewardMultiplier[MaterialType.Metal] = 20;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_SIGNER_ROLE, msg.sender);
    }

    /**
     * @notice EIP-712 Cryptographic Voucher ile doğrulanmış geri dönüşüm ödül talebi.
     *         İmzasız çağrılar ve tekrar kullanılan (replay) nonce/qrHash değerleri reddedilir.
     */
    function rewardRecycling(
        address citizen,
        MaterialType material,
        uint256 baseAmount,
        string calldata qrHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused nonReentrant validAddress(citizen) {
        require(block.timestamp <= deadline, "Voucher has expired");
        require(baseAmount > 0, "Base amount must be > 0");
        require(baseAmount <= MAX_BASE_AMOUNT, "Base amount exceeds maximum");
        require(bytes(qrHash).length > 0, "QR hash cannot be empty");
        require(!usedQrHashes[qrHash], "QR hash already used");
        require(!usedNonces[citizen][nonce], "Nonce already used");
        require(uint8(material) <= uint8(MaterialType.Metal), "Invalid material type");

        // EIP-712 İmza Doğrulaması
        _verifyVoucher(citizen, material, baseAmount, qrHash, nonce, deadline, signature);

        // Replay Koruması: Durumu güncelle
        usedQrHashes[qrHash] = true;
        usedNonces[citizen][nonce] = true;

        // Baz ödül hesabı
        uint256 baseReward = (baseAmount * rewardMultiplier[material]) / 10;
        require(baseReward > 0, "Reward calculation resulted in zero");

        // Oyun Teorisi: Vatandaş İtibar Çarpanı (R_i) uygula ve dürüst beyan puanı ekle
        uint256 finalReward = baseReward;
        if (address(reputationContract) != address(0)) {
            finalReward = (baseReward * reputationContract.getRewardMultiplierBps(citizen)) / BPS_DENOMINATOR;
            reputationContract.recordHonestAction(citizen);
        }

        beltToken.mint(citizen, finalReward);

        emit RewardGranted(citizen, material, baseReward, finalReward, qrHash, nonce);
    }

    function _verifyVoucher(
        address citizen,
        MaterialType material,
        uint256 baseAmount,
        string calldata qrHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                RECYCLING_VOUCHER_TYPEHASH,
                citizen,
                uint8(material),
                baseAmount,
                keccak256(bytes(qrHash)),
                nonce,
                deadline
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(hasRole(ORACLE_SIGNER_ROLE, signer), "Invalid oracle signature");
    }

    /**
     * @notice Malzeme ödül çarpanını günceller (Yalnızca Admin).
     */
    function setRewardMultiplier(MaterialType material, uint256 multiplier)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(multiplier > 0, "Multiplier must be > 0");
        require(multiplier <= 100, "Multiplier too high");

        rewardMultiplier[material] = multiplier;
        emit RewardMultiplierUpdated(material, multiplier);
    }

    /**
     * @notice İtibar kontratı adresini günceller.
     */
    function setReputationContract(address _reputationContract)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(_reputationContract)
    {
        reputationContract = ICitizenReputation(_reputationContract);
        emit ReputationContractUpdated(_reputationContract);
    }

    /**
     * @notice QR hash'in daha önce kullanılıp kullanılmadığını döner.
     */
    function isQrHashUsed(string calldata qrHash) external view returns (bool) {
        return usedQrHashes[qrHash];
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
