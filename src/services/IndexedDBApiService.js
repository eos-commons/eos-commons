import axios from 'axios'
import Vue from 'vue'
const eosjs = require('eosjs');
//import BigNumber from 'bignumber.js/bignumber'



class IndexedDBApiService {


    static async addTransactionAndUpsetAgreement(store, actionObj) {
        const date = new Date();

        // Add history record (get transaction from eos)
        // TODO find a way to query trransactions from eos, tehn remove agreementHistoryId
        const transactionObj = {
            docType: 'object',
            classId: 're1ihrfyl3zf', // Transaction
            processId: actionObj.agreementObj.processStack[0].processId, // Service Request Process
            stateId: actionObj.agreementObj.processStack[0].stateId,
            action: actionObj.action,
            stateDate: date.toISOString(),
            updaterId: store.state.currentUserId,
            description: actionObj.description
        }
        const key = await this.upsertCommon(store, transactionObj)

        // Add transaction to agreementHistoryIds
        actionObj.agreementObj.agreementHistoryIds.unshift(key)

        // Update agreementObj with new state
        const agreementObjKey = await this.upsertCommon(store, actionObj.agreementObj)
        actionObj.agreementObj.key = agreementObjKey
    }


    static upsertCommon(store, common) {
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
        if (!common.key) common.key = getRandomKey()
        common.isDirty = true

        return new Promise((resolve, reject) => {
            const commonsStore = this.db.transaction('commons', 'readwrite').objectStore('commons')
            commonsStore.put(common)

            store.commit('SET_SNACKBAR', {
                snackbar: true,
                text: 'Update Succeded',
                color: 'green'
            })
            resolve(common.key)
        })
    }

    static eraseCommon(key) {
        return new Promise((resolve, reject) => {
            const commonsStore = this.db.transaction('commons', 'readwrite').objectStore('commons')
            let objectStoreRequest = commonsStore.delete(key)
            resolve(key)
        })
    }

    static async getCommonByKey(store, key) {
        return new Promise((resolve, reject) => {
            const commonsStore = this.db.transaction('commons', 'readwrite').objectStore('commons')

            commonsStore.get(key).onsuccess = event => {
                let result = event.target.result
                if (result) {
                    resolve(result)
                } else {
                    store.commit('SET_SNACKBAR', {
                        snackbar: true,
                        text: 'getCommonByKey failed: ' + key,
                        color: 'error'
                    })
                    reject('Cant find: ' + key)
                }
            }
        })
    }

    static async queryByIndex(store, indexName, key) {
        // Wrap indexedDB transaction in a promise
        return new Promise((resolve, reject) => {
            const commonsStore = this.db.transaction('commons', 'readwrite').objectStore('commons')
            if (!commonsStore.indexNames.contains(indexName)) {
                console.error('Add index: ', indexName)
                store.commit('SET_SNACKBAR', {
                    snackbar: true,
                    text: 'Add index: ' + indexName,
                    color: 'error'
                })
                resolve([])
                return
            }
            let index = commonsStore.index(indexName)
            let getAllRequest = index.getAll(key)

            getAllRequest.onsuccess = function () {
                resolve(getAllRequest.result)
            }
            getAllRequest.onerror = event => {
                store.commit('SET_SNACKBAR', {
                    snackbar: true,
                    text: 'queryByIndex failed',
                    color: 'error'
                })
                reject(event)
            }
        })
    }

    static async getControlledAccounts(store, actor, saughtPermission) {

        // Recursivly get an array of subclasses
        const getSubclasses = async (classKey) => {
            const subclasses = async (parentClassKey) => {
                let classArr = await this.queryByIndex(store, 'parentId', parentClassKey)
                let promisses = classArr.map(classObj => {
                    return subclasses(classObj.key)
                })
                let subClassesArrArr = await Promise.all(promisses)
                // Flatten array of arrays.
                let subClassesArr = _.flatten(subClassesArrArr)
                classArr = classArr.concat(subClassesArr)
                // console.log('classArr', parentClassKey, classArr)
                return classArr
            }
            let subClassesArr = await subclasses(classKey)
            let classObj = await this.getCommonByKey(store, classKey)
            subClassesArr.push(classObj)
            // console.log('subClassesArr', subClassesArr)
            return subClassesArr // include the class we started out with
        }

        // We need to get objects from classId class, and all of its subclasses
        // First, get an array of all subclasses
        let subClassArr = await getSubclasses('ikjyhlqewxs3') //  EOS Accounts

        // Collect all of the objects for these subclasses
        let promisses = subClassArr.map(classObj => {
            return this.queryByIndex(store, 'classId', classObj.key)
        })
        let subClassObjectsArr = await Promise.all(promisses)
        // Flatten array of arrays.
        const accountsArr = _.flatten(subClassObjectsArr)
        let resultsArr = []

        accountsArr.forEach(accountObj => {
            if (accountObj.permissions) {
                accountObj.permissions.forEach(permission => {
                    if (permission.required_auth.accounts) {
                        permission.required_auth.accounts.forEach(account => {
                            if (account.permission.actor === actor && account.permission.permission === saughtPermission) resultsArr.push(accountObj)
                        })
                    }
                })
            }
            return false
        })
        return resultsArr
    }

    static async getAuthorizedAccounts(store, agreementId) {
        // Get accounts that are authorized for the current state of an agreement

        const agreementObj = await this.getCommonByKey(store, agreementId)
        // Get the last process stack object
        let processStackObj = agreementObj.processStack[0]

        // get all org unit accounts for seller account
        const sellerOrgunitAccounts = await this.getControlledAccounts(store, agreementObj.sellerId, 'owner')

        let orgsAuthorizedForStateArr = sellerOrgunitAccounts.filter(sellerOrgunitAccount => {
            return sellerOrgunitAccount.authorizedForStateIds.includes(processStackObj.stateId)
        })

        let accountIdsArr = []
        orgsAuthorizedForStateArr.forEach(accountObj => {
            accountObj.permissions.forEach(permissionObj => {
                permissionObj.required_auth.accounts.forEach(account => {
                    if (account.permission.permission === 'active') accountIdsArr.push(account.permission.actor)
                })
            })
        })

        /// console.log('accountIdsArr', accountIdsArr)
        return accountIdsArr
    }

    static async addAgreement(store, agreementObj) {

        agreementObj.docType = "object";

        // The process is mapped to an agreement type
        let processObj = await this.getCommonByKey(store, agreementObj.processId);
        agreementObj.classId = processObj.agreementClassId; // Service Request Arreement class

        // Get the asset, use its owner as sellerId
        let assetObj = await this.getCommonByKey(store, agreementObj.assetId);
        agreementObj.sellerId = assetObj.ownerId; // Service Request Arreement class

        // create the process stack
        agreementObj.processStack = [{
            processId: agreementObj.processId,
            stateId: 'gczvalloctae' // The Initialize state
        }]

        agreementObj.startDate = new Date().toISOString();
        agreementObj.agreementHistoryIds = [];
        agreementObj.buyerId = store.state.currentUserId;

        console.log("addAgreement", agreementObj);

        const actioObj = {
            agreementObj: agreementObj
        }

        // upsert the agreement (and add tracnsaction history, to be removed) 
        await this.addTransactionAndUpsetAgreement(store, actioObj)

        // take action based on iniial state
        return this.takeAction(store, actioObj)

    }
    static async takeAction(store, actionObj) {

        // Recursivly findout if obj is a classId
        const isA = async (objId, classId) => {
            const testSuperClass = async superclassId => {
                const superclass = await this.getCommonByKey(store, superclassId)
                if (!superclass.parentId) return false // we are at the root
                if (superclass.parentId === classId) return true
                return testSuperClass(superclass.parentId)
            }

            const obj = await this.getCommonByKey(store, objId)
            if (obj.classId === classId) return true
            return testSuperClass(obj.classId)
        }

        // Determine next state
        const bumpState = async (actionObj) => {

            const date = new Date();
            actionObj.agreementObj.stateDate = date.toISOString()

            // Get the current process stack object
            let processStackObj = actionObj.agreementObj.processStack[0]

            // If we are initializing, set the state to the process substateId
            if (processStackObj.stateId === 'gczvalloctae') { // Initialize state
                // WRONG which processId in the case of sub process?
                let processObj = await this.getCommonByKey(store, processStackObj.processId);
                // Set the state to the process subState
                processStackObj.stateId = processObj.substateId
                //actionObj.action = 'happy'
                return
            }

            // Get currentStateObj from processStackObj stateId
            const currentStateObj = await this.getCommonByKey(store, processStackObj.stateId);

            const executeType = await isA(processStackObj.stateId, 'dqja423wlzrb') //Execute class
            // Validate, skip for now
            if (executeType) {
                // For now, just skip
                actionObj.action = 'happy'
                const nextStateObj = currentStateObj.nextStateIds.find(obj => {
                    return obj.action === actionObj.action
                })
                if(nextStateObj && nextStateObj.stateId) {
                    processStackObj.stateId = nextStateObj.stateId
                    return
                }
            }

            const delegateType = await isA(processStackObj.stateId, 'jotxozcetpx2') //Delegate class
            // Perform, add sellerProcess to process stack with initialize state
            if (delegateType && !actionObj.returning) {
                // Add the sub process to the call stack
                actionObj.agreementObj.processStack.unshift({
                    processId: actionObj.agreementObj.sellerProcessId, // TODO known sub poricess??
                    stateId: 'gczvalloctae' // The Initialize state
                })
                delete actionObj.action
                return
            }

            delete actionObj.returning

            // Find the next state that corresponds with the action
            const nextStateObj = currentStateObj.nextStateIds.find(obj => {
                return obj.action === actionObj.action
            })

            // If the nextStateObj has a stateId, use it
            if (nextStateObj && nextStateObj.stateId) {
                processStackObj.stateId = nextStateObj.stateId // Set agreement state to it
                return
            }
            // We couldn't find a nextStateId, so we return
            // Are we in a sub process? If so, send action to super process
            if (actionObj.agreementObj.processStack.length > 1) {
                // Remove the top processStackObj
                actionObj.agreementObj.processStack.shift()
                actionObj.returning = true
                return
            }

            // Otherwize we are at the end
            if (actionObj.action === 'happy') processStackObj.stateId = '3hxkire2nn4v' // Sucess
            else processStackObj.stateId = 'zdwdoqpxks2s' // Failed
        }


        // Get the agreement
        if (!actionObj.agreementObj) actionObj.agreementObj = await this.getCommonByKey(store, actionObj.agreementId);

        // Keep bumping the state until we are at a user input state, or at the end
        let stateId = actionObj.agreementObj.processStack[0].stateId
        let executeType = await isA(stateId, 'dqja423wlzrb') // Execute State
        let delegateType = await isA(stateId, 'jotxozcetpx2') // delegate Type
        do {
            await bumpState(actionObj);
            await this.addTransactionAndUpsetAgreement(store, actionObj)

            stateId = actionObj.agreementObj.processStack[0].stateId
            executeType = await isA(stateId, 'dqja423wlzrb') // Execute State
            delegateType = await isA(stateId, 'jotxozcetpx2') // delegate Type
            
        } while (executeType || delegateType || stateId === 'gczvalloctae'); // Initialize
    }




    static async ImportFromStatic(store) {

        return new Promise((resolve, reject) => {
            const openRequest = indexedDB.open('commonsDB', 1)

            openRequest.onupgradeneeded = e => {
                let db = e.target.result
                const store = db.createObjectStore('commons', {
                    keyPath: 'key'
                })
                store.createIndex('parentId', 'parentId')
                store.createIndex('classId', 'classId')
                store.createIndex('ownerId', 'ownerId')
                store.createIndex('isDirty', 'isDirty')
            }

            openRequest.onsuccess = e => {
                this.db = e.target.result

                return axios('commons.json', {
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8'
                    },
                    data: {}
                }).then(response => {
                    const transaction = this.db.transaction('commons', 'readwrite')
                    const commonsStore = transaction.objectStore('commons')
                    // console.log(response.data)

                    response.data.forEach(obj => {
                        commonsStore.put(obj)
                    })
                    store.commit('SET_SNACKBAR', {
                        snackbar: true,
                        text: 'Import from static succes',
                        color: 'green'
                    })
                    resolve(true)
                })
            }

            openRequest.onerror = e => {
                store.commit('SET_SNACKBAR', {
                    snackbar: true,
                    text: 'Import from static file failed',
                    color: 'error'
                })
                console.error(e.error)
                reject(e.error)
            }
        })
    }

    static async XGetAll(store) {
        return new Promise((resolve, reject) => {
            const commonsStore = this.db.transaction('commons', 'readwrite').objectStore('commons')

            commonsStore.getAll().onsuccess = event => {
                let result = event.target.result
                if (result) {
                    resolve(result)
                } else {
                    store.commit('SET_SNACKBAR', {
                        snackbar: true,
                        text: 'getAll failed',
                        color: 'error'
                    })
                    reject('cant get all')
                }
            }
        })
    }

    static async GetAll(store) {
        let results = []

        // Recusivly nagigate class model
        const addSubclasses = async (classId) => {

            // Get the subclasses for this class
            let classesQueryObj = {
                query: {
                    where: [{
                        docProp: 'parentId',
                        operator: 'eq',
                        value: classId
                    }]
                }
            }
            const classesArr = await store.dispatch('query', classesQueryObj)
            if(classesArr.length) {
                results = results.concat(classesArr)
                let promises = []
                classesArr.forEach(async subClassObj => {
                    promises.push(addSubclasses(subClassObj.key))
                })
                await Promise.all(promises)
            }

            // Get the objects for this class
            let objectsQueryObj = {
                query: {
                    where: [{
                        docProp: 'classId',
                        operator: 'eq',
                        value: classId
                    }]
                }
            }
            const objectsArr = await store.dispatch('query', objectsQueryObj)
            if(objectsArr.length) {
                results = results.concat(objectsArr)

            }
        }



        results.push(await store.dispatch( 'getCommonByKey', 'gzthjuyjca4s' )); // get the root
        await addSubclasses('gzthjuyjca4s')
        return results
    }

}

export default IndexedDBApiService