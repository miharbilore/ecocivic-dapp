// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAave {
    /**
     * @notice Aave'ye token yatırma
     * @param asset Yatırılan token adresi (örn. USDC)
     * @param amount Miktar
     * @param onBehalfOf Kimin adına yatırılıyor
     * @param referralCode Referral (genelde 0)
     */
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice Aave'den token çekme
     * @param asset Çekilecek token
     * @param amount Miktar
     * @param to Tokenların gönderileceği adres
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}
