// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title BELTToken (Belediye Eco Token)
 * @notice RBAC (Role-Based Access Control) tabanlı, çoklu kontrat basım (mint) ve
 *         kurallı yakım (burn/slash) yetkisine sahip ERC-20 ödül tokenı.
 */
contract BELTToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant SLASHING_ROLE = keccak256("SLASHING_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 Milyar BELT
    uint256 public constant MAX_SLASH_PERCENT = 50; // Tek seferde en fazla %50 token cezası kesilebilir
    uint256 public constant FIAT_CONVERSION_RATE_BPS = 15000; // 1 BELT = 1.50 TL (15000 / 10000)

    bool public paused;
    mapping(address => uint256) public totalConvertedFiatTry;

    event Paused(address account);
    event Unpaused(address account);
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    event SlashedTokensBurned(address indexed offender, address indexed slasher, uint256 amount);
    event ConvertedToFiatCard(address indexed citizen, uint256 beltBurned, uint256 fiatEquivalent);

    modifier whenNotPaused() {
        require(!paused, "Token operations are paused");
        _;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid address");
        _;
    }

    constructor() ERC20("Belediye Eco Token", "BELT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
    }

    /**
     * @notice Yetkili kontratlar (RecyclingRewards, WaterBilling vb.) tarafından yeni BELT basımı.
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        validAddress(to)
    {
        require(amount > 0, "Amount must be > 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "Minting would exceed max supply");

        _mint(to, amount);
        emit Minted(to, amount);
    }

    /**
     * @notice Kullanıcının kendi bakiyesinden token yakması.
     */
    function burn(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        _burn(msg.sender, amount);
        emit Burned(msg.sender, amount);
    }

    /**
     * @notice Evrensel Sanal Kart Köprüsü (Token-to-Fiat Virtual Card Bridge):
     *         Vatandaşın kazandığı BELT tokenlarını yakarak sabit kurdan (1 BELT = 1.50 TL)
     *         EcoCivic Ön Ödemeli Sanal Kart TL bakiyesine dönüştürür.
     */
    function convertBeltToCardBalance(uint256 beltAmount)
        external
        whenNotPaused
        returns (uint256 fiatEquivalent)
    {
        require(beltAmount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= beltAmount, "Insufficient balance");

        fiatEquivalent = (beltAmount * FIAT_CONVERSION_RATE_BPS) / 10000;
        _burn(msg.sender, beltAmount);
        totalConvertedFiatTry[msg.sender] += fiatEquivalent;

        emit Burned(msg.sender, beltAmount);
        emit ConvertedToFiatCard(msg.sender, beltAmount, fiatEquivalent);
    }

    /**
     * @notice Yetkili kontratlar (WaterBilling vb.) üzerinden vatandaşın bizzat tetiklediği
     *         sanal kart dönüşüm yakımı.
     */
    function burnForVirtualCard(address citizen, uint256 beltAmount)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
        validAddress(citizen)
        returns (uint256 fiatEquivalent)
    {
        require(beltAmount > 0, "Amount must be > 0");
        require(balanceOf(citizen) >= beltAmount, "Insufficient balance");

        fiatEquivalent = (beltAmount * FIAT_CONVERSION_RATE_BPS) / 10000;
        _burn(citizen, beltAmount);
        totalConvertedFiatTry[citizen] += fiatEquivalent;

        emit Burned(citizen, beltAmount);
        emit ConvertedToFiatCard(citizen, beltAmount, fiatEquivalent);
    }

    /**
     * @notice Güvenli burnFrom: Allowance bypass açığı kapatılmıştır.
     *         Yalnızca BURNER_ROLE yetkisine sahip adresler, kullanıcının verdiği
     *         harcama onayı (allowance) dahilinde yakım yapabilir.
     */
    function burnFrom(address account, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
        validAddress(account)
    {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf(account) >= amount, "Insufficient balance");

        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
        emit Burned(account, amount);
    }

    /**
     * @notice Yetkili Ceza Kontratı (SLASHING_ROLE) tarafından kurallı ceza yakımı.
     *         Keyfi müsadereleri önlemek için tek işlemde kullanıcının bakiyesinin
     *         en fazla %50'si yakılabilir.
     */
    function slashBurn(address offender, uint256 amount)
        external
        onlyRole(SLASHING_ROLE)
        whenNotPaused
        validAddress(offender)
    {
        require(amount > 0, "Amount must be > 0");
        uint256 offenderBalance = balanceOf(offender);
        require(offenderBalance >= amount, "Insufficient balance");

        uint256 maxAllowedSlash = (offenderBalance * MAX_SLASH_PERCENT) / 100;
        require(amount <= maxAllowedSlash, "Slash amount exceeds maximum allowed percentage");

        _burn(offender, amount);
        emit SlashedTokensBurned(offender, msg.sender, amount);
    }

    /**
     * @notice Acil durumlarda token transferlerini durdurur.
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

    /**
     * @notice Transfer override - pause ve sıfır adres kontrolü.
     */
    function transfer(address to, uint256 amount)
        public
        virtual
        override
        whenNotPaused
        validAddress(to)
        returns (bool)
    {
        return super.transfer(to, amount);
    }

    /**
     * @notice TransferFrom override - pause ve sıfır adres kontrolü.
     */
    function transferFrom(address from, address to, uint256 amount)
        public
        virtual
        override
        whenNotPaused
        validAddress(from)
        validAddress(to)
        returns (bool)
    {
        return super.transferFrom(from, to, amount);
    }
}
