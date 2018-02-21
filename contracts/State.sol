pragma solidity ^0.4.18;

library State {

  struct Transition {
    bool enabled;
  	string authorizedRole;
    bool networked;
  }

  struct Machine {
    mapping(bytes32 => mapping(bytes32 => Transition)) transitionGraph;
    mapping(bytes32 => bytes32) processes;
  }

  function addTransition(Machine storage machine, bytes32 fromState, bytes32 toState, string _role, bool _networked) {
    machine.transitionGraph[fromState][toState].enabled = true;
    machine.transitionGraph[fromState][toState].authorizedRole = _role;
    machine.transitionGraph[fromState][toState].networked = _networked;
  }

  function removeTransition(Machine storage machine, bytes32 fromState, bytes32 toState) {
    delete machine.transitionGraph[fromState][toState];
  }

  function performTransition(Machine storage machine, bytes32 processId, bytes32 toState) returns (bool) {
    require(isValidTransition(machine, machine.processes[processId], toState));
    machine.processes[processId] = toState;
    return true;
  }

  function isValidTransition(Machine storage machine, bytes32 fromState, bytes32 toState) public view returns(bool) {
    return machine.transitionGraph[fromState][toState].enabled;
  }

}
