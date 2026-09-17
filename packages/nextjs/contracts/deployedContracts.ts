/**
 * Deployed contracts, keyed by chain id. TrustMAttest on mainnet was deployed 2026-09-17
 * (tx 0xefc6d8824ef1faf44b1710cb9795049a0e6540afc388d07c5bb3ebcbfce7c2f0), verified on Etherscan.
 * `yarn deploy --network <chain>` regenerates this file for a new deployment.
 */
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const deployedContracts = {
  1: {
    TrustMAttest: {
      address: "0xC868770aFA2a7b7975c1a7d7Ec2fc979bbe4AB99",
      abi: [
        {
          type: "constructor",
          inputs: [
            {
              name: "_caX",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "_caY",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "attest",
          inputs: [
            {
              name: "cert",
              type: "bytes",
              internalType: "bytes",
            },
            {
              name: "tbsStart",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "tbsLen",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "pkOffset",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "r",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "s",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          outputs: [
            {
              name: "x",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "y",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "attested",
          inputs: [
            {
              name: "keyId",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "caX",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "caY",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "isChipSignature",
          inputs: [
            {
              name: "x",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "y",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "hash",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "r",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "s",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "keyIdOf",
          inputs: [
            {
              name: "x",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "y",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "pure",
        },
        {
          type: "function",
          name: "lowS",
          inputs: [
            {
              name: "s",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "pure",
        },
        {
          type: "event",
          name: "Attested",
          inputs: [
            {
              name: "keyId",
              type: "bytes32",
              indexed: true,
              internalType: "bytes32",
            },
            {
              name: "x",
              type: "bytes32",
              indexed: false,
              internalType: "bytes32",
            },
            {
              name: "y",
              type: "bytes32",
              indexed: false,
              internalType: "bytes32",
            },
          ],
          anonymous: false,
        },
        {
          type: "error",
          name: "BadKeyOffset",
          inputs: [],
        },
        {
          type: "error",
          name: "CertNotSignedByCA",
          inputs: [],
        },
        {
          type: "error",
          name: "NotP256Key",
          inputs: [],
        },
      ],
      inheritedFunctions: {},
      deployedOnBlock: 25999493,
    },
  },
} as const;

export default deployedContracts satisfies GenericContractsDeclaration;
