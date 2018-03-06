pragma solidity ^0.4.18;

contract ProcessRunner {
  function performStateTransition(bytes32 machineId, bytes32 processId, bytes32 toState) returns (bool);
}
