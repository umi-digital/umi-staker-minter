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

    // precondition
    before(async () => {
        // 1. deploy contracts
        umiTokenMock = await UmiTokenMock.new()
        lpTokenMock = await LpTokenMock.new()
        umiERC1155 = await UmiERC1155.new('uri')
        lpNftStakingFarm = await LpNftStakingFarm.new(umiTokenMock.address, lpTokenMock.address, umiERC1155.address)
        console.log('UmiTokenMock is deployed to %s', umiTokenMock.address)
        console.log('LpTokenMock is deployed to %s', lpTokenMock.address)
        console.log('UmiERC1155 is deployed to %s', umiERC1155.address)
        console.log('LpNftStakingFarm is deployed to %s', lpNftStakingFarm.address)

        // 2. transfer umiToken to accounts
        // transfer 2000000000 UmiToken to account[1]
        await umiTokenMock.transfer(accounts[1], ether('2000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiToken to account[2]
        await umiTokenMock.transfer(accounts[2], ether('1000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiToken to account[3]
        await umiTokenMock.transfer(accounts[3], ether('1000000000'), { from: accounts[0] })

        // 3. transfer lpToken to accounts
        // transfer 20000000 UmiToken to account[1]
        await lpTokenMock.transfer(accounts[1], ether('20000000'), { from: accounts[0] })
        // transfer 10000000 UmiToken to account[2]
        await lpTokenMock.transfer(accounts[2], ether('10000000'), { from: accounts[0] })
        // transfer 10000000 UmiToken to account[3]
        await lpTokenMock.transfer(accounts[3], ether('10000000'), { from: accounts[0] })

        // 4. mint erc1155 token, each nft id mint 10
        await umiERC1155.mint(accounts[0], 1, 10, "0x1111", { from: accounts[0] });
        await umiERC1155.mint(accounts[0], 2, 10, "0x2222", { from: accounts[0] });
        await umiERC1155.mint(accounts[0], 3, 10, "0x3333", { from: accounts[0] });

        await umiERC1155.mint(accounts[2], 1, 10, "0x1111", { from: accounts[0] });
        await umiERC1155.mint(accounts[2], 2, 10, "0x2222", { from: accounts[0] });
        await umiERC1155.mint(accounts[2], 3, 10, "0x3333", { from: accounts[0] });

        await umiERC1155.mint(accounts[3], 1, 10, "0x1111", { from: accounts[0] });
        await umiERC1155.mint(accounts[3], 2, 10, "0x2222", { from: accounts[0] });
        await umiERC1155.mint(accounts[3], 3, 10, "0x3333", { from: accounts[0] });

        // 5. mock, set apy of token
        await lpNftStakingFarm.setApyByTokenId(1, 10)
        await lpNftStakingFarm.setApyByTokenId(2, 20)
        await lpNftStakingFarm.setApyByTokenId(3, 30)
    })

    // test constructor
    describe('Test constructor', async () => {
        it('1st test, constructor should be set up correctly', async () => {
            // 1. UmiToken address is correct
            const umiTokenAddress = await lpNftStakingFarm.umiToken();
            assert.equal(umiTokenAddress, umiTokenMock.address);
            // 2. LpToken address is correct
            const lpTokenMockAddress = await lpNftStakingFarm.lpToken();
            assert.equal(lpTokenMockAddress, lpTokenMock.address);
            // 3. erc1155 address is correct
            const erc1155Address = await lpNftStakingFarm.nftContract()
            assert.equal(erc1155Address, umiERC1155.address)
        })

        it('2nd test, fail if _umiAddress or _lpAddress or _nftContract is incorrect', async () => {
            // 1. _umiAddress incorrect
            await expectRevert(LpNftStakingFarm.new(accounts[0], lpTokenMock.address, umiERC1155.address), 'must use contract address')
            // 2. _lpAddress incorrect
            await expectRevert(LpNftStakingFarm.new(umiTokenMock.address, accounts[0], umiERC1155.address), 'must use contract address')
            lpNftStakingFarmFailed = false;
            // 3. _nftContract incorrect
            await expectRevert(LpNftStakingFarm.new(umiTokenMock.address, lpTokenMock.address, accounts[0]), 'must use contract address')
        })

        it('3rd test, initApys correct', async () => {
            let nft1Apy = await lpNftStakingFarm.nftApys(1)
            assert.equal(nft1Apy, 10)
            let nft11Apy = await lpNftStakingFarm.nftApys(11)
            assert.equal(nft11Apy, 20)
            let nft50Apy = await lpNftStakingFarm.nftApys(50)
            assert.equal(nft50Apy, 80)
        })
    })

    // test fundingContract, in order to pay the user rewards later 
    describe('Test fundingContract', async () => {
        before(async () => {
            // account[0] approve 10000 tokens to lpNftStakingFarm
            await umiTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to lpNftStakingFarm
            await umiTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[2] })
        })

        it('4th test, fundingContract correct', async () => {
            // 1. get lpNftStakingFarm UmiToken balance
            let lpNftStakingFarmBalance = await lpNftStakingFarm.getUmiBalance(lpNftStakingFarm.address)
            assert.equal(0, parseWei2Ether(lpNftStakingFarmBalance))

            // 2. account[0] fund 1000 to lpNftStakingFarm, balance will be 1000
            await lpNftStakingFarm.fundingContract(ether('1000'), { from: accounts[0] });
            lpNftStakingFarmBalance = await lpNftStakingFarm.getUmiBalance(lpNftStakingFarm.address)
            assert.equal(1000, parseWei2Ether(lpNftStakingFarmBalance))

            // 3. accounts[2] fund 1000 to lpNftStakingFarm, balance will be 2000
            await lpNftStakingFarm.fundingContract(ether('1000'), { from: accounts[2] });
            lpNftStakingFarmBalance = await lpNftStakingFarm.getUmiBalance(lpNftStakingFarm.address)
            assert.equal(2000, parseWei2Ether(lpNftStakingFarmBalance))

            // 4. get farming rewards by address, accounts[0] store 1000
            let account0FarmingRewards = await lpNftStakingFarm.funding(accounts[0])
            assert.equal(1000, parseWei2Ether(account0FarmingRewards))

            // 5. account[0] store another 1000 to nftStakingFarm, balance will be 2000
            await lpNftStakingFarm.fundingContract(ether('1000'), { from: accounts[0] });
            account0FarmingRewards = await lpNftStakingFarm.funding(accounts[0])
            assert.equal(2000, parseWei2Ether(account0FarmingRewards))
        })

        it('5th test, fundingContract incorrect, amount should be more than 0', async () => {
            await expectRevert(lpNftStakingFarm.fundingContract(0, { from: accounts[0] }), '_amount should be more than 0')
        })

        it('6th, check total funding correct', async () => {
            let totalFunding = await lpNftStakingFarm.totalFunding();
            // console.log('check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            assert.equal(3000, parseWei2Ether(totalFunding));
        })
    })

    // ********  Note: until now, totalFunding is 3000 ether  ********

    // test setBaseApy
    describe('Test setBaseApy', async () => {
        it('7th test, owner can set BASE_APY', async () => {
            await lpNftStakingFarm.setBaseApy(33, { from: accounts[0] });
        })

        it('8th test, can not set BASE_APY by non owner', async () => {
            await expectRevert(lpNftStakingFarm.setBaseApy(33, { from: accounts[1] }), 'Ownable: caller is not the owner')
        })
    })

    // test stake
    describe('Test stake', async () => {
        // before stake, owner should approve lpNftStakingFarm contract
        before(async () => {
            // account[0] approve 10000 lp tokens to lpNftStakingFarm
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[0] })
        })

        // accounts[0] stake 1000 ether
        it('9th test, accounts[0] stake correct', async () => {
            // 1. when not stake lp token, apy is 0
            let totalApyOfAccount0 = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApyOfAccount0, 0)
            let totalApyOfAccount1 = await lpNftStakingFarm.getTotalApyOfUser(accounts[1])
            assert.equal(totalApyOfAccount1, 0)

            // 2. check allowance first after approve
            let allowance = await lpTokenMock.allowance(accounts[0], lpNftStakingFarm.address)
            assert.equal(allowance, ether('10000'))
            // 3. stake 1000 lp to lpNftStakingFarm contract
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 4. check allowance again
            allowance = await lpTokenMock.allowance(accounts[0], lpNftStakingFarm.address)
            assert.equal(allowance, ether('9000'))
            // 5. stake success, check balance of accounts[0] in lpNftStakingFarm contract
            let account0Balance = await lpNftStakingFarm.balances(accounts[0])
            // console.log('9th test stake account0Balance=%s', BN(account0Balance).toString())
            assert.equal(account0Balance, ether('1000'))
            // 6. stake success, check stakeDate of accounts[0]
            const timestamp = await getBlockTimestamp(receipt);
            let account0StakeDate = await lpNftStakingFarm.stakeDates(accounts[0])
            // console.log('9th stake success, timestamp=%s, account0StakeDate=%s', BN(timestamp).toString(), BN(account0StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account0StakeDate).toString())
            // 7. stake success, check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        // stake incorrect with amount 0
        it('10th test, stake incorrect with amount=0', async () => {
            // 1. stake 0 UmiToken to lpNftStakingFarm contract, it will fail
            await expectRevert(lpNftStakingFarm.stake(0, { from: accounts[0] }), 'stake amount should be more than 0')
        })

        // accounts[1] stake without approve, it will fail
        it('11th test, accounts[1] stake without approve, it will fail', async () => {
            // 1. check allowance of accounts[1]
            let allowance = await lpTokenMock.allowance(accounts[1], lpNftStakingFarm.address)
            assert.equal(0, allowance)
            // 2. stake from accounts[1]
            await expectRevert(lpNftStakingFarm.stake(ether('100'), { from: accounts[1] }), 'ERC20: transfer amount exceeds allowance')
            // 3. check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(1000, parseWei2Ether(totalStaked))
            // 4. stake fail, check balance of accounts[1] in lpNftStakingFarm contract, will be 0
            let account1Balance = await lpNftStakingFarm.balances(accounts[1])
            assert.equal(account1Balance, 0)
        })

        // accounts[1] stake 1000 ether success
        it('12th test, accounts[1] stake correct', async () => {
            // account[1] approve 10000 lp tokens to lpNftStakingFarm
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[1] })

            // 1. check allowance first after approve
            let allowance = await lpTokenMock.allowance(accounts[1], lpNftStakingFarm.address)
            assert.equal(allowance, ether('10000'))
            // 2. stake 1000 to lpNftStakingFarm contract
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[1] })
            // 3. check allowance again
            allowance = await lpTokenMock.allowance(accounts[1], lpNftStakingFarm.address)
            assert.equal(allowance, ether('9000'))
            // 4. stake success, check balance of accounts[1] in lpNftStakingFarm contract
            let account1Balance = await lpNftStakingFarm.balances(accounts[1])
            // console.log('12th test stake account1Balance=%s', BN(account1Balance).toString())
            assert.equal(account1Balance, ether('1000'))
            // 5. stake success, check stakeDate of accounts[1]
            const timestamp = await getBlockTimestamp(receipt);
            let account1StakeDate = await lpNftStakingFarm.stakeDates(accounts[1])
            // console.log('12th stake success, timestamp=%s, account1StakeDate=%s', BN(timestamp).toString(), BN(account1StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account1StakeDate).toString())
            // 6. stake success, check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 2000)
        })

        // accounts[0] stake another 2000 ether
        it('13th test, accounts[0] stake correct', async () => {
            // 1. check allowance first after approve
            let allowance = await lpTokenMock.allowance(accounts[0], lpNftStakingFarm.address)
            assert.equal(allowance, ether('9000'))
            // 2. stake 2000 to lpNftStakingFarm contract
            let receipt = await lpNftStakingFarm.stake(ether('2000'), { from: accounts[0] })
            // 3. check allowance again
            allowance = await lpTokenMock.allowance(accounts[0], lpNftStakingFarm.address)
            assert.equal(allowance, ether('7000'))
            // 4. stake success, check balance of accounts[0] in lpNftStakingFarm contract
            let account0Balance = await lpNftStakingFarm.balances(accounts[0])
            // console.log('13th test stake account0Balance=%s', BN(account0Balance).toString())
            assert.equal(account0Balance, ether('3000'))
            // 5. stake success, check stakeDate of accounts[0]
            const timestamp = await getBlockTimestamp(receipt);
            let account0StakeDate = await lpNftStakingFarm.stakeDates(accounts[0])
            // console.log('13th stake success, timestamp=%s, account0StakeDate=%s', BN(timestamp).toString(), BN(account0StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account0StakeDate).toString())
            // 6. stake success, check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 4000)
        })

        // when just stake lp token, total apy of user is base_apy=33
        it('14th test, when just stake lp token, total apy of user is base_apy=33', async () => {
            let totalApyOfAccount0 = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApyOfAccount0, 33)
            let totalApyOfAccount1 = await lpNftStakingFarm.getTotalApyOfUser(accounts[1])
            assert.equal(totalApyOfAccount1, 33)
        })

        // accounts[0] stake 1000 ether lp token after 10 days later, balance of user will update
        it('15th test, accounts[0] stake 1000 ether after 10 days later, balance and stakeDate of user will updated', async () => {
            // 1. increase time to 10 days later
            // increase time for ten days later
            await time.increase(TEN_DAYS)

            // 2. before stake, check stakeDate of accounts[0]
            let account0StakeDateBeforeStake = await lpNftStakingFarm.stakeDates(accounts[0])

            // 3. before stake, check lpToken balance of accounts[0]
            let account0BalanceBeforeStake = await lpNftStakingFarm.balances(accounts[0])
            assert.equal(account0BalanceBeforeStake, ether('3000'))
            console.log('15th test, before stake, stakeDate=%s, balance=%s', account0StakeDateBeforeStake, parseWei2Ether(account0BalanceBeforeStake))

            // 4. before stake, check umiToken balance of accounts[0]
            let account0UmiBalanceBeforeStake = await lpNftStakingFarm.getUmiBalance(accounts[0])

            // 5. stake 1000 to lpNftStakingFarm contract
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[0] })

            // 6. after stake, check stateDate of accounts[0]
            let account0StakeDateAfterStake = await lpNftStakingFarm.stakeDates(accounts[0])

            // 7. after stake, check balance of accounts[0] in lpNftStakingFarm contract
            let account0BalanceAfterStake = await lpNftStakingFarm.balances(accounts[0])
            assert.equal(account0BalanceAfterStake, ether('4000'))

            // 8. after stake, check umiToken balance of accounts[0]
            let account0UmiBalanceAfterStake = await lpNftStakingFarm.getUmiBalance(accounts[0])
            // 3000 ether after 10 days later, check umi interest
            console.log('15th test, 10 days later, stake another 1000, stakeDate=%s, new balance=%s, apy=33%, timePassed=10 days, umi balance before=%s, umi balance after=%s, calculate umi interest(principal=3000, apy=33%, 10 days)=%s', account0StakeDateAfterStake, parseWei2Ether(account0BalanceAfterStake), parseWei2Ether(account0UmiBalanceBeforeStake), parseWei2Ether(account0UmiBalanceAfterStake), parseWei2Ether(account0UmiBalanceAfterStake) - parseWei2Ether(account0UmiBalanceBeforeStake))

            // 9. check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 5000)
        })
    })

    // ********  Note: until now, accounts[0] staked 4000 ether lpToken, accounts[1] staked 1000 ether lpToken ********

    // test unstake
    describe('Test unstake', async () => {
        // unstake accounts[0]'s balance
        it('16th test, unstake accounts[0] lpToken balance', async () => {
            // mock time pass
            await time.increase(1)
            // 1. before unstake, check lpToken balance of accounts[0]
            let account0BalanceBeforeUnstake = await lpNftStakingFarm.balances(accounts[0])
            // 2. before unstake, check total umi balance of accounts[0]'s
            let account0TotalUmiBalanceBefore = await lpNftStakingFarm.getUmiBalance(accounts[0])
            // 3. before unstake, check total lp balance of accounts[0]
            let account0TotalLpBalanceBefore = await lpNftStakingFarm.getLpBalance(accounts[0])
            console.log('16th test, before unstake, lpToken balance of accounts[0] in lpNftStakingFarm=%s, total lp balance=%s, total umi balance=%s', parseWei2Ether(account0BalanceBeforeUnstake), parseWei2Ether(account0TotalLpBalanceBefore), parseWei2Ether(account0TotalUmiBalanceBefore))
            // 4. unstake
            await lpNftStakingFarm.unstake({ from: accounts[0] })
            // 5. after unstake, check lpToken balance of accounts[0]
            let account0BalanceAfterUnstake = await lpNftStakingFarm.balances(accounts[0])
            // 6. after unstake, check total umi balance of accounts[0]
            let account0TotalUmiBalanceAfter = await lpNftStakingFarm.getUmiBalance(accounts[0])
            // 7. after unstake, check total lp balance of accounts[0]
            let account0TotalLpBalanceAfter = await lpNftStakingFarm.getLpBalance(accounts[0])
            console.log('16th test, after unstake, lpToken balance of accounts[0] in lpNftStakingFarm=%s, total lp balance=%s, total umi balance=%s', parseWei2Ether(account0BalanceAfterUnstake), parseWei2Ether(account0TotalLpBalanceAfter), parseWei2Ether(account0TotalUmiBalanceAfter))
            // 8. check totalFunding
            let totalFunding = await lpNftStakingFarm.totalFunding();
            console.log('16th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            // 9. unstake success, check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        // unstake with insufficient funds, because of accounts[2] never stake before
        it('17th test, unstake incorrect, insufficient funds', async () => {
            await expectRevert(lpNftStakingFarm.unstake({ from: accounts[2] }), 'insufficient funds')
        })

        // total funding is not enough to pay interest, return capital of user
        // total funding now is 2972.766094945741787999 ether
        it('18th test, total funding is not enough to pay interest, just unstake capital without interest', async () => {
            // 1. approve 1000000, and stake 1000000 to mock total funding is not enough to pay interest case
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('1000000'), { from: accounts[1] })
            // 2. before stake and unstake, check total umi balance of accounts[1], stake will cause umi increase
            let account1TotalUmiBalanceBefore = await lpNftStakingFarm.getUmiBalance(accounts[1])
            // 3. stake 1000000 lpTokenMock to lpNftStakingFarm contract, 1000 passed 10 days, umi interest will be 9.09
            await lpNftStakingFarm.stake(ether('1000000'), { from: accounts[1] })
            // 4. increase time for two years, two years later, total funding is not enough to pay interest
            await time.increase(TWO_YEARS)
            // 5. before unstake, check lp balance of accounts[1]
            let account1BalanceBeforeUnstake = await lpNftStakingFarm.balances(accounts[1])
            // 6. before unstake, check total lp balance of accounts[1]
            let account1TotalLpBalanceBefore = await lpNftStakingFarm.getLpBalance(accounts[1])
            console.log('18th test, before unstake, lpToken balance of accounts[1] in lpNftStakingFarm=%s, total lp balance=%s, total umi balance=%s', parseWei2Ether(account1BalanceBeforeUnstake), parseWei2Ether(account1TotalLpBalanceBefore), parseWei2Ether(account1TotalUmiBalanceBefore))
            // 7. unstake
            await lpNftStakingFarm.unstake({ from: accounts[1] })
            // 8. after unstake, check lp balance of accounts[1] in lpNftStakingFarm
            let account1BalanceAfterUnstake = await lpNftStakingFarm.balances(accounts[1])
            // 9. after unstake, check total lp balance of accounts[1]
            let account1TotalLpBalanceAfter = await lpNftStakingFarm.getLpBalance(accounts[1])
            // 10. after unstake, check total umi balance of accounts[1]
            let account1TotalUmiBalanceAfter = await lpNftStakingFarm.getUmiBalance(accounts[1])
            console.log('18th test, after unstake, balance of accounts[1] in lpNftStakingFarm=%s, total lp balance=%s, total umi balance=%s', parseWei2Ether(account1BalanceAfterUnstake), parseWei2Ether(account1TotalLpBalanceAfter), parseWei2Ether(account1TotalUmiBalanceAfter))
            // 11. unstake success, check stateDate of accounts[1]
            let stakeDate = await lpNftStakingFarm.stakeDates(accounts[1])
            assert.equal(stakeDate, 0)
            // 12. check totalFunding, 2972.766094945741787999 -  9.077968351419404 = 2963.688126594322383999
            let totalFunding = await lpNftStakingFarm.totalFunding();
            console.log('18th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            // 13. unstake success, check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)
        })
    })

    // ********  Note: until now, totalStaked is 0  ********

    // test stakeNft
    describe('Test stakeNft', async () => {
        // stake nft without approve, it will fail
        it('19th test, stake nft without approve, it will fail', async () => {
            await expectRevert(lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] }), 'ERC1155: caller is not owner nor approved')
        })

        it('20th test, stake nft correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[0] });
            // 2. check user's total nft balance
            let nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 10)
            // 3. stake nft
            await lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
            // 4. stake success, check balance of nft token
            let amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('20th test, amount of nft id 1=%s', amount)
            assert.equal(amount, 1)
            // 5. check total nft staked
            let totalNftStaked = await lpNftStakingFarm.totalNftStaked()
            assert.equal(totalNftStaked, 1)
            // 6. check nft id array of user, will be 1
            let idArray = await lpNftStakingFarm.getUserNftIds(accounts[0])
            // console.log('20th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1')
            // 7. stake 2, id array will be 1,2
            await lpNftStakingFarm.stakeNft(2, 1, '0x1111', { from: accounts[0] })
            idArray = await lpNftStakingFarm.getUserNftIds(accounts[0])
            // console.log('20th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1,2')
            // 8. stake another 1, id array will also be 1,2
            await lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
            idArray = await lpNftStakingFarm.getUserNftIds(accounts[0])
            // console.log('20th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1,2')
            // 9. check user's total nft balance again, will be 8
            nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 8)
            // 10. with no umi token staked, totalApyOf will be 0
            let totalApyOfAccount0 = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApyOfAccount0, 0)
        })

        it('21th test, stake nft incorrect, nft id not in whitelist', async () => {
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[0] });
            await expectRevert(lpNftStakingFarm.stakeNft(1000, 1, '0x1111', { from: accounts[0] }), 'stakeNft: nft id not in whitelist')
        })
    })

    // ********  Note: until now, accounts[0] staked 2 tokens whose nft id is 1, staked 1 token whose nft id is 2  ********

    // test batchStakeNfts
    describe('Test batchStakeNfts', async () => {
        it('22th test, batchStakeNfts incorrect, nft id not in whitelist', async () => {
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[0] });
            await expectRevert(lpNftStakingFarm.batchStakeNfts([1001], [1], '0x1111'), 'nft id not in whitelist')
        })

        // accounts[0] stake staked 1 tokens whose nft id is 1, stake 2 token whose nft id is 2
        it('23th test, accounts[0] call batchStakeNfts correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[0] });
            // 2. stake staked 1 tokens whose nft id is 1, stake 2 token whose nft id is 2
            await lpNftStakingFarm.batchStakeNfts([1, 2], [1, 2], '0x1111')
            // 3. stake success, check balance of nft token
            let amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('23th test, amount of nft id 1 = %s', amount)
            assert.equal(amount, 3)
            amount = await lpNftStakingFarm.nftBalances(accounts[0], 2)
            // console.log('23th test, amount of nft id 2 = %s', amount)
            assert.equal(amount, 3)
        })
    })

    // ****  Note: until now, accounts[0] staked 3 tokens whose nft id is 1, staked 3 tokens whose nft id is 2  ****

    // test unstakeNft
    describe('Test unstakeNft', async () => {
        // unstake 1 token whose nft id is 1, unstake 1 token whose nft id is 2
        it('24th test, accounts[0] unstake nft correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[0] });
            // 2. unstake 1 token whose nft id is 1
            await lpNftStakingFarm.unstakeNft(1, 1, '0x1111')
            // 3. unstake success, check balance of nft token 1
            let amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('23th test, amount of nft id 1 = %s', amount)
            assert.equal(amount, 2)
            // 4. unstake 1 token whose nft id is 2
            await lpNftStakingFarm.unstakeNft(2, 1, '0x1111')
            // 5. unstake success, check balance of nft token 2
            amount = await lpNftStakingFarm.nftBalances(accounts[0], 2)
            // console.log('23th test, amount of nft id 2 = %s', amount)
            assert.equal(amount, 2)
            // 6. check total nft staked
            let totalNftStaked = await lpNftStakingFarm.totalNftStaked()
            assert.equal(totalNftStaked, 4)
        })
    })

    // ****  Note: until now, accounts[0] staked 2 tokens whose nft id is 1, staked 2 token whose nft id is 2  ****

    // test batchUnstakeNfts
    describe('Test batchUnstakeNfts', async () => {
        // batch unstake nfts ids: [1,2] values:[1,1]
        it('25th test, batchUnstakeNfts correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[0] });
            // 2. batch unstake ntfs
            await lpNftStakingFarm.batchUnstakeNfts([1, 2], [1, 1], '0x1111', { from: accounts[0] })
            // 3. unstake success, check balance of nft token 1
            let amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('24th test, amount of nft id 1 = %s', amount)
            assert.equal(amount, 1)
            // 4. check balance of nft token 2
            amount = await lpNftStakingFarm.nftBalances(accounts[0], 2)
            // console.log('24th test, amount of nft id 2 = %s', amount)
            assert.equal(amount, 1)
            // 5. check user's total nft balance
            let nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 9)
            nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 2);
            assert.equal(nftIdBalance, 9)
        })
    })

    // ****  Note: until now, accounts[0] staked 1 token whose nft id is 1, staked 1 token whose nft id is 2  ****

    // test getUmiBalance by address
    describe('Test getUmiBalance', async () => {
        it('26th test, getUmiBalance correct', async () => {
            let banlance0 = await lpNftStakingFarm.getUmiBalance(accounts[0])
            let banlance1 = await lpNftStakingFarm.getUmiBalance(accounts[1])
            let banlance2 = await lpNftStakingFarm.getUmiBalance(accounts[2])
            assert.equal(999999000, parseWei2Ether(banlance2))
            console.log('26th test, accounts[0] balance=%s, accounts[1] balance=%s, accounts[2] balance=%s,', parseWei2Ether(banlance0), parseWei2Ether(banlance1), parseWei2Ether(banlance2))
        })
    })

    // test getLpBalance by address
    describe('Test getLpBalance', async () => {
        it('27th test, getLpBalance correct', async () => {
            let lpBalance0 = await lpNftStakingFarm.getLpBalance(accounts[0])
            assert.equal(160000000, parseWei2Ether(lpBalance0))
            let lpBalance1 = await lpNftStakingFarm.getLpBalance(accounts[1])
            assert.equal(20000000, parseWei2Ether(lpBalance1))
            let lpBalance2 = await lpNftStakingFarm.getLpBalance(accounts[2])
            assert.equal(10000000, parseWei2Ether(lpBalance2))
            let lpBalance3 = await lpNftStakingFarm.getLpBalance(accounts[3])
            assert.equal(10000000, parseWei2Ether(lpBalance3))
        })
    })

    // test getNftBalance
    describe('Test getNftBalance', async () => {
        it('28th test, get total nft balance of user correct', async () => {
            // nftId=1, value=9
            let nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 9)
            // nftId=2, value=9
            nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 2);
            assert.equal(nftIdBalance, 9)
            // nftId=3, value=10
            nftIdBalance = await lpNftStakingFarm.getNftBalance(accounts[0], 3);
            assert.equal(nftIdBalance, 10)
        })
    })

    // test getUserNftIds
    describe('Test getUserNftIds', async () => {
        it('29th test, getUserNftIds correct', async () => {
            let idArray = [];
            idArray = await lpNftStakingFarm.getUserNftIds(accounts[0])
            // console.log('29th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1,2')
        })
    })

    // test getUserNftIdsLength
    describe('Test getUserNftIdsLength', async () => {
        it('30th test, getUserNftIdsLength correct', async () => {
            // 1. accounts[0] userNftIds.ids array length is 2
            let length = await lpNftStakingFarm.getUserNftIdsLength(accounts[0])
            // console.log('30th test, accounts[0] userNftIds.ids array length is %s ', length)
            assert.equal(2, length)
            // 2. accounts[1] userNftIds.ids array length is 0
            length = await lpNftStakingFarm.getUserNftIdsLength(accounts[1])
            // console.log('30th test, accounts[1] userNftIds.ids array length is %s ', length)
            assert.equal(0, length)
        })
    })

    // test isNftIdExist, check whether user's nft id is exist
    describe('Test isNftIdExist', async () => {
        it('31th test, check isNftIdExist correct', async () => {
            // 1. accounts[0] have token whose nft id is 1
            let isNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[0], 1)
            assert.equal(true, isNftIdExist)
            // 2. accounts[0] have token whose nft id is 2
            isNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[0], 2)
            assert.equal(true, isNftIdExist)
            // 3. accounts[0] donot have token whose nft id is 3
            isNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[0], 3)
            assert.equal(false, isNftIdExist)
            // 4. accounts[1] donot have token whose nft id is 1
            isNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[1], 1)
            assert.equal(false, isNftIdExist)
        })
    })

    // test setApyByTokenId
    describe('Test setApyByTokenId', async () => {
        it('32th test, check setApyByTokenId correct', async () => {
            // 1. get apy of nft id 1
            let apy = await lpNftStakingFarm.nftApys(1)
            // console.log('32th test, apy of nftId1=%s', apy)
            assert.equal(10, apy)
            // 2. get apy of nft id 2
            apy = await lpNftStakingFarm.nftApys(2)
            // console.log('32th test, apy of nftId2=%s', apy)
            assert.equal(20, apy)
            // 3. get apy of nft id 3
            apy = await lpNftStakingFarm.nftApys(3)
            // console.log('32th test, apy of nftId3=%s', apy)
            assert.equal(30, apy)
            // 4. modify apy of nft id 1
            await lpNftStakingFarm.setApyByTokenId(1, 15)
            // 5. get apy of nft id 1 again, check if set correct
            apy = await lpNftStakingFarm.nftApys(1)
            // console.log('32th test, apy of nftId1=%s', apy)
            assert.equal(15, apy)
        })

        it('33th test, can not call setApyByTokenId by non owner', async () => {
            await expectRevert(lpNftStakingFarm.setApyByTokenId(1, 10, { from: accounts[1] }), 'Ownable: caller is not the owner')
        })

        it('34th test, nft and apy must>0', async () => {
            await expectRevert(lpNftStakingFarm.setApyByTokenId(0, 10, { from: accounts[0] }), 'nft and apy must > 0')
            await expectRevert(lpNftStakingFarm.setApyByTokenId(1, 0, { from: accounts[0] }), 'nft and apy must > 0')
        })
    })

    // test isInWhitelist, Check if nft id is in whitelist.
    describe('Test isInWhitelist', async () => {
        it('35th test, check whiteList correct', async () => {
            let isIn = await lpNftStakingFarm.isInWhitelist(1)
            assert.equal(isIn, true);
            isIn = await lpNftStakingFarm.isInWhitelist(100)
            assert.equal(isIn, false)
        })
    })

    // test getTotalApyOfUser
    // Note: when lp token staked, base apy will be 33%; otherwise total apy will be 0. total apy will change when nft stake or unstake
    describe('Test getTotalApyOfUser', async () => {
        it('36th test, no lp token staked, total apy of user is 0', async () => {
            // 1. get balance of accounts[0] in lpNftStakingFarm contract
            let balance = await lpNftStakingFarm.balances(accounts[0])
            // console.log('36th test, balance of accounts[0] is %s', parseWei2Ether(balance))
            assert.equal(balance, 0)
            // 2. get stakeDate of accounts[0]
            let stakeDate = await lpNftStakingFarm.stakeDates(accounts[0])
            // console.log('36th test, stake date of accounts[0] is %s', stakeDate.toString())
            assert.equal(stakeDate, 0)
            // *** make sure no lp token staked in lpNftStakingFarm contract
            // 3. check total apy of accounts[0], it will be 0
            let totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 0)

            // 4. batch unstake nft of accounts[0]
            await lpNftStakingFarm.batchUnstakeNfts([1, 2], [1, 1], '0x1111', { from: accounts[0] })
            // 5. check amount of nft id 1
            let amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            assert.equal(amount, 0)
            amount = await lpNftStakingFarm.nftBalances(accounts[0], 2)
            assert.equal(amount, 0)
        })

        // stake lp token, base apy will be 33
        it('37th test, stake lp token, then check total apy', async () => {
            // 1. account[0] approve 10000 tokens to lpNftStakingFarm
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[0] })
            // 2. stake 1000 ether to lpNftStakingFarm
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 3. stake success, check balance of accounts[0] in lpNftStakingFarm contract
            let account0Balance = await lpNftStakingFarm.balances(accounts[0])
            // console.log('37th test stake account0Balance=%s', parseWei2Ether(account0Balance))
            assert.equal(account0Balance, ether('1000'))
            // 4. stake success, check stakeDate of accounts[0]
            const timestamp = await getBlockTimestamp(receipt);
            let account0StakeDate = await lpNftStakingFarm.stakeDates(accounts[0])
            // console.log('37th stake success, timestamp=%s, account0StakeDate=%s', BN(timestamp).toString(), BN(account0StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account0StakeDate).toString())
            // 5. stake success, check total staked
            const totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
            // *** stake umi success ***
            // 6. check total apy now, it will be 33
            let totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 33)
        })

        // stake nft, total apy will change
        it('38th test, stake nft, total apy is correct', async () => {
            // total apy of accounts[0] is 33 now, stake nft
            // 1. change apy of nftId1 to 10
            await lpNftStakingFarm.setApyByTokenId(1, 10)
            // 2. check apy of nft id 1
            let apyOfNftId1 = await lpNftStakingFarm.nftApys(1)
            // console.log('38th test, apyOfNftId1=%s', apyOfNftId1)
            assert.equal(apyOfNftId1, 10)
            // 3. stake 1 nft id 1
            await lpNftStakingFarm.stakeNft(1, 1, '0x111')
            // 4. after stake nft, check total apy again, it will be 22
            let totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 43)
            // 5. stake 1 more nftId1, it will be 53
            await lpNftStakingFarm.stakeNft(1, 1, '0x111')
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 53)
            // 6. batch stake nft, check total apy 53 + 2*10 + 4 * 20=153
            await lpNftStakingFarm.batchStakeNfts([1, 2], [2, 4], '0x1111')
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 153)
        })

        // ****  Note: until now, accounts[0] staked 4 token whose nft id is 1, staked 4 token whose nft id is 2  ****
        it('39th test, unstake nft, total apy is correct', async () => {
            // 1. unstake 1 nftId1, total apy will be 143
            await lpNftStakingFarm.unstakeNft(1, 1, '0x1111')
            let totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 143)
            // 2. batch unstake all of nft, total apy will be 12 again
            await lpNftStakingFarm.batchUnstakeNfts([1, 2], [3, 4], '0x1111', { from: accounts[0] })
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 33)
        })

    })

    // ****  Note: until now, no nft staked  ****

    // test pause and unpause
    describe('Test pause and unpause', async () => {
        // before stake, owner should approve lpNftStakingFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to lpNftStakingFarm
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('40th test, pause,unpause incorrect, only owner can call them', async () => {
            await expectRevert(lpNftStakingFarm.pause({ from: accounts[1] }), 'Ownable: caller is not the owner')
            await expectRevert(lpNftStakingFarm.unpause({ from: accounts[1] }), 'Ownable: caller is not the owner')
        })

        it('41th test, stake will be failed when paused, it will be success when unpaused', async () => {
            // 1. before stake, pause
            await lpNftStakingFarm.pause({ from: accounts[0] });
            // 2. check paused state
            let pausedState = await lpNftStakingFarm.paused()
            // console.log('41th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            // 3. stake 1000 lpTokenMock to lpNftStakingFarm contract, it will fail
            await expectRevert(lpNftStakingFarm.stake(ether('1000'), { from: accounts[0] }), 'Pausable: paused')
            // 4. check balance of accounts[0] in lpNftStakingFarm contract
            let account0Balance = await lpNftStakingFarm.balances(accounts[0])
            // console.log('41th test stake account0Balance=%s', parseWei2Ether(account0Balance))
            assert.equal(account0Balance, ether('1000'))
            // 5. unpause, and stake again
            await lpNftStakingFarm.unpause({ from: accounts[0] });
            // check pause state
            pausedState = await lpNftStakingFarm.paused()
            // console.log('41th test, pause pausedState %s', pausedState)
            // stake again
            await lpNftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 6. check balance again
            account0Balance = await lpNftStakingFarm.balances(accounts[0])
            assert.equal(account0Balance, ether('2000'))
        })

        it('42th test, unstake will be failed when paused, it will be success when unpaused', async () => {
            // 1. before unstake, pause
            await lpNftStakingFarm.pause({ from: accounts[0] });
            // 2. check paused state
            let pausedState = await lpNftStakingFarm.paused()
            // console.log('42th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            // 3. unstake, it will fail when paused
            await expectRevert(lpNftStakingFarm.unstake({ from: accounts[0] }), 'Pausable: paused')
            // 4. unpause, and unstake
            // mock time pass
            await time.increase(1)
            await lpNftStakingFarm.unpause({ from: accounts[0] });
            // check paused state
            pausedState = await lpNftStakingFarm.paused()
            // console.log('42th test, unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)
            // 5. unstake again
            await lpNftStakingFarm.unstake({ from: accounts[0] });
            // 6. check balance of accounts[0] in lpNftStakingFarm contract
            let account0Balance = await lpNftStakingFarm.balances(accounts[0])
            // console.log('42th test stake account0Balance=%s', parseWei2Ether(account0Balance))
            assert.equal(account0Balance, 0)
        })

        it('43th test, stakeNft will be failed when paused, it will be success when unpaused', async () => {
            // 1. before stakeNft, pause
            await lpNftStakingFarm.pause({ from: accounts[0] });
            // 2. stakeNft, it will fail when paused
            await expectRevert(lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] }), 'Pausable: paused')
            // 3. check balance of nft token
            let amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('43th test, amount of nftId1=%s', amount)
            assert.equal(amount, 0)
            // 4. unpause and stakeNft again
            // mock time pass
            await time.increase(1)
            await lpNftStakingFarm.unpause({ from: accounts[0] });
            // stake nft again, it will success
            await lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
            amount = await lpNftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('43th test, amount of nftId1=%s', amount)
            assert.equal(amount, 1)
        })
    })

    // full test for stake, stakeNft, batchStakeNfts, unstake, unstakeNft, batchUnstakeNfts
    describe('Full test for accounts[2]', async () => {
        before(async () => {
            // account[2] approve 10000 tokens to lpNftStakingFarm
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('10000'), { from: accounts[2] })
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[2] });
        })

        it('44th test, stake twice and unstake, without nft', async () => {
            // 1. check balance, total staked
            let balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, 0)
            let totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)
            let umiBalanceBeforeFirstStake = await lpNftStakingFarm.getUmiBalance(accounts[2])
            // console.log('44th test, before first stake umi balance=%s', parseWei2Ether(umiBalanceBeforeFirstStake))

            // 2. stake 1000 ether
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[2] })

            // 3. check balance, umi balance, total staked again
            balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1000'))
            totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
            let umiBalanceAfterFirstStake = await lpNftStakingFarm.getUmiBalance(accounts[2])
            // console.log('44th test, after first stake umi balance=%s', parseWei2Ether(umiBalanceAfterFirstStake))

            // 4. stake success, check stakeDate of accounts[2]
            let timestamp = await getBlockTimestamp(receipt);
            let stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 5. increase 10 days
            await time.increase(TEN_DAYS)

            let umiBalanceBeforeSecondStake = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('44th test, before second stake umi balance=%s', parseWei2Ether(umiBalanceBeforeSecondStake))

            // 6. stake another 1000, balance=1000, apy=33%, 10 days, umi interest will be about 9.09
            receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[2] })

            // 7. check balance, umi balance, total staked again
            // balance will more than 2000 ether
            balance = await lpNftStakingFarm.balances(accounts[2])
            let umiBalanceAfterSecondStake = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('44th test, after second stake umi balance=%s', parseWei2Ether(umiBalanceAfterSecondStake))
            console.log('44th test, stake 1000, 10 days later, stake another 1000, balance=%s', parseWei2Ether(balance))
            console.log('44th test, balance=1000, apy=33%, timePassed=10 days, calculate interest=%s', parseWei2Ether(umiBalanceAfterSecondStake) - parseWei2Ether(umiBalanceBeforeSecondStake))
            // Notice:  balance=1000, apy=33%, timePassed=10 days, calculate interest= 9.077968351419404
            assert.equal(parseWei2Ether(balance), 2000)
            totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 2000)

            // 8. stake success, check stakeDate of accounts[2]
            timestamp = await getBlockTimestamp(receipt)
            stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 9. now balance of accounts[2] is 2000, unstake after ten days later, increase time
            await time.increase(TEN_DAYS)

            // 10. before unstake, check total umi balance of accounts[2]
            let balanceBeforeUnstake = await lpNftStakingFarm.balances(accounts[2])
            let totalUmiBalanceBeforeUnstake = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('44th test, another 10 days later, before unstake, lpToken balance of accounts[2] in lpNftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceBeforeUnstake), parseWei2Ether(totalUmiBalanceBeforeUnstake))

            // 11. unstake
            await lpNftStakingFarm.unstake({ from: accounts[2] })

            // 12. after unstake, check balance of accounts[2]
            let balanceAfterUnstake = await lpNftStakingFarm.balances(accounts[2])

            // 13. after unstake, check total umi balance of accounts[2]
            let totalUmiBalanceAfterUnstake = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('44th test, another 10 days later, after unstake, balance of accounts[2] in lpNftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceAfterUnstake), parseWei2Ether(totalUmiBalanceAfterUnstake))
            console.log('44th test, balance=2000, apy=33%, timePassed=10 days, calculate interest=%s', parseWei2Ether(totalUmiBalanceAfterUnstake) - parseWei2Ether(totalUmiBalanceBeforeUnstake))

            // 14. unstake success, check total
            totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)
            // 15. check total funding
            let totalFunding = await lpNftStakingFarm.totalFunding();
            console.log('44th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            // 16. no lp token to unstake, revert with insufficient funds
            await expectRevert(lpNftStakingFarm.unstake({ from: accounts[2] }), 'insufficient funds')
        })

        it('45th test, stake, unstake with nft apy boosters', async () => {
            // 1. check balance
            let balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, 0)

            // 2. check total apy of accounts[2]
            let totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 0)

            // 3. stake 1000 ether
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[2] })

            // 4. check balance, umi balance, total apy again
            balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1000'))
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 33)
            let umiBalanceBeforeStakeNft = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, umiBalanceBeforeStakeNft=%s', parseWei2Ether(umiBalanceBeforeStakeNft))

            // 5. stake success, check stakeDate of accounts[2]
            let timestamp = await getBlockTimestamp(receipt);
            let stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 6. check apy of nft
            let apy = await lpNftStakingFarm.nftApys(1)
            // [nft,apy]->[1,10]
            assert.equal(apy, 10)
            apy = await lpNftStakingFarm.nftApys(2)
            // [nft,apy]->[2,20]
            assert.equal(apy, 20)
            apy = await lpNftStakingFarm.nftApys(3)
            // [nft,apy]->[3,30]
            assert.equal(apy, 30)

            // until now, staked 1000 in contract

            // 7. increase time(one year later)
            await time.increase(ONE_YEAR)

            // 8. one year later, stake nft, total apy, balance will change
            // staked 1 token whose nft id is 1, its apy=10
            await lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[2] })

            // 9. check nft ids array, if nft id exist, total apy
            let idArray = await lpNftStakingFarm.getUserNftIds(accounts[2])
            assert.equal(String(idArray), '1')
            let ifNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[2], 1)
            assert.equal(ifNftIdExist, true)
            // total apy will be 43
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 43)

            // 10. balance=1000, apy=33%, timePassed=1 year
            balance = await lpNftStakingFarm.balances(accounts[2])
            let umiBalanceAfterStakeNft = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, umiBalanceAfterStakeNft=%s', parseWei2Ether(umiBalanceAfterStakeNft))
            console.log('45th test, balance=1000, apy=33%, timePassed=1 year, then new balance=%s, interest=%s', parseWei2Ether(balance), parseWei2Ether(umiBalanceAfterStakeNft) - parseWei2Ether(umiBalanceBeforeStakeNft))

            // 11. another one year later
            await time.increase(ONE_YEAR)
            let umiBalanceBeforeStakeNft2 = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, umiBalanceBeforeStakeNft2=%s', parseWei2Ether(umiBalanceBeforeStakeNft2))
            // *** until now, balance=1000, total apy=43%, stake 1 more nft
            // 11. staked 1 more token whose nft id is 1, its apy=10
            await lpNftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[2] })
            let umiBalanceAfterStakeNft2 = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, umiBalanceAfterStakeNft2=%s', parseWei2Ether(umiBalanceAfterStakeNft2))
            // 12. check nft ids array, if nft id exist, total apy again
            idArray = await lpNftStakingFarm.getUserNftIds(accounts[2])
            // id array will still be 1
            assert.equal(String(idArray), '1')
            ifNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[2], 1)
            assert.equal(ifNftIdExist, true)
            // total apy will be 53
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 53)

            // 13. check balance again
            balance = await lpNftStakingFarm.balances(accounts[2])
            console.log('45th test, balance=1000, apy=43%, timePassed=1 year, then new balance=%s, umi interest=%s', parseWei2Ether(balance), parseWei2Ether(umiBalanceAfterStakeNft2) - parseWei2Ether(umiBalanceBeforeStakeNft2))

            // until now, balance=1000, total apy=53%, stake 1000 lpToken again
            let umiBalanceBeforeStake2 = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, umiBalanceBeforeStake2=%s', parseWei2Ether(umiBalanceBeforeStake2))
            // 14. one year later
            await time.increase(ONE_YEAR)
            // 15. stake 1000 umi
            receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[2] })
            // 16. check balance, total apy again
            balance = await lpNftStakingFarm.balances(accounts[2])
            let umiBalanceAfterStake2 = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, umiBalanceAfterStake2=%s', parseWei2Ether(umiBalanceAfterStake2))
            console.log('45th test, balance=1000, apy=53%, timePassed=1 year, then new balance=%s, umi interest=%s', parseWei2Ether(balance), parseWei2Ether(umiBalanceAfterStake2) - parseWei2Ether(umiBalanceBeforeStake2))
            assert.equal(balance, ether('2000'))
            // 17. stake success, check stakeDate of accounts[2]
            timestamp = await getBlockTimestamp(receipt);
            stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // until now, balance=2000, total apy=53%
            // 18. mock time increase 
            await time.increase(1)
            // batch stake nfts ids:[2,3]-> values:[2,2]
            await lpNftStakingFarm.batchStakeNfts([2, 3], [2, 2], '0x1111', { from: accounts[2] })
            // 19. check nft ids array, if nft id exist, total apy again
            idArray = await lpNftStakingFarm.getUserNftIds(accounts[2])
            // id array will still be 1
            assert.equal(String(idArray), '1,2,3')
            ifNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[2], 1)
            assert.equal(ifNftIdExist, true)
            ifNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[2], 2)
            assert.equal(ifNftIdExist, true)
            ifNftIdExist = await lpNftStakingFarm.isNftIdExist(accounts[2], 3)
            assert.equal(ifNftIdExist, true)
            // total apy will be 153, ids: [1,2,3]-> values: [2,2,2]
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 153)

            // 20. check total funding
            let totalFunding = await lpNftStakingFarm.totalFunding();
            console.log('45th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 20. funding contract again
            await umiTokenMock.approve(lpNftStakingFarm.address, ether('1000000'), { from: accounts[0] })
            await lpNftStakingFarm.fundingContract(ether('100000'), { from: accounts[0] });
            // check total funding again
            totalFunding = await lpNftStakingFarm.totalFunding();
            console.log('45th test, check total funding totalFunding before unstake=%s', parseWei2Ether(totalFunding));

            // until now, balance=2000, total apy=153%
            // 21. before unstake, check balance, total lp balance of accounts[2]
            let balanceBeforeUnstake = await lpNftStakingFarm.balances(accounts[2])
            let totalUmiBalanceBefore = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('45th test, before unstake, balance of accounts[2] in lpNftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceBeforeUnstake), parseWei2Ether(totalUmiBalanceBefore))

            // 22. two years later, unstake
            await time.increase(TWO_YEARS)
            await lpNftStakingFarm.unstake({ from: accounts[2] })
            // 23. after unstake, check balance of accounts[2]
            let balanceAfterUnstake = await lpNftStakingFarm.balances(accounts[2])
            // 24. after unstake, check balance, total umi balance of accounts[2]
            let totalUmiBalanceAfter = await lpNftStakingFarm.getUmiBalance(accounts[2])
            // after unstake balance in lpNftStakingFarm will be 0
            console.log('45th test, another 2 years later, after unstake, balance of accounts[2] in lpNftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceAfterUnstake), parseWei2Ether(totalUmiBalanceAfter))
            console.log('45th test, balance=2000, apy=153%, timePassed=2 years, umi calculate interest=%s', parseWei2Ether(totalUmiBalanceAfter) - parseWei2Ether(totalUmiBalanceBefore))

            // 25. when unstaked all lpToken, check total apy again
            totalApy = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 0)
            totalFunding = await lpNftStakingFarm.totalFunding();
            console.log('45th test, check total funding totalFunding after unstake=%s', parseWei2Ether(totalFunding))
        })
    })

    // test claim method
    describe('Test claim', async () => {
        before(async () => {
            // account[0] approve 100000000 umi tokens to lpNftStakingFarm
            await umiTokenMock.approve(lpNftStakingFarm.address, ether('10000000'), { from: accounts[0] })
            // account[2] approve 10000 lp tokens to lpNftStakingFarm
            await lpTokenMock.approve(lpNftStakingFarm.address, ether('10000000'), { from: accounts[2] })
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(lpNftStakingFarm.address, true, { from: accounts[2] });
        })

        it('46th test, claim will fail when paused', async () => {
            // 1. before claim, pause(by owner)
            await lpNftStakingFarm.pause({ from: accounts[0] });
            // 2. check paused state
            let pausedState = await lpNftStakingFarm.paused()
            // console.log('46th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            // 3. claim, it will fail
            await expectRevert(lpNftStakingFarm.claim({ from: accounts[0] }), 'Pausable: paused')
            // 4. unpause
            await lpNftStakingFarm.unpause({ from: accounts[0] });
        })

        it('47th test, claim fail because of balance<=0', async () => {
            await expectRevert(lpNftStakingFarm.claim({ from: accounts[3] }), 'balance should more than 0')
        })

        it('48th test, claim interest of accounts[2] incorrect, interest must more than 0 and total funding not enough to pay interest', async () => {
            // 1. check balance of accounts[2]
            let balance = await lpNftStakingFarm.balances(accounts[2])
            // console.log('48th test, balance of accounts[2]\'s = %s', balance)
            assert.equal(balance, 0)

            // 2. check totalStaked
            let totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)

            // 3. check totalFunding
            let totalFunding = await lpNftStakingFarm.totalFunding()
            // console.log('48th test, totalFunding=%s', parseWei2Ether(totalFunding))

            // 4. stake 1000 ether
            let receipt = await lpNftStakingFarm.stake(ether('1000'), { from: accounts[2] })

            // 5. check balance, principal, total staked again
            balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1000'))
            totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)

            // 6. stake success, check stakeDate of accounts[2]
            let timestamp = await getBlockTimestamp(receipt);
            let stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 8. check umi balance of accounts[2]
            let umiBalance = await lpNftStakingFarm.getUmiBalance(accounts[2])
            // console.log('48th test, umiBalance of accounts[2]=%s', parseWei2Ether(umiBalance))

            // 9. stake another 1000000
            await lpNftStakingFarm.stake(ether('1000000'), { from: accounts[2] })

            // 10. check balance, principal, total staked again
            balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1001000'))
            totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1001000)

            stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            // console.log('stakeDate=%s', stakeDate)

            // 11. increase one year
            await time.increase(ONE_YEAR)

            stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            // console.log('stakeDate=%s', stakeDate)

            // 12. claim incorrect with total funding not enough to pay interest
            await expectRevert(lpNftStakingFarm.claim({ from: accounts[2] }), 'total funding not enough to pay interest')
        })

        it('49th test, claim success', async () => {
            // 1. accounts[0] funding contract again
            await lpNftStakingFarm.fundingContract(ether('5000000'), { from: accounts[0] });
            // 2. check total funding
            // 3. check balance, principal, total staked, total funding again
            let balance = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1001000'))
            let totalStaked = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1001000)
            let totalFunding = await lpNftStakingFarm.totalFunding()
            let umiBalance = await lpNftStakingFarm.getUmiBalance(accounts[2])

            let stakeDate = await lpNftStakingFarm.stakeDates(accounts[2])
            console.log('49th test, before claim, balance=%s, totalStaked=%s, totalFunding=%s, stakeDate=%s, umiBalance=%s', parseWei2Ether(balance), parseWei2Ether(totalStaked), parseWei2Ether(totalFunding), stakeDate, parseWei2Ether(umiBalance))

            // 4. claim
            let receipt = await lpNftStakingFarm.claim({ from: accounts[2] })

            // 5. after claim check balance, principal, total staked, total funding again
            let balanceAfter = await lpNftStakingFarm.balances(accounts[2])
            assert.equal(balanceAfter, ether('1001000'))
            let totalStakedAfter = await lpNftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStakedAfter), 1001000)
            let totalFundingAfter = await lpNftStakingFarm.totalFunding()
            let stakeDateAfter = await lpNftStakingFarm.stakeDates(accounts[2])
            let umiBalanceAfter = await lpNftStakingFarm.getUmiBalance(accounts[2])
            console.log('49th test, after claim, balanceAfter=%s, totalStakedAfter=%s, totalFundingAfter=%s, stakeDateAfter=%s, umiBalanceAfter=%s', parseWei2Ether(balanceAfter), parseWei2Ether(totalStakedAfter), parseWei2Ether(totalFundingAfter), stakeDateAfter, parseWei2Ether(umiBalanceAfter))

            // 6. balance of accounts[2] unchanged after claim
            assert.equal(parseWei2Ether(balance), parseWei2Ether(balanceAfter))
            // totalStaked unchanged after claim
            assert.equal(parseWei2Ether(totalStaked), parseWei2Ether(totalStakedAfter))
            // after claim, time will be updated
            let timestamp = await getBlockTimestamp(receipt);
            assert.equal(BN(timestamp).toString(), BN(stakeDateAfter).toString())

            let totalApyOfAccount2 = await lpNftStakingFarm.getTotalApyOfUser(accounts[2])
            // assert.equal(totalApyOfAccount2, 0)
            console.log('49th test, total apy of accounts[2]=%s', totalApyOfAccount2)

            let interest = parseWei2Ether(umiBalanceAfter) - parseWei2Ether(umiBalance)
            console.log('49th test, principal=1001000 with apy=153%, one year later, interest=%s', interest)
        })
    })

})