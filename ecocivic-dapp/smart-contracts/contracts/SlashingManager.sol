// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./EcoCivicDeposit.sol";
import "./BELTToken.sol";
import "./interfaces/ICitizenReputation.sol";

/**
 * @title SlashingManager
 * @notice Oyun Teorisi Tabanlı Otonom Ceza (Slashing), İtibar Kesintisi ve
 *         Ceza Fonu Dağıtım (Denetçi Ödülü + Belediye Çevre Fonu) Kontratı.
 */
contract SlashingManager is AccessControl, ReentrancyGuard {
    bytes32 public constant SLASHING_ROLE = keccak256("SLASHING_ROLE");

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_INSPECTOR_REWARD_BPS = 5000; // Maksimum %50 ihbarcı/denetçi payı

    EcoCivicDeposit public immutable depositContract;
    ICitizenReputation public immutable reputationContract;
    BELTToken public beltToken;

    address public treasuryAddress;
    uint256 public inspectorRewardBps = 2000; // Varsayılan %20 Denetçi/İhbarcı, %80 Belediye Çevre Fonu
    uint256 public undistributedSlashedFunds;

    mapping(address => uint256) public totalSlashedByUser;

    event UserSlashed(
        address indexed user,
        uint256 amount,
        uint256 newReputation,
        string reason
    );
    event SlashedFundsDistributed(
        address indexed inspector,
        uint256 inspectorReward,
        address indexed treasury,
        uint256 treasuryShare
    );
    event TokenPenaltyBurned(address indexed user, uint256 burnedAmount, string reason);
    event TreasuryAddressUpdated(address indexed oldTreasury, address indexed newTreasury);
    event InspectorRewardBpsUpdated(uint256 oldBps, uint256 newBps);

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid zero address");
        _;
    }

    constructor(
        address _depositContract,
        address _reputationContract,
        address _treasuryAddress,
        address _beltToken
    )
        validAddress(_depositContract)
        validAddress(_reputationContract)
        validAddress(_treasuryAddress)
    {
        depositContract = EcoCivicDeposit(_depositContract);
        reputationContract = ICitizenReputation(_reputationContract);
        treasuryAddress = _treasuryAddress;
        if (_beltToken != address(0)) {
            beltToken = BELTToken(_beltToken);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SLASHING_ROLE, msg.sender);
    }

    /**
     * @notice Kural ihlali veya hile yakalandığında vatandaşın teminatından kesinti yapar
     *         ve İtibar Skorunu (R_i) %50 düşürür.
     */
    function slashUser(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyRole(SLASHING_ROLE) validAddress(user) nonReentrant {
        _executeSlash(user, amount, reason);
    }

    /**
     * @notice Kesilen ceza fonlarını ihbarcı/denetçi (Inspector) ve Belediye Çevre Fonu
     *         (treasuryAddress) arasında paylaştırır. Fonların kontratta kilitli kalmasını önler.
     */
    function distributeSlashedFunds(
        address inspector,
        uint256 amount
    ) external onlyRole(SLASHING_ROLE) validAddress(inspector) nonReentrant {
        _distribute(inspector, amount);
    }

    /**
     * @notice Tek işlemde hem teminat kesintisi + itibar düşürme yapar hem de kesilen
     *         fonu denetçi ve Belediye Çevre Fonu arasında dağıtır.
     */
    function slashAndDistribute(
        address user,
        uint256 amount,
        address inspector,
        string calldata reason
    )
        external
        onlyRole(SLASHING_ROLE)
        validAddress(user)
        validAddress(inspector)
        nonReentrant
    {
        _executeSlash(user, amount, reason);
        _distribute(inspector, amount);
    }

    /**
     * @notice Hileli ödül kazanan vatandaşın BELT token bakiyesinden kurallı ceza yakımı yapar.
     */
    function slashUserTokens(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyRole(SLASHING_ROLE) validAddress(user) nonReentrant {
        require(address(beltToken) != address(0), "BELT token not configured");
        beltToken.slashBurn(user, amount);
        emit TokenPenaltyBurned(user, amount, reason);
    }

    function _executeSlash(
        address user,
        uint256 amount,
        string calldata reason
    ) internal {
        require(amount > 0, "Amount must be > 0");

        uint256 currentDeposit = depositContract.getUserDeposit(user);
        require(amount <= currentDeposit, "Cannot slash more than user deposit");

        // 1. EcoCivicDeposit üzerinden kullanıcının bakiyesini düşür ve fonları çek
        depositContract.slashDeposit(user, amount, address(this));

        // 2. Oyun Teorisi: Vatandaşın İtibar Skorunu (R_i) %50 kesintiye uğrat
        uint256 newReputation = reputationContract.recordSlashing(user);

        // 3. Muhasebe kaydını güncelle
        undistributedSlashedFunds += amount;
        totalSlashedByUser[user] += amount;

        emit UserSlashed(user, amount, newReputation, reason);
    }

    function _distribute(address inspector, uint256 amount) internal {
        require(amount > 0, "Amount must be > 0");
        require(amount <= undistributedSlashedFunds, "Insufficient undistributed slashed funds");

        undistributedSlashedFunds -= amount;

        uint256 inspectorReward = (amount * inspectorRewardBps) / BPS_DENOMINATOR;
        uint256 treasuryShare = amount - inspectorReward;

        IERC20 token = depositContract.depositToken();

        if (inspectorReward > 0) {
            bool okInspector = token.transfer(inspector, inspectorReward);
            require(okInspector, "Inspector reward transfer failed");
        }

        if (treasuryShare > 0) {
            bool okTreasury = token.transfer(treasuryAddress, treasuryShare);
            require(okTreasury, "Treasury share transfer failed");
        }

        emit SlashedFundsDistributed(inspector, inspectorReward, treasuryAddress, treasuryShare);
    }

    /**
     * @notice Belediye Çevre Fonu (Treasury) adresini günceller.
     */
    function setTreasuryAddress(address _newTreasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(_newTreasury)
    {
        address old = treasuryAddress;
        treasuryAddress = _newTreasury;
        emit TreasuryAddressUpdated(old, _newTreasury);
    }

    /**
     * @notice İhbarcı/Denetçi ödül oranını (BPS) günceller (Max %50 = 5000 BPS).
     */
    function setInspectorRewardBps(uint256 _newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newBps <= MAX_INSPECTOR_REWARD_BPS, "Inspector reward exceeds maximum allowed");
        uint256 old = inspectorRewardBps;
        inspectorRewardBps = _newBps;
        emit InspectorRewardBpsUpdated(old, _newBps);
    }
}
