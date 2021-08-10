require("dotenv").config()
const envUtils = require("../src/utils/evnUtils");
const UmiERC20 = artifacts.require("UmiTokenMock");
const LpTokenMock = artifacts.require("LpTokenMock");
const UmiERC1155 = artifacts.require("ERC1155Mock");
const LpNftTokenFarm = artifacts.require("LpNftStakingFarm");

module.exports = async function (deployer, network, accounts) {

    // UmiToken address(default is mainnet address), on local ganache or rinkeby network it will be UmiTokenMock‘s address
    let umiTokenAddress = process.env.MAINNET_UMI_TOKEN_ADDRESS;
    let lpSakeswapAddress = process.env.MAINNET_LP_SAKESWAP_ADDRESS;
    let lpUniswapAddress = process.env.MAINNET_LP_UNISWAP_ADDRESS;
    let lpBalancerAddress = process.env.MAINNET_LP_BALANCER_ADDRESS;
    let erc1155Address = process.env.MAINNET_ERC1155_ADDRESS;

    // Deploy UmiTokenMock, LpTokenMock when on local ganache or rinkeby network
    if (!envUtils.isMainnet(network)) {
        await deployer.deploy(UmiERC20)
        const umiERC20 = await UmiERC20.deployed()
        umiTokenAddress = umiERC20.address

        console.log('deploy lp umiTokenMock deployed to %s', umiTokenAddress);

        // lp token will deploy three times
        // 1. deployed to sakeswap
        await deployer.deploy(LpTokenMock)
        const lpSakeswap = await LpTokenMock.deployed()
        console.log('deploy lp lpSakeswap deployed to %s', lpSakeswap.address);
        lpSakeswapAddress = lpSakeswap.address;

        // 2. deployed to Uniswap
        await deployer.deploy(LpTokenMock)
        const lpUniswap = await LpTokenMock.deployed()
        console.log('deploy lp lpUniswap deployed to %s', lpUniswap.address);
        lpUniswapAddress = lpUniswap.address;

        // 3. deployed to Balancer
        await deployer.deploy(LpTokenMock)
        const lpBalancer = await LpTokenMock.deployed()
        console.log('deploy lp lpBalancer deployed to %s', lpBalancer.address);
        lpBalancerAddress = lpBalancer.address;

        // 4. deploy erc1155
        await deployer.deploy(UmiERC1155, "uri")
        const umiERC1155 = await UmiERC1155.deployed()
        console.log('deploy nft umiERC1155 deployed to %s', umiERC1155.address);
        erc1155Address = umiERC1155.address;
    }

    // deploy LpTokenFarm
    if (lpSakeswapAddress) {
        // 1. deploy LpNftTokenFarm for sakeswap
        await deployer.deploy(LpNftTokenFarm, umiTokenAddress, lpSakeswapAddress, erc1155Address);
        const sakeswapLpNftTokenFarm = await LpNftTokenFarm.deployed()
        console.log('deploy lp sakeswapLpNftTokenFarm deployed to %s', sakeswapLpNftTokenFarm.address)
    } else {
        console.log('lpSakeswapAddress donot exist, wont deploy sakeswapLpNftTokenFarm')
    }

    if (lpUniswapAddress) {
        // 2. deploy LpNftTokenFarm for Uniswap
        await deployer.deploy(LpNftTokenFarm, umiTokenAddress, lpUniswapAddress, erc1155Address);
        const uniswapLpTokenFarm = await LpNftTokenFarm.deployed()
        console.log('deploy lp uniswapLpTokenFarm deployed to %s', uniswapLpTokenFarm.address)
    } else {
        console.log('lpUniswapAddress donot exist, wont deploy uniswapLpTokenFarm')
    }

    if (lpBalancerAddress) {
        // 3. deploy LpNftTokenFarm for Balancer
        await deployer.deploy(LpNftTokenFarm, umiTokenAddress, lpBalancerAddress, erc1155Address);
        const balancerLpNftTokenFarm = await LpNftTokenFarm.deployed()
        console.log('deploy lp balancerLpNftTokenFarm deployed to %s', balancerLpNftTokenFarm.address)
    } else {
        console.log('lpBalancerAddress donot exist, wont deploy balancerLpNftTokenFarm')
    }

};