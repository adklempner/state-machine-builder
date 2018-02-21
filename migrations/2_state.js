var State = artifacts.require("./State.sol");
var StateMachineBuilder = artifacts.require("./StateMachineBuilder.sol");

module.exports = function(deployer) {
  deployer.deploy(State);
  deployer.link(State, StateMachineBuilder);
  deployer.deploy(StateMachineBuilder);
};
