// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { P256 } from "@openzeppelin/contracts/utils/cryptography/P256.sol";

interface ITrustMAttest {
    function attested(bytes32 keyId) external view returns (bool);
}

/**
 * CROPS: a real Infineon Trust M chip can harvest 5 CROPS every 5 hours.
 *
 *  The chip signs a harvest message off chain (on the device, after a button press). Anyone can bring that
 *  signature here; the tokens go to the `to` address inside the signed message, never to msg.sender, so
 *  front-running a harvest just pays the gas for someone else.
 *
 *  What the chip signs is bound to this contract and nothing else:
 *    digest = keccak256(abi.encode(DOMAIN, block.chainid, address(this), keyId, to, deadline, nonce))
 *  DOMAIN namespaces it, chainid + address(this) pin it to this deployment, nonce makes it one-time,
 *  deadline stops anyone sitting on it. keyId is the chip's public key, which must be attested in
 *  TrustMAttest (a certificate signed by Infineon's CA). The 5 hour cooldown is per chip key, so one chip
 *  cannot farm with many addresses.
 */
contract Crops is ERC20 {
    ITrustMAttest public immutable attest;

    bytes32 public constant DOMAIN = keccak256("CROPS.harvest.v1");
    uint256 public constant COOLDOWN = 5 hours;
    uint256 public constant REWARD = 5e18;

    uint256 private constant N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;
    uint256 private constant HALF_N = 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8;

    mapping(bytes32 keyId => uint256) public lastHarvest;
    mapping(bytes32 keyId => uint256) public nonce;

    event Harvest(bytes32 indexed keyId, address indexed to, uint256 nonce);

    error NotAChip();
    error Expired();
    error TooSoon(uint256 readyAt);
    error BadSignature();

    constructor(ITrustMAttest _attest) ERC20("Crops", "CROPS") {
        attest = _attest;
    }

    function keyIdOf(bytes32 x, bytes32 y) public pure returns (bytes32) {
        return keccak256(abi.encode(x, y));
    }

    /// What the chip must sign for its next harvest.
    function harvestDigest(bytes32 keyId, address to, uint256 deadline, uint256 n) public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN, block.chainid, address(this), keyId, to, deadline, n));
    }

    /// 0 for a chip that never harvested, else the timestamp its next harvest is allowed.
    function nextHarvest(bytes32 keyId) public view returns (uint256) {
        uint256 last = lastHarvest[keyId];
        return last == 0 ? 0 : last + COOLDOWN;
    }

    /// @param x,y      the chip's public key (attested in TrustMAttest)
    /// @param to       who gets the 5 CROPS; part of the signed digest
    /// @param deadline last block.timestamp this signature is good for; part of the signed digest
    /// @param r,s      the chip's P-256 signature over harvestDigest(keyId, to, deadline, nonce[keyId])
    function harvest(bytes32 x, bytes32 y, address to, uint256 deadline, bytes32 r, bytes32 s) external {
        bytes32 keyId = keyIdOf(x, y);
        if (!attest.attested(keyId)) revert NotAChip();
        if (block.timestamp > deadline) revert Expired();
        uint256 ready = nextHarvest(keyId);
        if (block.timestamp < ready) revert TooSoon(ready);
        uint256 n = nonce[keyId];
        if (!P256.verify(harvestDigest(keyId, to, deadline, n), r, lowS(s), x, y)) revert BadSignature();
        nonce[keyId] = n + 1;
        lastHarvest[keyId] = block.timestamp;
        _mint(to, REWARD);
        emit Harvest(keyId, to, n);
    }

    function lowS(bytes32 s) public pure returns (bytes32) {
        return uint256(s) > HALF_N ? bytes32(N - uint256(s)) : s;
    }
}
