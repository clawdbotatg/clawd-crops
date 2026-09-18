// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { Crops, ITrustMAttest } from "../contracts/Crops.sol";

/// Stands in for TrustMAttest: says which keys are attested.
contract AttestStub is ITrustMAttest {
    mapping(bytes32 => bool) public attested;

    function set(bytes32 keyId, bool ok) external {
        attested[keyId] = ok;
    }
}

/// A P-256 key we hold (vm.signP256), attested in the stub, plays the chip.
contract CropsTest is Test {
    uint256 constant CHIP_PRIV = 0xA11CE;
    uint256 constant OTHER_PRIV = 0xB0B;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);

    AttestStub attest;
    Crops crops;
    bytes32 x;
    bytes32 y;
    bytes32 keyId;

    function setUp() public {
        (uint256 px, uint256 py) = vm.publicKeyP256(CHIP_PRIV);
        (x, y) = (bytes32(px), bytes32(py));
        attest = new AttestStub();
        crops = new Crops(attest);
        keyId = crops.keyIdOf(x, y);
        attest.set(keyId, true);
        vm.warp(1_800_000_000);
    }

    function sign(uint256 priv, address to, uint256 deadline, uint256 n) internal view returns (bytes32 r, bytes32 s) {
        return vm.signP256(priv, crops.harvestDigest(keyId, to, deadline, n));
    }

    function testHarvestMintsToTheSignedAddressNotTheSender() public {
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, block.timestamp + 1 hours, 0);
        vm.prank(BOB); // anyone may relay; the tokens still go to ALICE
        crops.harvest(x, y, ALICE, block.timestamp + 1 hours, r, s);
        assertEq(crops.balanceOf(ALICE), 5e18);
        assertEq(crops.balanceOf(BOB), 0);
        assertEq(crops.nonce(keyId), 1);
        assertEq(crops.nextHarvest(keyId), block.timestamp + 5 hours);
    }

    function testCannotHarvestTwiceInFiveHours() public {
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, dl, 0);
        crops.harvest(x, y, ALICE, dl, r, s);
        (r, s) = sign(CHIP_PRIV, ALICE, dl, 1); // fresh, correct signature, just too early
        vm.expectRevert(abi.encodeWithSelector(Crops.TooSoon.selector, block.timestamp + 5 hours));
        crops.harvest(x, y, ALICE, dl, r, s);
        vm.warp(block.timestamp + 5 hours - 1);
        vm.expectRevert(abi.encodeWithSelector(Crops.TooSoon.selector, block.timestamp + 1));
        crops.harvest(x, y, ALICE, dl + 5 hours, r, s);
    }

    function testHarvestAgainAfterFiveHours() public {
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, dl, 0);
        crops.harvest(x, y, ALICE, dl, r, s);
        vm.warp(block.timestamp + 5 hours);
        dl = block.timestamp + 1 hours;
        (r, s) = sign(CHIP_PRIV, BOB, dl, 1); // same chip, different wallet this time: fine, cooldown is per chip
        crops.harvest(x, y, BOB, dl, r, s);
        assertEq(crops.balanceOf(ALICE), 5e18);
        assertEq(crops.balanceOf(BOB), 5e18);
    }

    function testSameSignatureCannotBeReplayed() public {
        uint256 dl = block.timestamp + 10 hours;
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, dl, 0);
        crops.harvest(x, y, ALICE, dl, r, s);
        vm.warp(block.timestamp + 5 hours); // cooldown over, deadline still good: only the nonce stops it
        vm.expectRevert(Crops.BadSignature.selector);
        crops.harvest(x, y, ALICE, dl, r, s);
    }

    function testExpiredSignatureFails() public {
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, dl, 0);
        vm.warp(dl + 1);
        vm.expectRevert(Crops.Expired.selector);
        crops.harvest(x, y, ALICE, dl, r, s);
    }

    function testFrontRunnerCannotRedirectTokens() public {
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, dl, 0);
        vm.prank(BOB);
        vm.expectRevert(Crops.BadSignature.selector); // BOB swapped `to`: the digest no longer matches
        crops.harvest(x, y, BOB, dl, r, s);
    }

    function testUnattestedKeyFails() public {
        (uint256 px, uint256 py) = vm.publicKeyP256(OTHER_PRIV);
        bytes32 otherId = crops.keyIdOf(bytes32(px), bytes32(py));
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = vm.signP256(OTHER_PRIV, crops.harvestDigest(otherId, ALICE, dl, 0));
        vm.expectRevert(Crops.NotAChip.selector);
        crops.harvest(bytes32(px), bytes32(py), ALICE, dl, r, s);
    }

    function testSignatureForAnotherDeploymentFails() public {
        Crops other = new Crops(attest); // same chip, same fields, different contract address in the digest
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = vm.signP256(CHIP_PRIV, other.harvestDigest(keyId, ALICE, dl, 0));
        vm.expectRevert(Crops.BadSignature.selector);
        crops.harvest(x, y, ALICE, dl, r, s);
    }

    function testHighSIsFolded() public {
        uint256 dl = block.timestamp + 1 hours;
        (bytes32 r, bytes32 s) = sign(CHIP_PRIV, ALICE, dl, 0);
        uint256 n = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;
        crops.harvest(x, y, ALICE, dl, r, bytes32(n - uint256(s))); // the chip may hand back the high-s twin
        assertEq(crops.balanceOf(ALICE), 5e18);
    }
}
