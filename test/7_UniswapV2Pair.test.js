const { time, expectRevert } = require('@openzeppelin/test-helpers');
const UmiTokenMock = artifacts.require("UmiTokenMock");
const LpTokenMock = artifacts.require("LpTokenMock");
const UmiERC1155 = artifacts.require("ERC1155Mock");
const LpNftStakingFarm = artifacts.require("LpNftStakingFarm");
const { assert } = require("chai");
const { parse } = require('dotenv');

require('chai')
    .use(require('chai-as-promised'))
    .should()

var BN = web3.utils.BN;

function ether(n) {
    return web3.utils.toWei(n, 'ether')
}

function parseWei2Ether(wei) {
    return web3.utils.fromWei(wei, 'ether')
}

// test LpNftStakingFarm.sol
contract('LpNftStakingFarm', async (accounts) => {

    const ONE_YEAR = new BN(31536000); // in seconds
    const TEN_DAYS = new BN(10 * 24 * 60 * 60)
    const ONE_DAYS = new BN(24 * 60 * 60)
    const TWO_YEARS = new BN(2 * 31536000)

    async function getBlockTimestamp(receipt) {
        return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp)
    }

    let umiTokenMock
    let lpTokenMock
    let umiERC1155
    let lpNftStakingFarm
    let otherUmiERC1155

    // precondition
    before(async () => {
        // 1. deploy contracts
        umiTokenMock = await UmiTokenMock.new()
        umiERC1155 = await UmiERC1155.new('first_nft_uri')
        otherUmiERC1155 = await UmiERC1155.new('other_nft_uri')
        lpNftStakingFarm = await LpNftStakingFarm.new(umiTokenMock.address, '0xFCa68D9D45E0ebEB569b3E9ad2872C9e8D7a75BA')

        console.log('UmiTokenMock is deployed to %s', umiTokenMock.address)
        console.log('UmiERC1155 is deployed to %s', umiERC1155.address)
        console.log('otherUmiERC1155 is deployed to %s', otherUmiERC1155.address)
        console.log('LpNftStakingFarm is deployed to %s', lpNftStakingFarm.address)
    })

    describe('Test uniswap calculate', async () => {
        it('Check calculate result', async () => {
            const lpTokenAddress = await lpNftStakingFarm.getLpToken()
            console.log('lpTokenAddress=%s', lpTokenAddress.toString())

            const reserve0 = await lpNftStakingFarm.getReserve0()
            console.log('reserve0=%s', parseWei2Ether(reserve0))

            const lpTokenTotalSupply = await lpNftStakingFarm.getLpTokenTotalSupply()
            console.log('lpTokenTotalSupply=%s', parseWei2Ether(lpTokenTotalSupply))

            // checkValueOfRepresentUmi
            const valueOfRepresentUmi = await lpNftStakingFarm.checkValueOfRepresentUmi('100')
            console.log('100lp valueOfRepresentUmi=%s', parseWei2Ether(valueOfRepresentUmi))

            const valueOfRepresentUmi2 = await lpNftStakingFarm.checkValueOfRepresentUmi('10000')
            console.log('100lp valueOfRepresentUmi2=%s', parseWei2Ether(valueOfRepresentUmi2))

            const valueOfRepresentUmi3 = await lpNftStakingFarm.checkValueOfRepresentUmi('10000000000')
            console.log('10000000000lp valueOfRepresentUmi3=%s', parseWei2Ether(valueOfRepresentUmi3))

            const valueOfRepresentUmi4 = await lpNftStakingFarm.checkValueOfRepresentUmi('2783379164419206')
            console.log('2783379164419206lp valueOfRepresentUmi4=%s', parseWei2Ether(valueOfRepresentUmi4))

            const valueOfRepresentUmi5 = await lpNftStakingFarm.checkValueOfRepresentUmi('27833791644192060')
            console.log('27833791644192060lp valueOfRepresentUmi5=%s', parseWei2Ether(valueOfRepresentUmi5))
        })
    })

})