// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICitizenReputation
 * @notice Oyun Teorisi ve Dinamik Vatandaş İtibar Skoru (R_i) Arayüzü
 */
interface ICitizenReputation {
    function getReputation(address citizen) external view returns (uint256);
    function getRequiredStake(address citizen) external view returns (uint256);
    function getRewardMultiplierBps(address citizen) external view returns (uint256);
    function getAuditProbabilityBps(address citizen) external view returns (uint256);
    function recordHonestAction(address citizen) external returns (uint256 newScore);
    function recordSlashing(address citizen) external returns (uint256 newScore);
}
