const assert = require('chai').assert
const abiDecoder = require('abi-decoder')
const utf8 = require('utf8')

const State = artifacts.require('State.sol')
const StateMachineBuilder = artifacts.require('StateMachineBuilder.sol')

abiDecoder.addABI(State._json.abi)
abiDecoder.addABI(StateMachineBuilder._json.abi)

const isInvalidOpcodeEx = function(e) {
    return e.message.search('invalid opcode') >= 0
}

const bytes32ToString = function(hex){
    var str = ""
    var i = 0, l = hex.length
    if (hex.substring(0, 2) === '0x') {
        i = 2
    }
    for (; i < l; i+=2) {
        var code = parseInt(hex.substr(i, 2), 16)
        if (code === 0)
            break
        str += String.fromCharCode(code)
    }

    return utf8.decode(str)
}

contract('StateMachineBuilder', (accounts) => {

  let stateMachineBuilders = []
  const stateMachineNames = ['Machine1' , 'Machine2']
  const INIT_STATE = 0
  const stateNames = ['State1-1', 'State1-2', 'State1-3', 'State3-2', 'State4']
  const ADMIN_ROLE = 'admin'
  const roleNames = ['superuser', 'user', 'trustedMachine']
  const labels = ['Label0','Label1','Label2','Label3', 'Label4']

  before(async () => {
    stateMachineBuilders[0] = await StateMachineBuilder.new()
    stateMachineBuilders[1] = await StateMachineBuilder.new()
  })

  describe('Constructor', async() => {

    it('deploys contract successfully', async() => {
      for(let smb of stateMachineBuilders) {
        assert(smb.address.toString())
      }
    })
  })

  describe('Creating and performing state changes', async () => {
    let admin = accounts[0]
    let superuser = accounts[1]
    let handler = accounts[2]
    let shipperAdmin = accounts[3]

    let processId = 0

    it('can add new labels', async() => {
      await stateMachineBuilders[0].addLabel(labels[0], ADMIN_ROLE, false);
    })

    it('can add a new state change', async () => {
      let enabled = await stateMachineBuilders[0].isValidStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0])
      assert(!enabled)
      await stateMachineBuilders[0].addStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0], labels[0], {from: admin})
      enabled = await stateMachineBuilders[0].isValidStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0])
      assert(enabled)
    })

    it('can remove a state change', async() => {
      let enabled = await stateMachineBuilders[0].isValidStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0])
      assert(enabled)
      await stateMachineBuilders[0].removeStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0], {from: admin})
      enabled = await stateMachineBuilders[0].isValidStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0])
      assert(!enabled)
    })

    it('can add an initial state and start a new cycle', async() => {
      await stateMachineBuilders[0].addStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0], labels[0], {from: admin})
      let processState = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      assert.equal(bytes32ToString(processState), INIT_STATE)
      let tx = await stateMachineBuilders[0].performStateTransition(stateMachineNames[0], processId, stateNames[0], {from: admin})
      processState = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      assert.equal(bytes32ToString(processState), stateNames[0])
    })

    it('cannot perform an invalid state change', async() => {
      let processState = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      let enabled = await stateMachineBuilders[0].isValidStateTransition(stateMachineNames[0], processState, INIT_STATE)
      assert(!enabled)
      try {
        await stateMachineBuilders[0].performStateTransition(stateMachineNames[0], processId, INIT_STATE, {from: admin})
      } catch(e) {
        isInvalidOpcodeEx(e)
      }
    })

    it('address without correct role cannot perform state change', async() => {
      await stateMachineBuilders[0].adminAddRole(superuser, roleNames[0], {from: admin})
      processId++
      let processState = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      let enabled = await stateMachineBuilders[0].isValidStateTransition(stateMachineNames[0], processState, stateNames[0])
      assert(enabled)
      try {
        await stateMachineBuilders[0].performStateTransition(stateMachineNames[0], processId, stateNames[0], {from: superuser})
      } catch(e) {
        isInvalidOpcodeEx(e)
      }

      await stateMachineBuilders[0].addLabel(labels[1], roleNames[0], false)
      await stateMachineBuilders[0].addStateTransition(stateMachineNames[0], INIT_STATE, stateNames[1], labels[1], {from: admin})

      try {
        await stateMachineBuilders[0].performStateTransition(stateMachineNames[0], processId, stateNames[1], {from: admin})
      } catch(e) {
        isInvalidOpcodeEx(e)
      }

      await stateMachineBuilders[0].performStateTransition(stateMachineNames[0], processId, stateNames[1], {from: superuser})
      processState = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      assert.equal(bytes32ToString(processState), stateNames[1])
    })

    it('can perform a networked state transition', async() => {
      processId++

      let processStateHomeMachine = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      let processStateTargetMachine = await stateMachineBuilders[1].getProcessState(stateMachineNames[0], processId)
      assert.equal(bytes32ToString(processStateHomeMachine), INIT_STATE)
      assert.equal(bytes32ToString(processStateTargetMachine), INIT_STATE)

      await stateMachineBuilders[0].adminAddRole(stateMachineBuilders[1].address, roleNames[2])

      await stateMachineBuilders[0].addLabel(labels[2], roleNames[2], false)
      await stateMachineBuilders[0].addStateTransition(stateMachineNames[0], INIT_STATE, stateNames[2], labels[2], {from: admin})

      await stateMachineBuilders[1].addLabel(labels[3], ADMIN_ROLE, true)
      await stateMachineBuilders[1].addStateTransition(stateMachineNames[0], INIT_STATE, stateNames[0], labels[3], {from: admin})

      await stateMachineBuilders[1].performNetworkedStateTransition(stateMachineNames[0], processId, stateNames[0], stateMachineNames[0], processId, stateNames[2], stateMachineBuilders[0].address, {from: admin})

      processStateHomeMachine = await stateMachineBuilders[0].getProcessState(stateMachineNames[0], processId)
      processStateTargetMachine = await stateMachineBuilders[1].getProcessState(stateMachineNames[0], processId)
      assert.equal(bytes32ToString(processStateHomeMachine), stateNames[2])
      assert.equal(bytes32ToString(processStateTargetMachine), stateNames[0])
    })

  })


})
