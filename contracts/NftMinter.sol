//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./utils/Strings.sol";
import "./ERC20Interface.sol";

/**
 * NftMinter
 *
 * Note: when deploy contract, you should assign uri prefix.
 * Example of metadata:
 * {
        description: "nft desc",
        external_url: "https://openseacreatures.io/3",
        image: "https://storage.googleapis.com/opensea-prod.appspot.com/creature/3.png",
        name: "nft name"
    }
 */
contract NftMinter is ERC1155Burnable, ReentrancyGuard, Pausable, Ownable {
    using Address for address;
    using SafeMath for uint256;
    using Counters for Counters.Counter;

    /**
     * Emitted when transfer minting fee.
     * @param nftId The identifier for an NFT.
     * @param payer The payer of minting fee.
     * @param recipient The recipient.
     * @param totalMintingFee Current total minting fee.
     * @param percent The minting fee precent of recipient.
     * @param amount The amount of minting fee for the recipent.
     */
    event TransferMintingFee(
        uint256 nftId,
        address indexed payer,
        address indexed recipient,
        uint256 totalMintingFee,
        uint256 percent,
        uint256 amount
    );

    // token uri prefix
    string public uriPrefix;
    // nft id counter
    Counters.Counter public idCounter;
    // the mapping for nft info(nft id->nftInfo)
    mapping(uint256 => NftInfo) nftInfos;
    // nftId => fees
    mapping(uint256 => Fee[]) public fees;
    // minting fee(default 100e18)
    uint256 public mintingFee = 100e18;

    // The name and symbol will be displayed in OpenSea
    // Contract name
    string public name;
    // Contract symbol
    string public symbol;

    // umiToken(use umiToken to pay minting fee)
    ERC20Interface public umiToken;

    // the struct for minting fee
    struct Fee {
        // fee recipent
        address recipient;
        // 50 stands for 50%
        uint256 percent;
    }

    // The struct for nft info
    struct NftInfo {
        uint256 tokenSupply;
        address creator;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _uriPrefix,
        address _umiAddress
    ) ERC1155(_uriPrefix) {
        require(
            _umiAddress.isContract(),
            "_umiAddress must be contract address"
        );
        name = _name;
        symbol = _symbol;
        uriPrefix = _uriPrefix;
        umiToken = ERC20Interface(_umiAddress);
    }

    /**
     * User use in house ERC1155 contract to mint their tokens with low flat fee.
     *
     * @param _owner The recipient.
     * @param _fees The mintnig fee.(format: [["0x12345678",40],["0x87654321",60]])
     * @param _amount The amount of token.
     */
    function mint(
        address _owner,
        Fee[] memory _fees,
        uint256 _amount,
        bytes memory data
    ) external whenNotPaused nonReentrant {
        require(_amount != 0, "amount should be positive");

        // mint nft to the owner
        uint256 nftId = safeMint(_owner, _amount, data);
        for (uint256 i = 0; i < _fees.length; i++) {
            require(
                _fees[i].recipient != address(0x0),
                "Recipient should be present"
            );
            require(_fees[i].percent != 0, "Fee percent should be positive");
            fees[nftId].push(_fees[i]);

            // calculate minting fee
            uint256 umiAmount = SafeMath.div(
                SafeMath.mul(_fees[i].percent, mintingFee),
                100
            );
            require(umiAmount > 0, "umi mintingFee should bigger than 0");
            // send fee to UMI.DIGITAL DEV fund and UMI Farming Pool
            require(
                umiToken.transferFrom(
                    msg.sender,
                    _fees[i].recipient,
                    umiAmount
                ),
                "transferFrom mintingFee failed"
            );
            // send event
            emit TransferMintingFee(
                nftId,
                msg.sender,
                _fees[i].recipient,
                mintingFee,
                _fees[i].percent,
                umiAmount
            );
        }
    }

    /**
     *  Mint method.
     */
    function safeMint(
        address owner,
        uint256 amount,
        bytes memory data
    ) internal returns (uint256) {
        idCounter.increment();
        uint256 nftId = idCounter.current();
        // set nft info
        setNftInfo(nftId, amount);
        _mint(owner, nftId, amount, data);
        // by default, it will send event -> emit TransferSingle(msg.sender, address(0), owner, nftId, amount)
        return nftId;
    }

    /**
     * Set nft info.
     */
    function setNftInfo(uint256 _nftId, uint256 _amount) internal {
        NftInfo storage nftInfo = nftInfos[_nftId];
        nftInfo.tokenSupply = _amount;
        nftInfo.creator = msg.sender;
    }

    /**
     * Get uri of certain nft.(override uri method)
     *
     * @param nftId The nft id.
     */
    function uri(uint256 nftId) public view override returns (string memory) {
        return Strings.strConcat(uriPrefix, Strings.uint2str(nftId));
    }

    /**
     * Get current nft id.
     */
    function getCurrentNftId() public view returns (uint256) {
        return idCounter.current();
    }

    /**
     * @dev Returns the total quantity for a token ID
     * @param _id The identifier for an NFT.
     * @return amount of token in existence
     */
    function totalSupply(uint256 _id) public view returns (uint256) {
        NftInfo storage nftInfo = nftInfos[_id];
        return nftInfo.tokenSupply;
    }

    /**
     * Get nft info by id.
     * @param nftId The identifier for an NFT.
     */
    function getNftInfo(uint256 nftId) public view returns (NftInfo memory) {
        NftInfo storage nftInfo = nftInfos[nftId];
        return nftInfo;
    }

    /**
     * Get creator of nft.
     * @param nftId The identifier for an NFT.
     */
    function getCreator(uint256 nftId) public view returns (address) {
        NftInfo memory nftInfo = getNftInfo(nftId);
        return nftInfo.creator;
    }

    /**
     * Returns whether the specified token exists by checking to see if it has a creator
     * @param _id uint256 ID of the token to query the existence of
     * @return bool whether the token exists
     */
    function exists(uint256 _id) public view returns (bool) {
        NftInfo memory nftInfo = getNftInfo(_id);
        return nftInfo.creator != address(0);
    }

    /**
     * Find the owner of an NFT.
     * @param _nftId The identifier for an NFT.
     * @return Whether the user is the owner of nft.
     */
    function ownerOf(uint256 _nftId) public view returns (bool) {
        return balanceOf(msg.sender, _nftId) != 0;
    }

    /**
     * @dev Will update the base URL of token's URI
     * @param _newUriPrefix New base URL of token's URI
     */
    function setUriPrefix(string memory _newUriPrefix) public onlyOwner {
        uriPrefix = _newUriPrefix;
    }

    /**
     * Adjust fee.
     *
     * Note: only owner can adjust the fee.
     *
     * @param _newFee The new minting fee.
     */
    function adjustFee(uint256 _newFee) public onlyOwner {
        require(_newFee > 0, "newFee should more than 0");
        mintingFee = _newFee;
    }

    /**
     * Pauses all token stake, unstake.
     *
     * See {Pausable-_pause}.
     *
     * Requirements: the caller must be the owner.
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * Unpauses all token stake, unstake.
     *
     * See {Pausable-_unpause}.
     *
     * Requirements: the caller must be the owner.
     */
    function unpause() public onlyOwner {
        _unpause();
    }
}