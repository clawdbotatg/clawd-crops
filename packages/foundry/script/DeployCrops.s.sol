// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DeployHelpers.s.sol";
import { TrustMAttest } from "../contracts/TrustMAttest.sol";
import { Crops, ITrustMAttest } from "../contracts/Crops.sol";

/// Deploys the chip registry and the token that trusts it, together, so they always match.
contract DeployCrops is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        TrustMAttest attest = new TrustMAttest();
        new Crops(ITrustMAttest(address(attest)));
    }
}
