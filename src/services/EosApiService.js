import { Api, JsonRpc, RpcError } from 'eosjs'
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig'
import testAccounts from '../config/testaccounts.js'
import axios from 'axios'
import BigNumber from 'bignumber.js/bignumber'
import { encodeName, decodeName } from '../lib/format.js'


const HTTPENDPOINT = 'http://localhost:8888'
const CODE = 'eoscommonsio' // contract who owns the table, to keep table names unqique amongst different contracts. We all use the same table space.
const SCOPE = 'eoscommonsio' // scope of the table. Can be used to give each participating acount its own table. Usually the same as code
const TABLE = 'commons' // name of the table as specified by the contract abi

// Main action call to blockchain
async function takeAction(action, dataValue) {
  const ACCOUNT = 'eoscommonsio'
  const ACTOR = 'eoscommonsio'

  const privateKey = testAccounts.testAccounts.eoscommonsio.privateKey
  const rpc = new JsonRpc(HTTPENDPOINT)
  const signatureProvider = new JsSignatureProvider([privateKey])
  const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() })

  // Main call to blockchain after setting action, account_name and data
  try {
    const resultWithConfig = await api.transact({
      actions: [{
        account: ACCOUNT,
        name: action,
        authorization: [{
          actor: ACTOR,
          permission: 'active'
        }],
        data: dataValue
      }]
    }, {
        blocksBehind: 3,
        expireSeconds: 30
      })
    return resultWithConfig
  } catch (err) {
    console.error('\nCaught exception: ' + err)
    if (err instanceof RpcError) { console.log(JSON.stringify(err.json, null, 2)) }
  }
}

class EosApiService {
  static upsertCommon(common) {
    const getRandomKey = () => {
      // base32 encoded 64-bit integers. This means they are limited to the characters a-z, 1-5, and '.' for the first 12 characters. 
      // If there is a 13th character then it is restricted to the first 16 characters ('.' and a-p).
      var characters = 'abcdefghijklmnopqrstuvwxyz12345'
      var randomKey = ''
      for (var i = 0; i < 12; i++) {
        randomKey += characters.charAt(Math.floor(Math.random() * characters.length))
      }
      return randomKey
    }
    // if (!key) key = getRandomKey()

    const key = common.key
    const parentId = common.parentId ? common.parentId : 'aaaaaaaaaaaaa'
    const classId = common.classId ? common.classId : 'aaaaaaaaaaaaa'

    return new Promise((resolve, reject) => {
      takeAction('upsert', { username: 'eoscommonsio', key: key, parentid: parentId, classid: classId, common: JSON.stringify(common) })
        .then(() => {
          resolve(key)
        })
        .catch(err => {
          reject(err)
        })
    })
  }

  static eraseCommon(key) {
    return new Promise((resolve, reject) => {
      takeAction('erase', { username: 'eoscommonsio', key: key })
        .then(() => {
          resolve()
        })
        .catch(err => {
          reject(err)
        })
    })
  }

  static async getCommonByKey(keyValue) {
    return this.queryByIndex('key', keyValue).then(result => {
      if (result.length == 0) throw 'Key Not found: ' + keyValue
      return result[0]
    })
  }

  static async queryByIndex(indexName, keyValue) {
    try {
      // See https://github.com/EOSIO/eosjs/issues/154
      const lowerBoundBigNumber = new BigNumber(encodeName(keyValue, false))
      const upperBound = decodeName(lowerBoundBigNumber.plus(1).toString(), false)
      // console.log('indexName: ', indexName, 'key: ', key, lowerBoundBigNumber.toString(), lowerBoundBigNumber.plus(1).toString())

      let index = 0
      if (indexName === 'key') index = 'first'
      else if (indexName === 'parentId') index = 'second'
      else if (indexName === 'classId') index = 'third'
      else throw 'Add index: ', indexName

      const rpc = new JsonRpc(HTTPENDPOINT)
      const result = await rpc.get_table_rows({
        'json': true,
        'code': CODE, // contract who owns the table
        'scope': SCOPE, // scope of the table
        'table': TABLE, // name of the table as specified by the contract abi
        'limit': 500,
        'key_type': 'name', // account name type
        "index_position": index,
        'lower_bound': keyValue,
        'upper_bound': upperBound // must be numericlly equal to key plus one
      })
      return result.rows.map(row => {
        return JSON.parse(row.common)
      })
    } catch (err) {
      console.error(err)
    }
  }

  static async loadEos() {
    const doAllSequentually = async (fnPromiseArr) => {
      for (let i = 0; i < fnPromiseArr.length; i++) {
        await fnPromiseArr[i]()
      }
    }

    const createFnPromise = (common) => {
      return () => this.upsertCommon(common)
    }

    return axios('commons.json', { headers: { 'Content-Type': 'application/json; charset=UTF-8' }, data: {} }).then(response => {
      let loadEOSPromissesArr = []
      response.data.forEach(common => {
        // console.log(common)
        loadEOSPromissesArr.push(createFnPromise(common))
      })
      doAllSequentually(loadEOSPromissesArr).then(() => {
        console.log('finished upsert')
        return true
      })
    })
  }

  static eraseallCommon() {
    const doAllSequentually = async (fnPromiseArr) => {
      for (let i = 0; i < fnPromiseArr.length; i++) {
        await fnPromiseArr[i]()
      }
    }

    const createFnPromise = (key) => {
      return () => this.eraseCommon(key)
    }

    return axios('commons.json', { headers: { 'Content-Type': 'application/json; charset=UTF-8' }, data: {} }).then(response => {
      let loadEOSPromissesArr = []
      response.data.forEach(common => {
        // console.log(common)
        loadEOSPromissesArr.push(createFnPromise(common.key))
      })
      doAllSequentually(loadEOSPromissesArr).then(() => {
        console.log('finished eraseall')
        return true
      })
    })
    /* return new Promise((resolve, reject) => {
      takeAction('eraseall', { username: 'eoscommonsio' })
        .then(() => {
          resolve()
        })
        .catch(err => {
          reject(err)
        })
    }) */
  }
}

export default EosApiService