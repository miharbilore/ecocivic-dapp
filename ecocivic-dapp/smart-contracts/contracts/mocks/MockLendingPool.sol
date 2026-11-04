// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockLendingPool {
    mapping(address => mapping(address => uint256)) public deposits;

    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 /* referralCode */
    ) external {
        // Transfer tokens from the caller (EcoCivicDeposit) to this contract
        // The detailed Aave implementation issues aTokens, but for this mock
        // we just hold the funds and track the balance.
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        deposits[asset][onBehalfOf] += amount;
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        require(deposits[asset][msg.sender] >= amount, "Insufficient balance in Mock Pool");
        
        deposits[asset][msg.sender] -= amount;
        
        // Return funds
        IERC20(asset).transfer(to, amount);
        
        return amount;
    }
}
