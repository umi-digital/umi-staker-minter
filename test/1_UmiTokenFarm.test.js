require("dotenv").config()
const { time, expectRevert } = require('@openzeppelin/test-helpers');
const UmiTokenMock = artifacts.require("UmiTokenMock");
const UmiTokenFarm = artifacts.require("UmiTokenFarm");
const envUtils = require("../src/utils/evnUtils");
const BigNumber = require('bignumber.js');
const { assert } = require("chai");

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

contract('UmiTokenFarm', async (accounts) => {

    const YEAR = new BN(31536000); // in seconds
    const TEN_DAYS = new BN(10 * 24 * 60 * 60);
    const ONE_DAYS = new BN(24 * 60 * 60);
    const TWO_YEARS = new BN(2 * 31536000)

    async function getBlockTimestamp(receipt) {
        return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp);
    }

    let umiTokenMock
    let umiTokenFarm
    let otherErc20Token

    before(async () => {
        // first erc20 token
        umiTokenMock = await UmiTokenMock.new()
        umiTokenFarm = await UmiTokenFarm.new()
        console.log('UmiTokenMock is deployed to %s', umiTokenMock.address)
        console.log('UmiTokenFarm is deployed to %s', umiTokenFarm.address)
        // transfer 2000000000 UmiToken to account[1]
        await umiTokenMock.transfer(accounts[1], ether('2000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiTOken to account[2]
        await umiTokenMock.transfer(accounts[2], ether('1000000000'), { from: accounts[0] })

        // deploy other erc20 token for testing
        otherErc20Token = await UmiTokenMock.new()
        console.log('otherErc20Token is deployed to %s', otherErc20Token.address)
        // transfer 2000000000 otherErc20Token to account[1]
        await otherErc20Token.transfer(accounts[1], ether('2000000000'), { from: accounts[0] })
        // transfer 1000000000 otherErc20Token to account[2]
        await otherErc20Token.transfer(accounts[2], ether('1000000000'), { from: accounts[0] })
    })

    // test fundingContract, in order to pay the user rewards later 
    describe('Test fundingContract', async () => {

        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[2] })

            // other erc20 token approve 10000 tokens to UmiTokenFarm
            await otherErc20Token.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('1st test, fundingContract and balance of the farming contract is correct', async () => {
            // 1. get UmiTokenFarm UmiToken balance
            let umiTokenFarmBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, umiTokenFarm.address)
            assert.equal(0, parseWei2Ether(umiTokenFarmBalance))
            // 2. account[0] fund 1000 to UmiTokenFarm, balance will be 1000
            await umiTokenFarm.fundingContract(umiTokenMock.address, ether('1000'), { from: accounts[0] });
            umiTokenFarmBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, umiTokenFarm.address)
            assert.equal(1000, parseWei2Ether(umiTokenFarmBalance))

            // 3. accounts[2] fund 1000 to UmiTokenFarm, balance will be 2000
            await umiTokenFarm.fundingContract(umiTokenMock.address, ether('1000'), { from: accounts[2] });
            umiTokenFarmBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, umiTokenFarm.address)
            assert.equal(2000, parseWei2Ether(umiTokenFarmBalance))

            // 4. get farming rewards by address, accounts[0] store 1000
            let account0FarmingRewards = await umiTokenFarm.funding(umiTokenMock.address, accounts[0])
            assert.equal(1000, parseWei2Ether(account0FarmingRewards))

            // 5. account[0] store another 1000 to UmiTokenFarm, balance will be 2000
            await umiTokenFarm.fundingContract(umiTokenMock.address, ether('1000'), { from: accounts[0] });
            account0FarmingRewards = await umiTokenFarm.funding(umiTokenMock.address, accounts[0])
            assert.equal(2000, parseWei2Ether(account0FarmingRewards))

            // 6. otherErc20Token store 1000 to UmiTokenFarm
            await umiTokenFarm.fundingContract(otherErc20Token.address, ether('1000'), { from: accounts[0] });
            // check funding, totalFunding of otherErc20Token
            const otherErc20TokenFunding = await umiTokenFarm.funding(otherErc20Token.address, accounts[0])
            assert.equal(1000, parseWei2Ether(otherErc20TokenFunding))
            const otherErc20TokenTotalFunding = await umiTokenFarm.totalFunding(otherErc20Token.address)
            assert.equal(1000, parseWei2Ether(otherErc20TokenTotalFunding))
        })

        it('2nd test, fundingContract incorrect, amount should be more than 0', async () => {
            await expectRevert(umiTokenFarm.fundingContract(umiTokenMock.address, 0, { from: accounts[0] }), 'fundingContract _amount should bigger than 0')
        })

        it('3rd test, fundingContract incorrect, _tokenAddress is not a contract address', async () => {
            await expectRevert(umiTokenFarm.fundingContract(accounts[0], 0, { from: accounts[0] }), '_tokenAddress is not a contract address')
        })

        it('4th test, check total funding correct', async () => {
            let totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            // console.log('check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            assert.equal(3000, parseWei2Ether(totalFunding));
        })
    })

    // test APY
    describe('Test setApy, getApy', async () => {
        it('5th test, if not been setted, apy will be default 12%', async () => {
            let apy = await umiTokenFarm.getApy(umiTokenMock.address)
            assert.equal(12, apy)
        })

        it('6th test, owner can set APY', async () => {
            // 1. set apy
            await umiTokenFarm.setApy(umiTokenMock.address, 20, { from: accounts[0] });
            // 2. check apy
            let apy = await umiTokenFarm.getApy(umiTokenMock.address)
            assert.equal(20, apy)
            // 3. change back
            await umiTokenFarm.setApy(umiTokenMock.address, 12, { from: accounts[0] });
            apy = await umiTokenFarm.getApy(umiTokenMock.address)
            assert.equal(12, apy)
        })

        it('7th test, can not set APY by non owner', async () => {
            await expectRevert(umiTokenFarm.setApy(umiTokenMock.address, 12, { from: accounts[1] }), 'Ownable: caller is not the owner')
        })
    })

    // test get UmiToken balance
    describe('Test getERC20TokenBalance', async () => {
        it('8th test, get UmiToken balance of account is correct', async () => {
            let banlance0 = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0])
            let banlance1 = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[1])
            let banlance2 = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[2])
            assert.equal(banlance0, ether('29999998000'))
            assert.equal(banlance1, ether('2000000000'))
            assert.equal(banlance2, ether('999999000'))
        })
    })

    // test stake
    describe('Test stake', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        // accounts[0] stake 1000
        it('9th test, stake correct by accounts[0]', async () => {
            // 1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('10000'))
            // 2. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })
            // 3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('9000'))
            // 4. stake success, check lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            assert.equal(lastStakeIdOfAccount0, 1)
            // 5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // console.log('9th test stake date=%s', BN(stakeDate).toString())
            // 6. check balance after stake 1000
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 1000)
            // 7. check total staked
            const totalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        it('10th test, stake incorrect with amount=0', async () => {
            // 1. stake 0 UmiToken to umiTokenFarm contract, it will fail
            await expectRevert(umiTokenFarm.stake(umiTokenMock.address, 0, { from: accounts[0] }), 'stake amount should bigger than 0')
            // 2. check lastStakeIds, balance of accounts[0] and total staked
            // check lastStakeIds
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            assert.equal(1, lastStakeIdOfAccount0)
            // check balance
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(1000, parseWei2Ether(balances))
            // check total staked
            const totalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            assert.equal(1000, parseWei2Ether(totalStaked))
        })

        it('11th test, stake without approve, it will fail', async () => {
            // 1. check allowance of accounts[1]
            let allowance = await umiTokenMock.allowance(accounts[1], umiTokenFarm.address)
            assert.equal(0, allowance)
            // 2. stake from accounts[1]
            await expectRevert(umiTokenFarm.stake(umiTokenMock.address, ether('100'), { from: accounts[1] }), 'ERC20: transfer amount exceeds allowance')
            // check total staked
            const totalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            assert.equal(1000, parseWei2Ether(totalStaked))
        })

        // accounts[1] stake 200
        it('12th test, stake correct by accounts[1]', async () => {
            // 1. account[1] approve 1000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('1000'), { from: accounts[1] })

            // 2. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[1], umiTokenFarm.address)
            assert.equal(allowance, ether('1000'))
            // 3. stake 200 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('200'), { from: accounts[1] })
            // 4. check allowance again
            allowance = await umiTokenMock.allowance(accounts[1], umiTokenFarm.address)
            assert.equal(allowance, ether('800'))
            // 5. stake success, check lastStakeIds of accounts[1]
            const lastStakeIdOfAccount1 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[1])
            assert.equal(lastStakeIdOfAccount1, 1)
            // 6. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(umiTokenMock.address, accounts[1], lastStakeIdOfAccount1)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // 7. check balance after stake 200
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[1], lastStakeIdOfAccount1)
            assert.equal(parseWei2Ether(balances), 200)
            //  check total staked
            const totalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            assert.equal(parseWei2Ether(totalStaked), 1200)
        })

        // accounts[0] stake another 2000
        it('13th test, stake another 2000 correct by accounts[0]', async () => {
            // 1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('9000'))
            // 2. stake 2000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('2000'), { from: accounts[0] })
            // 3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('7000'))
            // 4. stake success, check lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            assert.equal(lastStakeIdOfAccount0, 2)
            // 5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // 6. check balance after stake 2000
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 2000)
            // 7. check total staked
            const totalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            assert.equal(parseWei2Ether(totalStaked), 3200)
        })
    })

    // test request unstake, see unstakeCertainAmount(address _tokenAddress, uint256 _stakeId, uint256 _amount) method
    describe('Test unstakeCertainAmount', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[1] })
            // account[2] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[2] })
        })

        it('14th test, unstakeCertainAmount correct, to unstake all', async () => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })
            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])

            // 4. before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('14th test, Stake 1000, before unstake balance of accounts[0] %s', parseWei2Ether(beforeUnstakeBalance))

            // 5. unstakeCertainAmount
            await umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // 7. balance will be 0
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            //  after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('14th test, unstake 1000 ten days later, after unstake balance of accounts[0]=%s, interest=%s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance)- 1000)

            //  check total funding
            let totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('14th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('15th test, unstakeCertainAmount correct, stake 1000 then unstake 500 ', async () => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[1] })
            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            // 3. stake success, get lastStakeIds of accounts[1]
            const lastStakeIdOfAccount1 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[1])

            // 4. before unstake balance of accounts[1]
            let beforeUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[1]);
            console.log('15th test, Stake 1000, before unstake balance of accounts[1] %s', parseWei2Ether(beforeUnstakeBalance))

            // 5. unstakeCertainAmount
            await umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount1, ether('500'), { from: accounts[1] });
            const timestampUnstake = await getBlockTimestamp(receipt);

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(umiTokenMock.address, accounts[1], lastStakeIdOfAccount1);
            assert.equal(0, unstakeRequestsDate)
            // 7. balance will be 500
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[1], lastStakeIdOfAccount1)
            assert.equal(parseWei2Ether(balances), 500)

            //  after unstake balance of accounts[1]
            let afterUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[1]);
            console.log('15th test, unstake 500 ten days later, after unstake balance of accounts[1]=%s, interest=%s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance)- 500)

            //  check total funding
            let totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('15th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        // accounts[2] stake 1000 ether, and unstake all after 2 years later
        it('16th test, unstakeCertainAmount, unstake all after 2 years later', async () => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[2] })
            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for 2 years later
            await time.increase(TWO_YEARS)
            // 3. stake success, get lastStakeIds of accounts[2]
            const lastStakeIdOfAccount2 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[2])

            // 4. before unstake balance of accounts[2]
            let beforeUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[2]);
            console.log('16th test, stake 1000, before unstake balance of accounts[2] %s', parseWei2Ether(beforeUnstakeBalance))

            // 5. unstakeCertainAmount
            await umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount2, ether('1000'), { from: accounts[2] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(umiTokenMock.address, accounts[2], lastStakeIdOfAccount2);
            assert.equal(0, unstakeRequestsDate)
            // 7. makeRequestedUnstake balance will be 0
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[2], lastStakeIdOfAccount2)
            assert.equal(parseWei2Ether(balances), 0)

            //  after unstake balance of accounts[2]
            let afterUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[2]);
            console.log('16th test, unstake 1000 2 years later, after unstake balance of accounts[2]=%s, interest=%s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance) - 1000)

            //  check total funding
            let totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('16th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('17th test, unstakeCertainAmount incorrect, with wrong stake id', async () => {
            await expectRevert(umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, 10, ether('1000'), { from: accounts[0] }), 'wrong stake id')
        })

        it('18th test, unstakeCertainAmount incorrect, amount should be more than 0', async () => {
            const lastStakeIdOfAccount1 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[1])
            await expectRevert(umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount1, 0, { from: accounts[1] }), 'amount should bigger than 0')
        })

        it('19th test, _unstake insufficient funds', async () => {
            //  stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[2] })
            //  get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for 2 years later
            await time.increase(TWO_YEARS)
            //  stake success, get lastStakeIds of accounts[2]
            const lastStakeIdOfAccount2 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[2])

            await expectRevert(umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount2, ether('1001'), { from: accounts[2] }), 'insufficient funds')
        })
    })

    // test unstake, see unstake(uint256 _stakeId) method, to unstake all
    describe('Test unstake all', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('20th test, request unstake all correct', async () => {
            //  stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })
            //  get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            //  stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])

            //  before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('20th test, Stake 1000, before unstake balance of accounts[0] %s', parseWei2Ether(beforeUnstakeBalance))

            //  request unstake all
            await umiTokenFarm.unstake(umiTokenMock.address, lastStakeIdOfAccount0, { from: accounts[0] });

            // 16. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // 17. balance will be 0
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 1 after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('20th test, Unstake 1000 ten days later, after unstake balance of accounts[0] %s, interest=%s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance) - 1000)
        })

        it('21th test, unstake all incorrect, with wrong stake id', async () => {
            await expectRevert(umiTokenFarm.unstake(umiTokenMock.address, 10, { from: accounts[0] }), 'wrong stake id')
        })

        it('22th test, total funding is not enough to pay interest, just unstake capital without interest', async () => {
            await umiTokenMock.approve(umiTokenFarm.address, ether('1000000'), { from: accounts[0] })
            // 1. stake 1000000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(umiTokenMock.address, ether('1000000'), { from: accounts[0] })
            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TWO_YEARS)
            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])

            // 4. before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('22th test, Stake 1000000, before unstake balance of accounts[0] %s', parseWei2Ether(beforeUnstakeBalance))

            // 5. check total funding
            let totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('22th test, before unstake check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 5. request unstake all, total funding is not enough to pay interest 
            await umiTokenFarm.unstake(umiTokenMock.address, lastStakeIdOfAccount0, { from: accounts[0] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // 7. balance will be 0
            const balances = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            //  after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('22th test, Unstake 1000000 two years later, after unstake balance of accounts[0]=%s, interest=%s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance) - 1000000)

            //  check total funding
            totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('22th test, after unstake 1000000 check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

    })

    // test getTotalBalanceOfUser
    describe('Test getTotalBalanceOfUser', async () => {
        // total balance of accounts[0] will be 3500, total balance of accounts[1] will be 200
        it('23th test, getTotalBalanceOfUser correct', async () => {
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[0])
            assert.equal(3000, parseWei2Ether(totalBalance))
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[1])
            assert.equal(700, parseWei2Ether(totalBalance))
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[2])
            assert.equal(1000, parseWei2Ether(totalBalance))

            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[4])
            assert.equal(0, totalBalance)
        })
    })

    // test pause and unpause
    describe('Test pause and unpause', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('24th test, pause,unpause incorrect, only owner can call them', async () => {
            await expectRevert(umiTokenFarm.pause({ from: accounts[1] }), 'Ownable: caller is not the owner')

            await expectRevert(umiTokenFarm.unpause({ from: accounts[1] }), 'Ownable: caller is not the owner')
        })

        it('25th test, stake will be failed when paused, and will be success when unpaused', async () => {
            // 1. before stake, pause
            await umiTokenFarm.pause({ from: accounts[0] });
            // check paused state
            let pausedState = await umiTokenFarm.paused()
            // console.log('pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            await expectRevert(umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] }), 'Pausable: paused')
            // 3. check accounts[0]'s balance
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[0])
            assert.equal(3000, parseWei2Ether(totalBalance))
            // 4. unpause, and stake
            await umiTokenFarm.unpause({ from: accounts[0] });
            // check paused state
            pausedState = await umiTokenFarm.paused()
            // console.log('unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)
            // 5. stake again
            await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })
            // 6. check accounts[0]'s balance again
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[0])
            assert.equal(4000, parseWei2Ether(totalBalance))
        })

        it('26th test, unstake will be failed when paused, and will be success when unpaused', async () => {
            // 1. before stake, owner should approve UmiTokenFarm contract
            before(async () => {
                // account[0] approve 10000 tokens to UmiTokenFarm
                await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
            })

            // 2. stake 1000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })

            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])

            // 4. before unstake, pause
            await umiTokenFarm.pause({ from: accounts[0] });

            // check paused state
            let pausedState = await umiTokenFarm.paused()
            // console.log('pause pausedState %s', pausedState)
            assert.equal(pausedState, true)

            // 5. requestUnstake, it will fail
            await expectRevert(umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] }), 'Pausable: paused')
            // 6. check accounts[0]'s balance
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[0])
            assert.equal(5000, parseWei2Ether(totalBalance))

            // increase time for ten days later
            await time.increase(TEN_DAYS)

            // 7. unpause, and unstake
            await umiTokenFarm.unpause({ from: accounts[0] });
            // check paused state
            pausedState = await umiTokenFarm.paused()
            // console.log('unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)
            // 5. request unstake again, it will success
            await umiTokenFarm.unstakeCertainAmount(umiTokenMock.address, lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });
            // 6. check accounts[0]'s balance again
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[0])
            assert.equal(4000, parseWei2Ether(totalBalance))
        })

    })

    // test claim, Withdraws the interest of certain stake only,
    describe('Test claim', async () => {

        // 1. before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('27th test, claim incorrect, claim wrong stake id', async () => {
            await expectRevert(umiTokenFarm.claim(umiTokenMock.address, 10), 'wrong stake id')
        })

        it('28th test, claim incorrect, claim balance must more than 0', async () => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            // console.log('28th test, lastStakeIdOfAccount0=%s', lastStakeIdOfAccount0)

            // 3. get balance of stake, will be 1000
            let balanceOfStake = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            // console.log('28th test, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, balanceOfStake)
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // increase time for ten days later
            await time.increase(TEN_DAYS)

            // 4. unstake the stakeId
            await umiTokenFarm.unstake(umiTokenMock.address, lastStakeIdOfAccount0);
            // get balance of this stake again, will be 0
            balanceOfStake = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            // console.log('28th test, get balanceOfStake again, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, balanceOfStake)
            assert.equal(0, parseWei2Ether(balanceOfStake))

            // 5. claim, it will fail
            await expectRevert(umiTokenFarm.claim(umiTokenMock.address, lastStakeIdOfAccount0, { from: accounts[0] }), 'balance must bigger than 0')
        })

        it('29th test, claim correct', async () => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(umiTokenMock.address, ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            // console.log('29th test, lastStakeIdOfAccount0=%s', lastStakeIdOfAccount0)

            // 3. get balance of stake, will be 1000
            let balanceOfStake = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            // console.log('29th test, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, balanceOfStake)
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // 4. before claim get stakeDate
            const stakeDateBeforeClaim = await umiTokenFarm.stakeDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            console.log('29th test, stakeDateBeforeClaim=%s', BN(stakeDateBeforeClaim).toString())

            // 5. increase time for one year later
            await time.increase(YEAR);

            // 6. before claim get umi token balance of accounts[0]
            let beforeClaimBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('29th test, before claim umi balance of accounts[0] is %s', parseWei2Ether(beforeClaimBalance));

            // check total funding
            let totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('29th test, before claim check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 7. claim
            await umiTokenFarm.claim(umiTokenMock.address, lastStakeIdOfAccount0)

            //  after claim get stakeDate
            const stakeDateAfterClaim = await umiTokenFarm.stakeDates(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0)
            // console.log('28th test, stakeDateAfterClaim=%s', BN(stakeDateAfterClaim).toString())

            //  after claim get umi token balance of accounts[0]
            let afterClaimBalance = await umiTokenFarm.getERC20TokenBalance(umiTokenMock.address, accounts[0]);
            console.log('29th test, one year later, after claim umi balance of accounts[0] is %s, interest is %s', parseWei2Ether(afterClaimBalance), parseWei2Ether(afterClaimBalance) - parseWei2Ether(beforeClaimBalance));

            //  balance of stake is still 1000, because Withdraw the interest only,
            balanceOfStake = await umiTokenFarm.balances(umiTokenMock.address, accounts[0], lastStakeIdOfAccount0);
            console.log('29th test, balance of this stake is still %s', parseWei2Ether(balanceOfStake))
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            //  check total balance of accounts[0]
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(umiTokenMock.address, accounts[0])
            assert.equal(5000, parseWei2Ether(totalBalance))

            // check total funding
            totalFunding = await umiTokenFarm.totalFunding(umiTokenMock.address);
            console.log('29th test, after claim check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('30th test, total funding not enough to pay interest when claim', async () => {
            await umiTokenMock.approve(umiTokenFarm.address, ether('1000000'), { from: accounts[0] })
            // 1. stake 1000000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(umiTokenMock.address, ether('1000000'), { from: accounts[0] })
            // 2.stake success, get lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            // 3. increase time for 2 years later
            await time.increase(TWO_YEARS)

            // 4. claim, total funding not enough to pay interest, it will revert
            await expectRevert(umiTokenFarm.claim(umiTokenMock.address, lastStakeIdOfAccount0), 'not enough to pay interest')

            // 5. check total staked
            const umiTokenTotalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            // console.log('umiTokenTotalStaked=%s', parseWei2Ether(umiTokenTotalStaked))
            assert.equal(parseWei2Ether(umiTokenTotalStaked), 1006700)
        })

    })

    // test getTokenArray
    describe('Test getTokenArray', async () => {
        it('check token array', async () => {
            let tokenArray = await umiTokenFarm.getTokenArray()
            // console.log('tokenArray=%s', String(tokenArray))
            assert.equal(String(tokenArray), umiTokenMock.address)
        })
    })

    // **** stake other erc20 token to the contract
    describe('Test stake other erc20 token to the contract', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await otherErc20Token.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        // accounts[0] stake 1000
        it('31th test, otherErc20Token test, stake otherErc20Token correct by accounts[0]', async () => {
            // 1. check allowance first after approve
            let allowance = await otherErc20Token.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('10000'))
            // 2. stake 1000 otherErc20Token to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(otherErc20Token.address, ether('1000'), { from: accounts[0] })
            // 3. check allowance again
            allowance = await otherErc20Token.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('9000'))
            // 4. stake success, check otherErc20Token and umiTokenMock lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(otherErc20Token.address, accounts[0])
            assert.equal(lastStakeIdOfAccount0, 1)
            const umiTokenMockLastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(umiTokenMock.address, accounts[0])
            // console.log('31th test, umiTokenMockLastStakeIdOfAccount0=%s', BN(umiTokenMockLastStakeIdOfAccount0).toString())
            assert.equal(BN(umiTokenMockLastStakeIdOfAccount0).toString(), '10')
            // 5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(otherErc20Token.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // 6. check balance after stake 1000
            const balances = await umiTokenFarm.balances(otherErc20Token.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 1000)
            // 7. check total staked
            const totalStaked = await umiTokenFarm.totalStaked(otherErc20Token.address)
            assert.equal(parseWei2Ether(totalStaked), 1000)
            const umiTokenTotalStaked = await umiTokenFarm.totalStaked(umiTokenMock.address)
            // console.log('31th test, umiTokenTotalStaked=%s', parseWei2Ether(umiTokenTotalStaked))
            assert.equal(parseWei2Ether(umiTokenTotalStaked), 1006700)
        })

        it('32th test, check token array again', async () => {
            let tokenArray = await umiTokenFarm.getTokenArray()
            // console.log('32th test, tokenArray=%s', String(tokenArray))
            assert.equal(String(tokenArray), umiTokenMock.address + ',' + otherErc20Token.address)
        })

        it('33th test, other erc20 can unstake correct', async () => {
            // get otherErc20Token lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(otherErc20Token.address, accounts[0])
            assert.equal(lastStakeIdOfAccount0, 1)

            // before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(otherErc20Token.address, accounts[0]);
            console.log('33th test, Stake 1000 otherErc20Token, before unstake balance of accounts[0]=%s', parseWei2Ether(beforeUnstakeBalance))

            // increase time for one year later
            await time.increase(YEAR)

            // check total funding of otherErc20Token
            let otherErc20TokenTotalFunding = await umiTokenFarm.totalFunding(otherErc20Token.address)
            console.log('33th test, before unstake otherErc20TokenTotalFunding=%s', parseWei2Ether(otherErc20TokenTotalFunding))
            assert.equal(1000, parseWei2Ether(otherErc20TokenTotalFunding))

            // request unstake all
            await umiTokenFarm.unstake(otherErc20Token.address, lastStakeIdOfAccount0, { from: accounts[0] });

            // check total funding of otherErc20Token again
            otherErc20TokenTotalFunding = await umiTokenFarm.totalFunding(otherErc20Token.address)
            console.log('after unstake otherErc20TokenTotalFunding=%s', parseWei2Ether(otherErc20TokenTotalFunding))
            // assert.equal(1000, parseWei2Ether(otherErc20TokenTotalFunding))

            // unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(otherErc20Token.address, accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // balance will be 0
            const balance = await umiTokenFarm.balances(otherErc20Token.address, accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balance), 0)

            // after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getERC20TokenBalance(otherErc20Token.address, accounts[0]);
            console.log('33th test, Unstake 1000 otherErc20Token, one year later, after unstake balance of accounts[0]=%s, interest=%s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance) - 1000)
        })

    })

})