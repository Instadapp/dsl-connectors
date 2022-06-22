import { expect, should } from "chai";
import hre, { ethers, waffle } from "hardhat";
import type { Signer, Contract } from "ethers";
import { BigNumber } from "bignumber.js";
import { buildDSAv2 } from "../../../scripts/tests/buildDSAv2";
import { addresses } from "../../../scripts/tests/optimism/addresses";
import { deployAndEnableConnector } from "../../../scripts/tests/deployAndEnableConnector";
import { abis } from "../../../scripts/constant/abis";
import { getMasterSigner } from "../../../scripts/tests/getMasterSigner";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { encodeSpells } from "../../../scripts/tests/encodeSpells";
import encodeFlashcastData from "../../../scripts/tests/encodeFlashcastData";
import { ConnectV2AaveV3ImportOptimism__factory, IERC20__factory } from "../../../typechain";
import axios from "axios";

const aDaiAddress = "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE";
const aaveAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
let account = "0x31efc4aeaa7c39e54a33fdc3c46ee2bd70ae0a09";
const DAI = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1";
const USDC = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";
const mnemonic = "test test test test test test test test test test test junk";
const connectorName = "AAVE-V3-IMPORT-X";
let signer: any, wallet0: any, wallet: any;

const ABI = [
  "function balanceOf(address account) public view returns (uint256)",
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

const aaveAbi = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "interestRateMode", type: "uint256" },
      { internalType: "uint16", name: "referralCode", type: "uint16" },
      { internalType: "address", name: "onBehalfOf", type: "address" }
    ],
    name: "borrow",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "onBehalfOf", type: "address" },
      { internalType: "uint16", name: "referralCode", type: "uint16" }
    ],
    name: "supply",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getUserAccountData",
    outputs: [
      {
        internalType: "uint256",
        name: "totalCollateralBase",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "totalDebtBase",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "availableBorrowsBase",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "currentLiquidationThreshold",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "ltv",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "healthFactor",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];

const erc20Abi = [
  {
    constant: false,
    inputs: [
      {
        name: "_spender",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      }
    ],
    name: "approve",
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    constant: true,
    inputs: [
      {
        name: "_owner",
        type: "address"
      }
    ],
    name: "balanceOf",
    outputs: [
      {
        name: "balance",
        type: "uint256"
      }
    ],
    payable: false,
    stateMutability: "view",
    type: "function"
  },
  {
    constant: false,
    inputs: [
      {
        name: "_to",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      }
    ],
    name: "transfer",
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function"
  }
];

const token = new ethers.Contract(DAI, erc20Abi);
const aDai = new ethers.Contract(aDaiAddress, ABI);
const usdcToken = new ethers.Contract(USDC, erc20Abi);
const aave = new ethers.Contract(aaveAddress, aaveAbi);

describe("Import Aave v3 Position for Optimism", function () {
  let dsaWallet0: any;
  let dsaWallet1: any;
  let dsaWallet2: any;
  let walletB: any;
  let walletBsigner: any;
  let masterSigner: Signer;
  let instaConnectorsV2: Contract;
  let connector: any;

  const wallet = ethers.Wallet.fromMnemonic(mnemonic);

  before(async () => {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            //@ts-ignore
            jsonRpcUrl: hre.config.networks.hardhat.forking.url,
            blockNumber: 10203000
          }
        }
      ]
    });
    masterSigner = await getMasterSigner();
    [wallet0] = await ethers.getSigners();
    await hre.network.provider.send("hardhat_setBalance", [account, ethers.utils.parseEther("10").toHexString()]);

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [account]
    });

    signer = await ethers.getSigner(account);

    await token.connect(signer).transfer(wallet0.address, ethers.utils.parseEther("10"));

    instaConnectorsV2 = await ethers.getContractAt(abis.core.connectorsV2, addresses.core.connectorsV2);
    connector = await deployAndEnableConnector({
      connectorName,
      contractArtifact: ConnectV2AaveV3ImportOptimism__factory,
      signer: masterSigner,
      connectors: instaConnectorsV2
    });
  });

  //creating user position for migrating
  describe("check user AAVE position", async () => {
    it("Should create Aave v3 position of DAI(collateral) and USDC(debt)", async () => {
      // approve DAI to aavePool
      await token.connect(wallet0).approve(aaveAddress, parseEther("10"));
      console.log("Approve DAI on aave");

      //deposit DAI in aave
      await aave.connect(wallet0).supply(DAI, parseEther("10"), wallet0.address, 3228);
      console.log("Supplied DAI on aave");

      //borrow USDC from aave
      await aave.connect(wallet0).borrow(USDC, parseUnits("1", 6), 2, 3228, wallet0.address);
      console.log("Borrowed USDC from aave");
    });

    it("Should check position of user", async () => {
      expect(await aDai.connect(wallet0).balanceOf(wallet0.address)).to.be.gte(
        new BigNumber(10).multipliedBy(1e18).toString()
      );

      expect(await usdcToken.connect(wallet0).balanceOf(wallet0.address)).to.be.gte(
        new BigNumber(1).multipliedBy(1e6).toString()
      );
    });
  });

  describe("Deployment", async () => {
    it("Should set correct name", async () => {
      expect(await connector.name()).to.eq("Aave-v3-import-v1.2");
    });
  });

  describe("DSA wallet setup", async () => {
    it("Should build DSA v2", async () => {
      dsaWallet0 = await buildDSAv2(wallet.address);
      expect(!!dsaWallet0.address).to.be.true;
      dsaWallet1 = await buildDSAv2(wallet.address);
      walletB = await ethers.getSigner(dsaWallet1.address);
      expect(!!dsaWallet1.address).to.be.true;
      dsaWallet2 = await buildDSAv2(dsaWallet1.address);
      expect(!!dsaWallet2.address).to.be.true;
    });

    it("Deposit ETH into DSA wallet", async function () {
      await wallet0.sendTransaction({
        to: dsaWallet0.address,
        value: ethers.utils.parseEther("5")
      });
      await wallet0.sendTransaction({
        to: dsaWallet2.address,
        value: ethers.utils.parseEther("10")
      });
      await wallet0.sendTransaction({
        to: dsaWallet1.address,
        value: ethers.utils.parseEther("5")
      });

      expect(await ethers.provider.getBalance(dsaWallet0.address)).to.be.gte(ethers.utils.parseEther("5"));
      expect(await ethers.provider.getBalance(dsaWallet1.address)).to.be.gte(ethers.utils.parseEther("5"));
    });

    it("Should create DSA Aave v3 position of DAI(collateral) and USDC(debt)", async () => {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [walletB.address]
      });

      walletBsigner = await ethers.getSigner(walletB.address);

      await token.connect(signer).transfer(dsaWallet2.address, ethers.utils.parseEther("10"));

      const spells = [
        //deposit DAI in aave
        {
          connector: "AAVE-V3-A",
          method: "deposit",
          args: [DAI, parseEther("10"), 0, 0]
        },
        //borrow USDC from aave
        {
          connector: "AAVE-V3-A",
          method: "borrow",
          args: [USDC, parseUnits("1", 6), 2, 0, 0]
        }
      ];
      const tx = await dsaWallet2.connect(walletBsigner).cast(...encodeSpells(spells), walletB.address);
      const receipt = await tx.wait();
    });

    it("Should check position of dsa", async () => {
      expect(await aDai.connect(walletBsigner).balanceOf(dsaWallet2.address)).to.be.gte(
        new BigNumber(10).multipliedBy(1e18).toString()
      );

      expect(await usdcToken.connect(walletBsigner).balanceOf(dsaWallet2.address)).to.be.gte(
        new BigNumber(1).multipliedBy(1e6).toString()
      );
    });
  });

  describe("Aave position migration", async () => {
    it("Should migrate Aave position", async () => {
      //Approving max amount
      const amount = ethers.constants.MaxUint256;
      const tx0 = await aDai.connect(wallet0).approve(dsaWallet0.address, amount);
      const tx1 = await usdcToken.connect(wallet0).approve(dsaWallet0.address, amount);
      const amount0 = new BigNumber(
        new BigNumber((await aave.connect(wallet0).getUserAccountData(wallet.address)).totalDebtBase)
      );
      let params = {
        tokens: [USDC],
        amounts: [amount0.toFixed(0)]
      };
      const flashData = (
        await axios.get("https://api.instadapp.io/defi/optimism/flashloan/v2", {
          params: params
        })
      ).data;

      const fees = flashData.bestFee;
      const amountB = new BigNumber(amount0.toString()).multipliedBy(fees).dividedBy(1e4);
      const amountWithFee = amount0.plus(amountB);
      const data = flashData.bestData[0];

      const flashSpells = [
        {
          connector: "AAVE-V3-IMPORT-X",
          method: "importAave",
          args: [wallet.address, [[DAI], [USDC], false, [amountB.toFixed(0)]]]
        },
        {
          connector: "INSTAPOOL-C",
          method: "flashPayback",
          args: [USDC, amountWithFee.toFixed(0), 0, 0]
        }
      ];

      const spells = [
        {
          connector: "INSTAPOOL-C",
          method: "flashBorrowAndCast",
          args: [USDC, amount0.toFixed(0), flashData.bestRoutes[0], encodeFlashcastData(flashSpells), data.toString()]
        }
      ];
      const tx = await dsaWallet0.connect(wallet0).cast(...encodeSpells(spells), wallet.address);
      const receipt = await tx.wait();
    });

    it("Should check DSA-1 AAVE position", async () => {
      expect(await aDai.connect(wallet0).balanceOf(dsaWallet0.address)).to.be.gte(
        new BigNumber(10).multipliedBy(1e18).toString()
      );
    });

    it("Should merge Aave position", async () => {
      //Approving max amount
      const amount = ethers.constants.MaxUint256;
      const tx0 = await aDai.connect(walletBsigner).approve(dsaWallet1.address, amount);

      const amount0 = new BigNumber(await usdcToken.connect(walletBsigner).balanceOf(dsaWallet2.address));
      let params = {
        tokens: [USDC],
        amounts: [amount0.toFixed(0)]
      };
      const flashData = (
        await axios.get("https://api.instadapp.io/defi/optimism/flashloan/v2", {
          params: params
        })
      ).data;

      const fees = flashData.bestFee;
      const data = flashData.bestData[0];
      const amountB = new BigNumber(amount0.toString()).multipliedBy(fees).dividedBy(1e4);
      const amountWithFee = amount0.plus(amountB);

      const flashSpells = [
        {
          connector: "AAVE-V3-IMPORT-X",
          method: "importAave",
          args: [dsaWallet2.address, [[DAI], [USDC], false, [amountB.toFixed(0)]]] //dsaWallet2 --> DSA_A DSA with aave position
        },
        {
          connector: "INSTAPOOL-C",
          method: "flashPayback",
          args: [USDC, amountWithFee.toFixed(0), 0, 0]
        }
      ];

      const spells = [
        {
          connector: "INSTAPOOL-C",
          method: "flashBorrowAndCast",
          args: [USDC, amount0.toString(), flashData.bestRoutes[0], encodeFlashcastData(flashSpells), data.toString()]
        }
      ];
      //merge to dsaWallet1
      const tx = await dsaWallet1.connect(wallet0).cast(...encodeSpells(spells), wallet.address);
      const receipt = await tx.wait();
    });

    it("Should check DSA-2 AAVE position", async () => {
      expect(await aDai.connect(wallet0).balanceOf(dsaWallet1.address)).to.be.gte(
        new BigNumber(10).multipliedBy(1e18).toString()
      );
    });
  });
});
