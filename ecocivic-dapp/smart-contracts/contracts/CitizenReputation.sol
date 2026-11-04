// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ICitizenReputation.sol";

/**
 * @title CitizenReputation
 * @notice Mahremiyet Odaklı, Devredilemez (Soulbound) Sivil İtibar Skoru (R_i) ve Oyun Teorisi Motoru.
 * @dev TÜBİTAK 2209-B "Akıllı Şehirlerde Hibrit Güven Modeli" kapsamında vatandaşların
 *      dürüst beyanlarını ödüllendiren, hile durumunda cezalandıran ve Nash Dengesi tabanlı
 *      dinamik teminat (Required Stake), ödül çarpanı (Reward Multiplier) ve denetim olasılığı
 *      (Audit Probability) hesaplayan modüldür.
 */
contract CitizenReputation is ICitizenReputation, AccessControl {
    bytes32 public constant REPUTATION_UPDATER_ROLE = keccak256("REPUTATION_UPDATER_ROLE");
    bytes32 public constant SLASHING_ROLE = keccak256("SLASHING_ROLE");

    uint256 public constant INITIAL_REPUTATION = 100;
    uint256 public constant MIN_REPUTATION = 10;
    uint256 public constant MAX_REPUTATION = 1000;
    uint256 public constant HONEST_INCREMENT = 5;
    uint256 public constant SLASH_PENALTY_PERCENT = 50; // %50 kesinti
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant BASE_AUDIT_PROBABILITY_BPS = 2000; // %20 baz denetim olasılığı
    uint256 public constant MIN_AUDIT_PROBABILITY_BPS = 200;   // %2 minimum rastgele denetim

    uint256 public baseRequiredStake;

    // Soulbound (devredilemez) vatandaş itibar eşlemesi
    mapping(address => uint256) private _reputationScores;
    mapping(address => bool) private _isInitialized;
    mapping(address => uint256) public honestActionsCount;
    mapping(address => uint256) public slashingCount;

    event ReputationUpdated(address indexed citizen, uint256 oldScore, uint256 newScore, string reason);
    event ReputationSlashed(address indexed citizen, uint256 oldScore, uint256 newScore);
    event BaseRequiredStakeUpdated(uint256 oldBaseStake, uint256 newBaseStake);

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid zero address");
        _;
    }

    constructor(uint256 _baseRequiredStake) {
        require(_baseRequiredStake > 0, "Base stake must be > 0");
        baseRequiredStake = _baseRequiredStake;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REPUTATION_UPDATER_ROLE, msg.sender);
        _grantRole(SLASHING_ROLE, msg.sender);
    }

    /**
     * @notice Vatandaşın güncel İtibar Skorunu (R_i) döner. Başlangıç skoru 100'dür.
     */
    function getReputation(address citizen) public view override returns (uint256) {
        if (!_isInitialized[citizen]) {
            return INITIAL_REPUTATION;
        }
        return _reputationScores[citizen];
    }

    /**
     * @notice Oyun Teorisi Formülü 1: Dinamik Minimum Teminat (Required Stake)
     * @dev S_req(R_i) = (S_base * R_init) / R_i
     *      İtibarı yüksek dürüst vatandaş daha az teminatla sistemde kalabilir;
     *      itibarı düşen riskli vatandaşın teminat şartı artar.
     */
    function getRequiredStake(address citizen) public view override returns (uint256) {
        uint256 rep = getReputation(citizen);
        return (baseRequiredStake * INITIAL_REPUTATION) / rep;
    }

    /**
     * @notice Oyun Teorisi Formülü 2: Dinamik Ödül Çarpanı (Basis Points, 10000 = 1.0x)
     * @dev R_i <= 100 ise doğrusal düşüş (örn. R_i=50 -> 5000 BPS = 0.5x)
     *      R_i > 100 ise her +1 puan için +10 BPS artış (örn. R_i=1000 -> 19000 BPS = 1.9x)
     */
    function getRewardMultiplierBps(address citizen) public view override returns (uint256) {
        uint256 rep = getReputation(citizen);
        if (rep <= INITIAL_REPUTATION) {
            return (rep * BPS_DENOMINATOR) / INITIAL_REPUTATION;
        }
        return BPS_DENOMINATOR + ((rep - INITIAL_REPUTATION) * 10);
    }

    /**
     * @notice Oyun Teorisi Formülü 3: Nash Dengesi Otonom Denetim Olasılığı p*(R_i)
     * @dev p*(R_i) = (p_base * R_init) / R_i (Min %2, Max %100)
     */
    function getAuditProbabilityBps(address citizen) public view override returns (uint256) {
        uint256 rep = getReputation(citizen);
        uint256 prob = (BASE_AUDIT_PROBABILITY_BPS * INITIAL_REPUTATION) / rep;
        if (prob > BPS_DENOMINATOR) {
            return BPS_DENOMINATOR;
        }
        if (prob < MIN_AUDIT_PROBABILITY_BPS) {
            return MIN_AUDIT_PROBABILITY_BPS;
        }
        return prob;
    }

    /**
     * @notice Dürüst su sayacı veya geri dönüşüm beyanı sonrası itibarı +5 artırır (Max 1000).
     */
    function recordHonestAction(address citizen)
        external
        override
        onlyRole(REPUTATION_UPDATER_ROLE)
        validAddress(citizen)
        returns (uint256 newScore)
    {
        uint256 oldScore = getReputation(citizen);
        _isInitialized[citizen] = true;

        newScore = oldScore + HONEST_INCREMENT;
        if (newScore > MAX_REPUTATION) {
            newScore = MAX_REPUTATION;
        }

        _reputationScores[citizen] = newScore;
        honestActionsCount[citizen] += 1;

        emit ReputationUpdated(citizen, oldScore, newScore, "HONEST_DECLARATION");
    }

    /**
     * @notice Hile yakalandığında (Slashing) vatandaşın itibar puanını %50 düşürür (Min 10).
     */
    function recordSlashing(address citizen)
        external
        override
        onlyRole(SLASHING_ROLE)
        validAddress(citizen)
        returns (uint256 newScore)
    {
        uint256 oldScore = getReputation(citizen);
        _isInitialized[citizen] = true;

        newScore = (oldScore * (100 - SLASH_PENALTY_PERCENT)) / 100;
        if (newScore < MIN_REPUTATION) {
            newScore = MIN_REPUTATION;
        }

        _reputationScores[citizen] = newScore;
        slashingCount[citizen] += 1;

        emit ReputationSlashed(citizen, oldScore, newScore);
    }

    /**
     * @notice Baz teminat tutarını günceller (Yalnızca Admin).
     */
    function setBaseRequiredStake(uint256 _newBaseStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newBaseStake > 0, "Base stake must be > 0");
        uint256 old = baseRequiredStake;
        baseRequiredStake = _newBaseStake;
        emit BaseRequiredStakeUpdated(old, _newBaseStake);
    }
}
