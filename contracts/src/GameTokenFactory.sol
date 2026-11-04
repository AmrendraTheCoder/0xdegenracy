// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {GameToken} from "./GameToken.sol";
import {PrizePool} from "./PrizePool.sol";

/// @title GameTokenFactory — deploys one GameToken per Reachy game and owns the shared PrizePool.
/// @notice Permissionless: anyone can launch. The Reachy backend calls `launch` from a platform wallet
///         so creators need no wallet; it passes the creator's address when they connected one.
contract GameTokenFactory {
    /// @notice 1e8 wei (0.0000000001 MON) per whole token at launch.
    uint256 public constant BASE_PRICE = 1e8;
    /// @notice +1 wei per whole token sold. Selling the full 1B supply raises ~0.6 MON (testnet-friendly):
    ///         1e9 * 1e8 + 1 * 1e9^2 / 2 = 0.1 MON + 0.5 MON.
    uint256 public constant SLOPE = 1;

    PrizePool public immutable prizePool;
    address[] public tokens;
    mapping(address => bool) public isGameToken;

    event GameLaunched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string imageURI,
        string configURI,
        uint256 gameId
    );

    constructor() {
        prizePool = new PrizePool(address(this));
    }

    /// @param creator Receives the 1% creator fee. Pass address(0) to use msg.sender.
    function launch(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata configURI,
        address creator
    ) external returns (address token) {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "bad name");
        require(bytes(symbol).length >= 3 && bytes(symbol).length <= 6, "bad symbol");
        if (creator == address(0)) creator = msg.sender;

        uint256 gameId = tokens.length;
        token = address(
            new GameToken(name, symbol, imageURI, configURI, creator, gameId, BASE_PRICE, SLOPE, address(prizePool))
        );
        tokens.push(token);
        isGameToken[token] = true;

        emit GameLaunched(token, creator, name, symbol, imageURI, configURI, gameId);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Paginated list, newest last. Use with tokenCount() for feeds.
    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 len = tokens.length;
        if (offset >= len) return new address[](0);
        uint256 end = offset + limit > len ? len : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = tokens[i];
        }
    }
}
