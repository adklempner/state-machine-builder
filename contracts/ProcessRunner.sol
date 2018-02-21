pragma solidity ^0.4.18;

interface ProcessRunner {
  function performStateTransition(bytes32 machineId, bytes32 processId, bytes32 toState) returns (bool);
}
