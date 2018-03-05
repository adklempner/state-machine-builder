# state-machine-builder
An on-chain, permission-based state machine builder.

This is a VERY EXPERIMENTAL project and comes with absolutely no security guarantees. Do NOT use this codebase in production.

## Getting Started

Requires [npm](https://www.npmjs.com/get-npm) and [Truffle](http://truffleframework.com)

```bash
git clone https://github.com/adklempner/state-machine-builder.git
cd state-machine-builder
npm install
truffle compile
truffle test
```

## State Library

### State.Machine

The core data structure of the `State` library is the `Machine` struct, which stores a graph representation of the state machine and the state of every running process.

```solidity
struct Machine {
  mapping(bytes32 => mapping(bytes32 => bytes32)) transitionGraph;
  mapping(bytes32 => bytes32) processes;
}
```

### Transition Graph

The `transitionGraph` mapping defines a labeled, [directed graph](https://en.wikipedia.org/wiki/Directed_graph) where each node refers to a state and each label refers to a transition.

```solidity
        nodeA              nodeB      label
mapping(bytes32 => mapping(bytes32 => bytes32)) transitionGraph;
```

Here's how the graph below would be stored in the `transitionGraph` mapping (assume strings are converted to bytes32)
![pvqnb](https://user-images.githubusercontent.com/22138672/36600118-49a511a6-1866-11e8-87cb-159affab91be.png)
```solidity
transitionGraph["a"]["b"] = "1"
transitionGraph["b"]["c"] = "2"
transitionGraph["c"]["d"] = "3"
transitionGraph["d"]["a"] = "4"
transitionGraph["a"]["c"] = "5"
transitionGraph["c"]["a"] = "6"
```

The graph is defined by calling `addTransition` and `removeTransition`.

```solidity
State.Machine machine;
machine.addTransition("a", "b", "1");
machine.addTransition("b", "c", "2");
...
machine.addTransition("c", "a", "6");
```

### Processes

The `processes` mapping tracks the state of each process run on the machine. Every process starts at `0`, which represents the initial state of the machine.


```solidity
       ProcessID   ProcessState
mapping(bytes32 => bytes32) processes;
```

For the machine above, since there is no transition defined from state `0` to another state, a process can't be started. After adding a transition from the inital state:

```solidity
machine.addTransition("0", "a", "0");
```
a user can then start a new process by calling `performTransition`
```solidity
machine.performTransition("process1", "a")
```
The call above changes the state of the process with ID `"process1"` from `0` to `"a"`

## StateMachineBuilder Contract

`StateMachineBuilder` is an example of how the `State` library can be implemented.

### Permissions

`StateMachineBuilder` uses OpenZeppelin's [`Role Based Access Control`](https://github.com/OpenZeppelin/zeppelin-solidity/blob/75439c1dd3cf89e616c1a4fb62201fa78300d83d/contracts/ownership/rbac/RBAC.sol) contract for managing permissions. The deployer of `StateMachineBuilder` is assigned the role of administrator. Only administrators can assign and remove roles from addresses by calling the `adminAddRole` and `adminRemoveRole` functions.


### Building a State Machine

Each `State.Machine` in a `StateMachineBuilder` is stored in `mapping(bytes32 => State.Machine) stateMachines`

Only administrators can build out the transition graph for each `State.Machine` by calling `addStateTransition` and `removeStateTransition`. Here's how to define the same machine as above, assigning it the id `"exampleMachine"`

```solidity
StateMachineBuilder builder;
builder.addStateTransition("exampleMachine", "a", "b", "1");
builder.addStateTransition("exampleMachine", "b", "c", "2");
...
builder.addStateTransition("exampleMachine", "c", "a", "6");
builder.addStateTransition("exampleMachine", "0", "a", "0");
```

### Labels

`StateMachineBuilder` gives state transitions meaning by defining labels.

```solidity
struct Transition {
   string authorizedRole;
   bool networked;
}

mapping(bytes32 => Transition) labels;
```

By calling `addLabel`, the administrator can define which role is authorized to perform a transition with that label.

```solidity
builder.addLabel("0", "BasicUser", false);
```

After assigning that role to an address

```solidity
builder.adminAddRole(0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE, "BasicUser");
```

that address can perform any transition with label `0` (on ANY of the machines) by calling `performStateTransition`

```solidity
builder.performStateTransition("exampleMachine", "newProcess", "a");
```

### Networked State Transitions

Since users are authenticated using Ethereum addresses, one `StateMachineBuilder` can be authorized to perform state transitions on another `StateMachineBuilder`.


An admin of our original `builder` gives the `otherBuilder` the role of `AuthorizedBuilder`

```solidity
StateMachineBuilder otherBuilder;
builder.adminAddRole(otherBuilder, "AuthorizedBuilder");
```

they then create a new label that requires the caller to have the `AuthorizedBuilder` role, and adds a new transition with that label

```solidity
builder.addLabel("InboundNetworkedTransition", "AuthorizedBuilder", false);
builder.addStateTransition("exampleMachine", 0, "initiatedByOtherBuilder", "InboundNetworkedTransition");
```

The admin of the `otherBuilder` creates a label where the `networked` flag is set to true, and creates a new transition with that label

```solidity
otherBuilder.addLabel("OutboundNetworkedTransition", "admin", true);
otherBuilder.addStateTransition("otherExampleMachine", 0, "MadeOutboundTransition", "OutboundNetworkedTransition");
```

Setting the `networked` flag to true means that the transition cannot be performed by calling `performStateTransition`. Instead, we use `performNetworkedStateTransition`.

`performNetworkStateTransition` takes additional parameters for building a `performStateTransition` call to another `StateMachineBuilder`. If the call fails, any state changes are reverted.

In this example, `otherBuilder` is authorized to change the state of any process in `builder` from `0` to `"initiatedByOtherBuilder"`

```solidity
otherBuilder.performNetworkedStateTransition("otherExampleMachine", "processOutbound", "MadeOutboundTransition", "exampleMachine", "processInbound", "initiatedByOtherBuilder", builder);
```

If the call is successfull, the following happens in one transaction:
 * in `otherBuilder`: the state of the process with ID `processOutbound` in the machine with ID `otherExampleMachine` transitions from `0` to `MadeOutboundTransition`
 * in `builder`: the state of the process with ID `processInbound` in the machine with ID `exampleMachine` transitions from `0` to `initiatedByOtherBuilder`
 
 #### Notes on networked transitions
 
`StateMachineBuilder` implements the interface `ProcessRunner`, and uses it to call other machines.
```solidity
interface ProcessRunner {
  function performStateTransition(bytes32 machineId, bytes32 processId, bytes32 toState) returns (bool);
}
```
Technically, any contract that implements that interface can be called via `performNetworkedStateTransition`, and there is currently no on-chain check that verifies anything happenned other than the call returning `true`.

Additionally, flagging a transition as `networked` does not specify the details of the transition (which builder, machine, process, and state), it only requires that the transition is successfully performed. This functionality will be added.
