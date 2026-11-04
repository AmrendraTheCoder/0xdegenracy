// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GameTokenFactory} from "../src/GameTokenFactory.sol";

/// forge script script/Deploy.s.sol --rpc-url monad_testnet --account reachy-deployer --broadcast
contract Deploy is Script {
    function run() external returns (GameTokenFactory factory) {
        vm.startBroadcast();
        factory = new GameTokenFactory();
        vm.stopBroadcast();
        console.log("GameTokenFactory:", address(factory));
    }
}
