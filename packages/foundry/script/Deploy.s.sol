//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployCrops } from "./DeployCrops.s.sol";

contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        new DeployCrops().run();
    }
}
