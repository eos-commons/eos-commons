import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'
import createPersistedState from 'vuex-persistedstate'

Vue.use(Vuex)
const IPFS = require('ipfs-api')
const ipfs = new IPFS({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' })

const updateRoute = (state) => {
  let newHash = ''
  for (let level = 0; level < state.levelIdsArr.length; level++) {
    let levelId = state.levelIdsArr[level]
    let levelArr = []
    levelArr.push(levelId.selectedObjId)
    levelArr.push(levelId.pageId)
    let selectedTab = Vue._.get(state, 'pageStates.' + levelId.pageId + '.selectedTab', 0)
    // if (state.pageStates[levelId.pageId].selectedTab) selectedTab = state.pageStates[levelId.pageId].selectedTab
    if (selectedTab) levelArr.push(selectedTab)
    else levelArr.push('')
    newHash = newHash + '/' + levelArr.join('.')
  }
  window.location.hash = newHash
}
const store = new Vuex.Store({
  strict: process.env.NODE_ENV !== 'production',
  plugins: [createPersistedState()],

  state: {
    commons: {}, // REMOVE
    classes: {}, // REMOVE
    loading: false,
    statusCode: null,
    message: '',
    levelIdsArr: [],
    pageStates: {},
    isOpened: {}
  },
  getters: {
    getMessage: (state) => {
      return state.statusCode + ' ' + state.message
    }
  },
  mutations: {
    SET_CLASSES_LOADING (state) {
      state.loading = true
      state.message = 'loading...'
    },
    SET_CLASSES_SUCCESS (state, payload) {
      state.statusCode = payload.statusCode
      state.message = payload.message
      state.classes = payload.data
      state.loading = false
    },
    SET_CLASSES_FAILURE (state, payload) {
      state.statusCode = payload.statusCode
      state.message = payload.message
    },

    SET_PAGE_STATE2 (state, payload) {
      /* let example = {
        level: 0,
        pageId: '',
        paneWidth: 400,
        selectedTab: 0,
        selectedObjId: '',
        nextLevel: {}
      } */
      if (payload.pageId) {
        let newPageState = { paneWidth: '400px', selectedTab: 0 }
        let pageState = {}
        if (payload.paneWidth) pageState.paneWidth = payload.paneWidth
        if (payload.selectedTab !== undefined) pageState.selectedTab = payload.selectedTab
        Vue._.merge(newPageState, state.pageStates[payload.pageId], pageState)
        Vue.set(state.pageStates, payload.pageId, newPageState)
      }

      if (payload.selectedTab) {
        const newLevelIdsArr = state.levelIdsArr.slice(0, payload.level + 1)
        Vue.set(state, 'levelIdsArr', newLevelIdsArr)
      }

      if (payload.level !== undefined) {
        let newIds = {}
        let ids = {}
        if (payload.pageId) ids.pageId = payload.pageId
        if (payload.selectedObjId) ids.selectedObjId = payload.selectedObjId
        Vue._.merge(newIds, state.levelIdsArr[payload.level], ids)
        Vue.set(state.levelIdsArr, payload.level, newIds)
      }

      if (payload.nextLevel) {
        payload.nextLevel.level = payload.level + 1
        store.commit('SET_PAGE_STATE2', payload.nextLevel)
      } else updateRoute(state)
    },

    SET_PAGE_STATE_FROM_ROUTE (state, payload) {
      let levelsArr = payload.split('/')
      levelsArr = levelsArr.slice(1)
      levelsArr.forEach((levelStr, level) => {
        let pageStateArr = levelStr.split('.')
        const pageId = pageStateArr[1]
        if (pageId) {
          Vue.set(state.levelIdsArr, level, {
            selectedObjId: pageStateArr[0],
            pageId: pageId
          })
          const newPageState = { paneWidth: '400px', selectedTab: 0 }
          const pageState = {
            selectedTab: pageStateArr[2] ? parseInt(pageStateArr[2]) : 0
          }
          state.pageStates[pageId] = Vue._.merge(newPageState, state.pageStates[pageId], pageState)
          Vue.set(state.pageStates, pageId, newPageState)
        }
      })
      // concatenate the original levelIdsArr
      state.levelIdsArr = state.levelIdsArr.splice(0, levelsArr.length)
    },

    SET_NODE_TOGGLE (state, payload) {
      if (payload.opened) state.isOpened[payload.id] = true
      else delete state.isOpened[payload.id]
    },

    SAVE (state, payload) {
      const updateHash = (newVal, oldVal) => {
        for (let key in state.classes) {
          let obj = state.classes[key]
          if (obj.parentId === oldVal) {
            let newObj = Vue._.cloneDeep(obj)
            newObj.parentId = newVal
            let objStr = JSON.stringify(state.classes[key])
            ipfs.files.add(objStr, { 'onlyHash': true }).then((response) => {
              let hash = response[0].hash
              console.log('Hash from IPFS: ' + hash)
              state.commons[hash] = rooObj
              this.updateHash(hash, key)
            })
          }
        }
      }
      let rooObj = JSON.stringify(state.classes['56f86c6a5dde184ccfb9fc6a'])
      console.log('rooObj', rooObj)
      let buf = Buffer.from(rooObj, 'utf8')
      ipfs.files.add(buf, { 'onlyHash': true }).then((response) => {
        let hash = response[0].hash
        console.log('Hash from IPFS: ' + hash)
        state.commons[hash] = rooObj
        updateHash(hash, '56f86c6a5dde184ccfb9fc6a')
      })
    }
  },
  actions: {
    getCommonByCid (store, cid) {
      return new Promise((resolve, reject) => {
        const commonsStore = this.db.transaction('commons', 'readwrite').objectStore('commons')
        commonsStore.get(cid).onsuccess = event => {
          let result = event.target.result
          if (result) {
            result.cid = cid
            result.id = cid
            resolve(result)
          } else {
            axios('ipfs.io/ipfs/' + cid, { headers: { 'Content-Type': 'application/json; charset=UTF-8' }, data: {} }).then(response => {
              let result = response.data
              commonsStore.put(result, cid)
              result.cid = cid
              result.id = cid
              resolve(result)
            })
          }
        }
      })
    },
    query: function (store, queryObj) {
      return new Promise((resolve, reject) => {
        const docProp = Vue._.get(queryObj, 'query.where.docProp')
        const operator = Vue._.get(queryObj, 'query.where.operator')
        let value = Vue._.get(queryObj, 'query.where.value')
        if (value === '$parentNode.$key') value = queryObj.fk

        if (operator === 'eq') {
          if (docProp === '$key') {
            store.dispatch('getCommonByCid', value).then(result => {
              resolve([result])
            })
          } else {
            const transaction = this.db.transaction(['commons'], 'readonly')
            const commonsStore = transaction.objectStore('commons')
            let resultsArr = []
            let index = commonsStore.index(docProp)
            if (index) {
              const request = index.openCursor(IDBKeyRange.bound(value, value))
              request.onerror = event => {
                console.err('error fetching data')
              }
              request.onsuccess = event => {
                let cursor = event.target.result
                if (cursor) {
                  let result = cursor.value
                  result.cid = cursor.primaryKey
                  result.id = cursor.primaryKey
                  resultsArr.push(result)
                  cursor.continue()
                } else {
                  // no more results
                }
              }
            } else console.error('Must create an index for ' + docProp)
            transaction.oncomplete = () => {
              resolve(resultsArr)
            }
          }
        } else console.error('Cannot query with ' + operator + ' operator yet')
      })
    },
    treeQueryArr (store, queryObj) {
      let promises = []
      queryObj.queryArr.forEach((query) => {
        promises.push(store.dispatch('treeQuery', { fk: queryObj.fk, query: query, queryNames: queryObj.queryNames, level: queryObj.level }))
      })
      return Promise.all(promises).then((values) => {
        return Vue._.union.apply(null, values)
      })
    },
    treeQuery: function (store, queryObj) {
      // Traverse class hierarchy, find nearest icon
      const getIconFromClassById = (classId) => {
        const classObj = store.state.classes[classId]
        if (classObj.icon) return classObj.icon
        else if (classObj.parentId) return getIconFromClassById(classObj.parentId)
        return '' // set to default icon
      }
      const getLeafPrommises = (item, queryArr) => {
        let leafPromises = []
        queryArr.forEach(query => {
          leafPromises.push(store.dispatch('query', { fk: item.cid, query: query }))
        })
        return Promise.all(leafPromises)
      }

      return store.dispatch('query', queryObj).then(resultsArr => {
        // Create a query array for the children, based on join predicates
        let queryArr = []
        if (queryObj.query.join) {
          queryObj.query.join.forEach((query) => {
            // Query referenced by name
            if (query.queryByName) queryArr.push(queryObj.queryNames[query.queryByName])
            // Query as object
            else queryArr.push(query)
          })
        }

        // Find out if the node is a leaf by running the child queries in each of the items
        let leafPromises = []
        resultsArr.forEach(item => {
          leafPromises.push(getLeafPrommises(item, queryArr))
        })
        return Promise.all(leafPromises).then((leafResultsArrArr) => {
          let treeNodeResultsArr = []
          leafResultsArrArr.forEach((leafResultsArr, i) => {
            // console.log('RESULTS', leafResultsArr)
            let item = resultsArr[i]
            // Normalize the results so that they are suited for the tree
            const ids = store.state.levelIdsArr[queryObj.level + 1]
            const selected = ids ? ids.selectedObjId === item.cid : false
            let icon = queryObj.query.icon ? queryObj.query.icon : item.icon
            if (!icon) icon = getIconFromClassById(item.classId)
            let result = {
              id: item.cid,
              cid: item.cid,
              text: item.title ? item.title : item.name,
              data: {
                queryArr: queryArr,
                queryNames: queryObj.queryNames,
                level: queryObj.level,
                item: item,
                pageId: queryObj.query.pageId ? queryObj.query.pageId : item.pageId,
                icon: icon
              },
              isLeaf: true,
              opened: !!store.state.isOpened[item.cid],
              selected: selected
            }
            if (leafResultsArr.length > 0) result.isLeaf = false
            treeNodeResultsArr.push(result)
          })
          // console.log('QUERY', queryObj)
          // console.log('RESULTS', resultsArr)
          return treeNodeResultsArr
        })
      })
    },
    mergeAncestorClasses (store, classId) {
      return store.dispatch('getCommonByCid', classId).then((classObj) => {
        if (classObj.parentId) {
          return store.dispatch('mergeAncestorClasses', classObj.parentId).then((parentClassObj) => {
            return Vue._.merge(parentClassObj, classObj)
          })
        } else return classObj
      })
    },
    materializedView (store, viewId) {
      const smartMergeProperties = (viewObj, classObj) => {
        if (!viewObj.properties) return
        Object.keys(viewObj.properties).forEach(propName => {
          const classProp = classObj.properties[propName]
          if (classProp) {
            const viewProp = viewObj.properties[propName]
            if (classProp.type) viewProp.type = classProp.type
            if (classProp.additionalProperties) viewProp.additionalProperties = classProp.additionalProperties
            if (!viewProp.title && classProp.title) viewProp.title = classProp.title
            if (!viewProp.media && classProp.media) viewProp.media = classProp.media
            if (!viewProp.default && classProp.default) viewProp.default = classProp.default
            if (!viewProp.readOnly && classProp.readOnly) viewProp.readOnly = classProp.readOnly
            if (!viewProp.enum && classProp.enum) viewProp.enum = classProp.enum
            if (!viewProp.pattern && classProp.pattern) viewProp.pattern = classProp.pattern
            if (!viewProp.query && classProp.query) viewProp.query = classProp.query
            if (!viewProp.items && classProp.items) viewProp.items = classProp.items
            if (viewProp.maxLength && viewProp.maxLength > classProp.maxLength) viewProp.maxLength = classProp.maxLength
            if (viewProp.minLength && viewProp.minLength < classProp.minLength) viewProp.minLength = classProp.minLength
            if (viewProp.max && viewProp.max > classProp.max) viewProp.max = classProp.max
            if (viewProp.min && viewProp.min < classProp.min) viewProp.min = classProp.min
            // Smart merge sub-properties recursively, if needed
            if (viewProp.items && classProp.items) smartMergeProperties(viewProp.items, classProp.items)
            if (viewProp.properties && classProp.properties) smartMergeProperties(viewProp, classProp)
          }
        })
        viewObj.required = Vue._.union(viewObj.required, classObj.required)
        viewObj.classIcon = classObj.icon
      }
      return store.dispatch('getCommonByCid', viewId).then((viewObj) => {
        const classId = Vue._.get(viewObj, 'query.from')
        if (classId && classId !== 'classes') {
          return store.dispatch('mergeAncestorClasses', classId).then((classObj) => {
            smartMergeProperties(viewObj, classObj)
            return viewObj
          })
        } else return viewObj
      })
    },
    loadCommons () {
      return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open('commonsDB', 1)

        openRequest.onupgradeneeded = e => {
          let db = e.target.result
          const store = db.createObjectStore('commons')
          store.createIndex('parentId', 'parentId')
          store.createIndex('classId', 'classId')
        }

        openRequest.onsuccess = e => {
          this.db = e.target.result

          return axios('classes.json', { headers: { 'Content-Type': 'application/json; charset=UTF-8' }, data: {} }).then(response => {
            const transaction = this.db.transaction('commons', 'readwrite')
            const commonsStore = transaction.objectStore('commons')
            Object.keys(response.data).forEach(key => {
              let result = response.data[key]
              commonsStore.put(result, key)
            })
            resolve(true)
          })
        }

        openRequest.onerror = e => {
          console.error(e.error)
          reject(e.error)
        }
      })
    }
  }
})
store.watch(state => state.route, (newPath, oldPath) => {
  store.commit('SET_PAGE_STATE_FROM_ROUTE', newPath.hash)
})
export default store
