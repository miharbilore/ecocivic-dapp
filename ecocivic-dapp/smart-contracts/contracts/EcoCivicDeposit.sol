// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAave.sol";
import "./interfaces/ICitizenReputation.sol";

/**
 * @title EcoCivicDeposit
 * @notice Modüler DeFi (Aave) Teminat Havuzu ve Vatandaş İtibar Skoru (R_i) Entegrasyonlu Escrow Kontratı.
 * @dev Muhasebe bütünlüğü (userDeposits senkronizasyonu), ReentrancyGuard koruması,
 *      aktif ceza/inceleme kilidi kontrolü ve dinamik teminat yeterliliği doğrulaması içerir.
 */
contract EcoCivicDeposit is AccessControl, ReentrancyGuard {
    bytes32 public constant SLASHING_ROLE = keccak256("SLASHING_ROLE");

    IERC20 public immutable depositToken;
    IAave public immutable aaveLendingPool;
    ICitizenReputation public reputationContract;

    mapping(address => uint256) public userDeposits;
    mapping(address => bool) public hasActivePenaltyLock;
    uint256 public totalDeposits;
    bool public paused;

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);
    event CitizenWithdrawn(address indexed user, uint256 amount, uint256 remainingBalance);
    event DepositSlashed(address indexed user, address indexed recipient, uint256 amount, uint256 remainingBalance);
    event PenaltyLockUpdated(address indexed user, bool isLocked);
    event ReputationContractUpdated(address indexed newReputationContract);
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
        address _depositToken,
        address _aaveLendingPool,
        address _reputationContract
    ) {
        require(_depositToken != address(0), "Invalid deposit token address");
        require(_aaveLendingPool != address(0), "Invalid Aave lending pool address");

        depositToken = IERC20(_depositToken);
        aaveLendingPool = IAave(_aaveLendingPool);
        if (_reputationContract != address(0)) {
            reputationContract = ICitizenReputation(_reputationContract);
        }

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SLASHING_ROLE, msg.sender);
    }

    /**
     * @notice Vatandaş teminat yatırır ve fonlar Aave likidite havuzuna yönlendirilir.
     */
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");

        bool success = depositToken.transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");

        userDeposits[msg.sender] += amount;
        totalDeposits += amount;

        bool approved = depositToken.approve(address(aaveLendingPool), amount);
        require(approved, "Token approval failed");

        aaveLendingPool.deposit(
            address(depositToken),
            amount,
            address(this),
            0
        );

        emit Deposited(msg.sender, amount, userDeposits[msg.sender]);
    }

    /**
     * @notice Vatandaşın kendi teminatını güvenli şekilde çekmesi.
     *         Üzerinde aktif bir inceleme/ceza kilidi (hasActivePenaltyLock) varsa çekim engellenir.
     */
    function withdrawCitizenDeposit(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(!hasActivePenaltyLock[msg.sender], "Citizen has an active penalty/investigation lock");
        require(userDeposits[msg.sender] >= amount, "Insufficient deposit balance");

        // Checks-Effects-Interactions: Önce iç muhasebeyi güncelle
        userDeposits[msg.sender] -= amount;
        totalDeposits -= amount;

        uint256 withdrawn = aaveLendingPool.withdraw(
            address(depositToken),
            amount,
            address(this)
        );
        require(withdrawn == amount, "Withdrawal amount mismatch");

        bool success = depositToken.transfer(msg.sender, withdrawn);
        require(success, "Token transfer to citizen failed");

        emit CitizenWithdrawn(msg.sender, withdrawn, userDeposits[msg.sender]);
    }

    /**
     * @notice SlashingManager (veya SLASHING_ROLE) tarafından kural ihlali yapan
     *         vatandaşın teminatından kesinti yapılması.
     *         Kullanıcının userDeposits bakiyesi kuruşu kuruşuna düşürülür.
     */
    function slashDeposit(
        address user,
        uint256 amount,
        address recipient
    )
        external
        onlyRole(SLASHING_ROLE)
        validAddress(user)
        validAddress(recipient)
        nonReentrant
    {
        require(amount > 0, "Amount must be > 0");
        require(userDeposits[user] >= amount, "Cannot slash more than user deposit");

        // Checks-Effects-Interactions: İç muhasebe bakiyesini düşür
        userDeposits[user] -= amount;
        totalDeposits -= amount;

        uint256 withdrawn = aaveLendingPool.withdraw(
            address(depositToken),
            amount,
            address(this)
        );
        require(withdrawn == amount, "Slashed withdrawal failed");

        bool success = depositToken.transfer(recipient, withdrawn);
        require(success, "Token transfer to slashing manager failed");

        emit DepositSlashed(user, recipient, withdrawn, userDeposits[user]);
    }

    /**
     * @notice Şüpheli anomali durumunda vatandaşın teminat kaçırmasını (front-running)
     *         önlemek için teminat kilidi koyar veya kaldırır.
     */
    function setPenaltyLock(address user, bool isLocked)
        external
        onlyRole(SLASHING_ROLE)
        validAddress(user)
    {
        hasActivePenaltyLock[user] = isLocked;
        emit PenaltyLockUpdated(user, isLocked);
    }

    /**
     * @notice Kullanıcının yatırdığı güncel teminat bakiyesini döner.
     */
    function getUserDeposit(address user) external view returns (uint256) {
        return userDeposits[user];
    }

    /**
     * @notice Oyun Teorisi: Vatandaşın İtibar Skoruna (R_i) göre yatırması gereken
     *         minimum teminat miktarını döner.
     */
    function getRequiredStakeForUser(address user) public view returns (uint256) {
        if (address(reputationContract) == address(0)) {
            return 0;
        }
        return reputationContract.getRequiredStake(user);
    }

    /**
     * @notice Vatandaşın mevcut teminatının, itibar skoruna göre gerekli minimum teminatı
     *         karşılayıp karşılamadığını kontrol eder.
     */
    function hasSufficientStake(address user) external view returns (bool) {
        if (address(reputationContract) == address(0)) {
            return userDeposits[user] > 0;
        }
        return userDeposits[user] >= reputationContract.getRequiredStake(user);
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
     * @notice Acil durumlarda kontratı durdurur.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Durdurulmuş kontratı devam ettirir.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }
}
