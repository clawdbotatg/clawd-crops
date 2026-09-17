// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DeployHelpers.s.sol";
import { TrustMAttest } from "../contracts/TrustMAttest.sol";

/// Pins the public key of "Infineon OPTIGA(TM) Trust M CA 101", the CA that signed the factory certificate
/// in our chip. Other chips may come from CA 300; read the cert's issuer (tools/cert.py prints it).
contract DeployTrustMAttest is ScaffoldETHDeploy {
    bytes32 constant CA101_X = 0x97337734ad7423a14bf40fd4ee1d27af8ed05ae87970c74dfe29889b499ad2d0;
    bytes32 constant CA101_Y = 0x1ea249ae7910f052c59d85514a8215e2d63e4730cdfb5cc153bbcc00a7e6408b;

    function run() external ScaffoldEthDeployerRunner {
        new TrustMAttest(CA101_X, CA101_Y);
    }
}
