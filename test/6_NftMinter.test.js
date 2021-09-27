require("dotenv").config()
const { time, constants, expectRevert } = require('@openzeppelin/test-helpers');
const UmiTokenMock = artifacts.require("UmiTokenMock");
const NftMinter = artifacts.require("NftMinter");
const BigNumber = require('bignumber.js');
const { assert } = require("chai");

require('chai')
    .use(require('chai-as-promised'))
    .should()

var BN = web3.utils.BN;

let ipfsHash = 'QmPrG6Kq22LjMdJbQZxFgS3xzD9tG4m9VkD3gLnQhYbpoq'
let ipfsHash2 = 'QmTzogcqAa4YFQPh77wmgfzYawcNzBrmHNb8rJd6Zq1bSt'
let ipfsPrefix = 'https://ipfs.io/ipfs/'

function ether(n) {
    return web3.utils.toWei(n, 'ether')
}

function parseWei2Ether(wei) {
    return web3.utils.fromWei(wei, 'ether')
}

contract('NftMinter', async (accounts) => {

    const YEAR = new BN(31536000); // in seconds
    const TEN_DAYS = new BN(10 * 24 * 60 * 60);
    const ONE_DAYS = new BN(24 * 60 * 60);
    const TWO_YEARS = new BN(2 * 31536000)

    async function getBlockTimestamp(receipt) {
        return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp);
    }

    let umiTokenMock
    let nftMinter

    beforeEach(async () => {
        // first erc20 token
        umiTokenMock = await UmiTokenMock.new()
        nftMinter = await NftMinter.new('NftMinter', 'Nft', umiTokenMock.address)
        // console.log('UmiTokenMock is deployed to %s', umiTokenMock.address)
        // console.log('NftMinter is deployed to %s', nftMinter.address)

        // transfer 2000000000 UmiToken to account[1]
        await umiTokenMock.transfer(accounts[1], ether('2000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiTOken to account[2]
        await umiTokenMock.transfer(accounts[2], ether('1000000000'), { from: accounts[0] })

        // console.log('accounts[5]=%s, accounts[6]=%s', accounts[5], accounts[6])
    })

    // test constructor method
    describe('Test constructor', async () => {
        it('1st test, constructor should be set up correctly', async () => {
            // 1. UmiToken address is correct
            const umiTokenAddress = await nftMinter.umiToken()
            assert.equal(umiTokenAddress, umiTokenMock.address)
            // 2. name is correct
            const nftName = await nftMinter.name()
            assert.equal(nftName, "NftMinter")
            // 3. symbol is correct
            const nftSymbol = await nftMinter.symbol()
            assert.equal(nftSymbol, 'Nft')
            // 4. uriPrefix is correct
            const uriPrefix = await nftMinter.uriPrefix()
            assert.equal(uriPrefix, 'https://ipfs.io/ipfs/')
        })

        it('2nd test, fail if _umiAddress is incorrect', async () => {
            await expectRevert(NftMinter.new('NftMinter', 'Nft', accounts[0]), '_umiAddress must be contract address')
        })
    })

    // test mint method
    describe('Test mint', async () => {
        it('3rd test, transfer minting fee failed without approve umi token', async () => {
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            console.log('3rd test, ipfsHash=%s', ipfsHash)
            await expectRevert(nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11'), 'ERC20: transfer amount exceeds allowance')
        })

        it('4th test, mint fail when amount incorrect', async () => {
            // approve first
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await expectRevert(nftMinter.mint(accounts[0], fees, 0, ipfsHash, '0x11'), 'amount should be positive')
        })

        it('5th test, mint fail when fee recipient is incorrect', async () => {
            // approve first
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[constants.ZERO_ADDRESS, 40], [accounts[4], 60]]
            await expectRevert(nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11'), 'Recipient should be present')
        })

        it('6th test, mint fail when fee percent is incorrect', async () => {
            // approve first
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 0], [accounts[4], 60]]
            await expectRevert(nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11'), 'Fee percent should be positive')
        })

        it('7th test, mint correct', async () => {
            // approve first
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            // before mint, current nft id will be 0
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 0)
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            // after mint success, nft id will be 1
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 1)

            // mint success, check umi token transfer
            const umiBalanceOfAccount3 = await umiTokenMock.balanceOf(accounts[3])
            assert.equal(parseWei2Ether(umiBalanceOfAccount3), 40)
            const umiBalanceOfAccount4 = await umiTokenMock.balanceOf(accounts[4])
            assert.equal(parseWei2Ether(umiBalanceOfAccount4), 60)
        })

        it('8th test, mint fail when umi mintingFee incorrect', async () => {
            // approve first
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            // before mint, current nft id will be 0
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 0)
            // set minting fee and percent to a low value
            await nftMinter.adjustFee(1)
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await expectRevert(nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11'), 'umi mintingFee should bigger than 0')
            // after mint fail, nft id will be 0
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 0)
        })
    })

    // test uri
    describe('Test uri', async () => {
        it('9th test, uri get correct', async () => {
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash2, '0x11')
            const token1Uri = await nftMinter.uri(1)
            const token1IpfsHash = await nftMinter.getIpfsHash(1)
            assert.equal(token1IpfsHash, ipfsHash2)
            assert.equal(token1Uri, 'https://ipfs.io/ipfs/' + ipfsHash2)
        })
    })

    // test getCurrentNftId
    describe('Test getCurrentNftId', async () => {
        it('10th test, getCurrentNftId correct', async () => {
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('200'), { from: accounts[0] })
            // before mint, current nft id will be 0
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 0)
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            // after mint success, nft id will be 1
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 1)
            // mint again
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            // after mint success, nft id will be 2
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 2)
        })
    })

    // test totalSupply
    describe('Test totalSupply', async () => {
        it('11th test, get totalSupply correct', async () => {
            // before mint
            let totalSupply = await nftMinter.totalSupply(1)
            assert.equal(totalSupply, 0)
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            totalSupply = await nftMinter.totalSupply(1)
            assert.equal(totalSupply, 1)
        })
    })

    // test getNftInfo
    describe('Test getNftInfo', async () => {
        it('12th test, getNftInfo correct', async () => {
            // before mint
            let [totalSupply, creator] = await nftMinter.getNftInfo(1)
            assert.equal(totalSupply, 0)
            assert.equal(creator, constants.ZERO_ADDRESS)
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            let [totalSupply1, creator1] = await nftMinter.getNftInfo(1)
            assert.equal(totalSupply1, 1)
            assert.equal(creator1, accounts[0].toString())
        })
    })

    // test getCreator
    describe('Test getCreator', async () => {
        it('13th test, getCreator correct', async () => {
            // before mint
            let creator = await nftMinter.getCreator(1)
            assert.equal(creator, constants.ZERO_ADDRESS)
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            creator = await nftMinter.getCreator(1)
            assert.equal(creator, accounts[0].toString())
        })
    })

    // test exists
    describe('Test exists', async () => {
        it('14th test, test exists correct', async () => {
            // before mint
            let exists = await nftMinter.exists(1)
            assert.equal(exists, false)
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            exists = await nftMinter.exists(1)
            assert.equal(exists, true)
        })
    })

    // test ownerOf
    describe('Test ownerOf', async () => {
        it('15th test, test ownerOf correct', async () => {
            // before mint
            let ownerOf = await nftMinter.ownerOf(1)
            assert.equal(ownerOf, false)
            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')
            ownerOf = await nftMinter.ownerOf(1)
            assert.equal(ownerOf, true)
        })
    })

    // test setUriPrefix
    describe('Test setUriPrefix', async () => {
        it('16th test, test setUriPrefix correct', async () => {
            // before mint
            let uriPrefix = await nftMinter.uriPrefix()
            assert.equal(uriPrefix, ipfsPrefix)
            await nftMinter.setUriPrefix('https://umi.digital/new/')
            uriPrefix = await nftMinter.uriPrefix()
            assert.equal(uriPrefix, 'https://umi.digital/new/')
            // reset uri prefix
            await nftMinter.setUriPrefix(ipfsPrefix)
        })

        it('17th test, setUriPrefix incorrect by non-owner', async () => {
            await expectRevert(nftMinter.setUriPrefix('https://umi.digital/new/', {from: accounts[1]}), 'Ownable: caller is not the owner')
        })
    })

    // test adjustFee
    describe('Test adjustFee', async () => {
        it('18th test, test adjustFee correct', async () => {
            // before change, check minting fee
            let mintingFee = await nftMinter.mintingFee()
            assert.equal(parseWei2Ether(mintingFee), 100)
            await nftMinter.adjustFee(ether('200'))
            mintingFee = await nftMinter.mintingFee()
            assert.equal(parseWei2Ether(mintingFee), 200)
        })

        it('19th test, adjustFee incorrect by non-owner', async () => {
            await expectRevert(nftMinter.adjustFee(ether('200'), {from: accounts[1]}), 'Ownable: caller is not the owner')
        })
    })

    // test pause and unpause
    // test pause and unpause
    describe('Test pause and unpause', async () => {
        it('20th test, pause,unpause incorrect, only owner can call them', async () => {
            await expectRevert(nftMinter.pause({from: accounts[1]}), 'Ownable: caller is not the owner')
            await expectRevert(nftMinter.unpause({from: accounts[1]}), 'Ownable: caller is not the owner')
        })

        it('21th test, mint will be failed when paused, and will be success when unpaused', async () => {
            // check paused state
            let pausedState = await nftMinter.paused()
            assert.equal(pausedState, false)
            // paused
            await nftMinter.pause({from: accounts[0]})
            pausedState = await nftMinter.paused()
            assert.equal(pausedState, true)

            // accounts[0] approve 100 tokens to NftMinter
            await umiTokenMock.approve(nftMinter.address, ether('100'), { from: accounts[0] })
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            await expectRevert(nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11'), 'Pausable: paused')

            await nftMinter.unpause({from: accounts[0]})

            await nftMinter.mint(accounts[0], fees, 1, ipfsHash, '0x11')

            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 1)
        })
    })

    // test burn
    describe("Test burn", async () => {
        beforeEach('mint tokens before burn', async () => {
            // accounts[0] approve 100 tokens to NftMinter to pay minting fee
            await umiTokenMock.approve(nftMinter.address, ether('200'), { from: accounts[0] })
            // before mint, current nft id will be 0
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 0)
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            // mint twice
            await nftMinter.mint(accounts[0], fees, 10, ipfsHash, '0x11')
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 1)
            await nftMinter.mint(accounts[0], fees, 20, ipfsHash, '0x11')
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 2)
        })

        it('22th test, holder can burn their tokens', async () => {
            // 1. check nft id
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 2)
            // 2. check balance of token id 1
            let balanceOfToken1 = await nftMinter.balanceOf(accounts[0], 1)
            assert.equal(balanceOfToken1, 10)
            // 3. check balance of token id 2
            let balanceOfToken2 = await nftMinter.balanceOf(accounts[0], 2)
            assert.equal(balanceOfToken2, 20)
            // 4. burn 4 token 1
            await nftMinter.burn(accounts[0], 1, 4)
            // 5. check balance of token id 1 again
            balanceOfToken1 = await nftMinter.balanceOf(accounts[0], 1)
            assert.equal(balanceOfToken1, 6)
        })

        it('23th test, unapproved accounts cannot burn the holder\'s tokens', async () => {
            // accounts[0] is holder
            await expectRevert(nftMinter.burn(accounts[0], 1, 4, {from: accounts[2]}), 'ERC1155: caller is not owner nor approved')
        })

        it('24th test, approved operators can burn the holder\'s tokens', async () => {
            // accounts[0] is holder, accounts[2] is operator
            await nftMinter.setApprovalForAll(accounts[2], true, { from: accounts[0] })
            await nftMinter.burn(accounts[0], 1, 5, { from: accounts[2] })

            // check balance of token id 1
            let balanceOfToken1 = await nftMinter.balanceOf(accounts[0], 1)
            assert.equal(balanceOfToken1, 5)
        })
    })

    // test burnBatch
    describe("Test burnBatch", async () => {
        beforeEach('mint tokens before burnBatch', async () => {
            // accounts[0] approve 100 tokens to NftMinter to pay minting fee
            await umiTokenMock.approve(nftMinter.address, ether('200'), { from: accounts[0] })
            // before mint, current nft id will be 0
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 0)
            const fees = [[accounts[3], 40], [accounts[4], 60]]
            // mint twice
            await nftMinter.mint(accounts[0], fees, 10, ipfsHash, '0x11')
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 1)
            await nftMinter.mint(accounts[0], fees, 20, ipfsHash, '0x11')
            nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 2)
        })

        it('25th test, holder can burn their tokens', async () => {
            // 1. check nft id
            let nftId = await nftMinter.getCurrentNftId()
            assert.equal(nftId, 2)
            // 2. check balance of token id 1
            let balanceOfToken1 = await nftMinter.balanceOf(accounts[0], 1)
            assert.equal(balanceOfToken1, 10)
            // 3. check balance of token id 2
            let balanceOfToken2 = await nftMinter.balanceOf(accounts[0], 2)
            assert.equal(balanceOfToken2, 20)
            // 4. burnBatch
            await nftMinter.burnBatch(accounts[0], [1,2], [4,8], {from: accounts[0]})
            // 5. check balance of token again
            balanceOfToken1 = await nftMinter.balanceOf(accounts[0], 1)
            assert.equal(balanceOfToken1, 6)
            balanceOfToken2 = await nftMinter.balanceOf(accounts[0], 2)
            assert.equal(balanceOfToken2, 12)
        })

        it('26th test, unapproved accounts cannot burn the holder\'s tokens', async () => {
            // accounts[0] is holder
            await expectRevert(nftMinter.burnBatch(accounts[0], [1,2], [4,8], {from: accounts[2]}), 'ERC1155: caller is not owner nor approved')
        })

        it('27th test, approved operators can burn the holder\'s tokens', async () => {
            // accounts[0] is holder, accounts[2] is operator
            await nftMinter.setApprovalForAll(accounts[2], true, { from: accounts[0] })
            await nftMinter.burnBatch(accounts[0], [1,2], [5,10], {from: accounts[2]})

            // check balance of token id 1
            const balanceOfToken1 = await nftMinter.balanceOf(accounts[0], 1)
            assert.equal(balanceOfToken1, 5)
            const balanceOfToken2 = await nftMinter.balanceOf(accounts[0], 2)
            assert.equal(balanceOfToken2, 10)
        })
    })

})