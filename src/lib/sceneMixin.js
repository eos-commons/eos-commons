import TWEEN from '@tweenjs/tween.js'
// import * as TWEEN from '../../node_modules/three/examples/js/libs/tween.min.js';
// const TWEEN = require('../../node_modules/three/examples/js/libs/tween.min.js')
export default {
  name: 'Scene',
  props: {
    level: Number,
    viewId: String,
    width: {
      type: Number,
      default: undefined
    },
    height: {
      type: Number,
      default: undefined
    }
  },
  data () {
    return {
      skyboxArray: []
    }
  },
  mounted () {
    this.loadScene()
  },
  created () {
    this.$store.watch(state => state.levelIdsArr[this.level].selectedObjId, newVal => {
      console.log('selectedObjId Changed!', newVal)
      this.moveCameraToPos(newVal)
    }, {immediate: false})
  },
  methods: {
    onResize () {
      if (!this.renderer) return
      if (this.width === undefined || this.height === undefined) {
        this.$nextTick(() => {
          let widthPx = window.getComputedStyle(this.$el).getPropertyValue('width')
          let heightPx = window.getComputedStyle(this.$el).getPropertyValue('height')
          let widthStr = widthPx.substring(0, widthPx.length - 2)
          let heightStr = heightPx.substring(0, heightPx.length - 2)
          let width = Number(widthStr)
          let height = Number(heightStr) - 3
          this.camera.aspect = width / height
          this.camera.updateProjectionMatrix()
          this.renderer.setSize(width, height)
          // this.controls.handleResize()
          this.render()
        })
      } else {
        this.$nextTick(() => {
          this.renderer.setSize(this.width, this.height)
        })
      }
    },
    getSceneIndexByKey (key) {
      for (let i = 0; i < this.scenes.length; i++) {
        if (this.scenes[i].key === key) {
          return i
        }
      }
      return -1
    },
    loadScene () {
      // world
      this.scene = new THREE.Scene()

      let sceneObject3D = new THREE.Object3D()
      this.modelObject3D = new THREE.Object3D()

      this.scene.add(sceneObject3D)
      this.scene.add(this.modelObject3D)

      this.selectableMeshArr = []

      // camera
      this.camera = new THREE.PerspectiveCamera(60, 3 / 2, 1, 100000)
      this.camera.position.z = 4000

      // renderer
      if (Detector.webgl) this.renderer = new THREE.WebGLRenderer({antialias: true})
      else this.renderer = new THREE.CanvasRenderer()
      this.$el.appendChild(this.renderer.domElement)

      // controls
      this.controls = new THREE.OrbitControls(this.camera)
      this.controls.autoRotate = true
      this.controls.autoRotateSpeed = 0.125
      this.controls.minPolarAngle = Math.PI / 4
      this.controls.maxPolarAngle = Math.PI / 1.5

      // lights
      let light1 = new THREE.DirectionalLight(0xffffff)
      light1.position.set(1, 1, 1).normalize()
      sceneObject3D.add(light1)
      let light2 = new THREE.AmbientLight(0x404040)
      sceneObject3D.add(light2)

      // axes
      sceneObject3D.add(new THREE.AxisHelper(100))

      // projector
      //        this.projector = new THREE.Projector();
      this.raycaster = new THREE.Raycaster()

      // this.scene.background = new THREE.CubeTextureLoader().load(this.skyboxArray)

      // cubemap
      /* vvar path = "textures/cube/SwedishRoyalCastle/";
      var format = '.jpg';
      var urls = [
        path + 'px' + format, path + 'nx' + format,
        path + 'py' + format, path + 'ny' + format,
        path + 'pz' + format, path + 'nz' + format
      ]; */
      /*
            // See https://stemkoski.github.io/Three.js/Skybox.html
            let loader = new THREE.TextureLoader()
            let promises = []
            this.skyboxArray.forEach(textureLocation => {
              promises.push(new Promise((resolve, reject) => {
                loader.load(textureLocation, (texture) => {
                  resolve(texture)
                }, undefined, (err) => { debugger; console.error(err) })
              }))
            })
            Promise.all(promises).then(resultsArr => {
              debugger
              let skyGeometry = new THREE.CubeGeometry(50000, 50000, 50000)
              let materialArray = []
              resultsArr.forEach(texture => {
                materialArray.push(new THREE.MeshBasicMaterial({
                  map: texture,
                  side: THREE.BackSide
                }))
              })
              let skyMaterial = new THREE.MeshFaceMaterial(materialArray)
              this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial)
              sceneObject3D.add(this.skyBox)
              this.$forceUpdate()
              this.animate()
            }, (err) => console.error(err))
      */
      // See https://stemkoski.github.io/Three.js/Skybox.html
      if (this.skyboxArray.length === 6) {
        let skyGeometry = new THREE.CubeGeometry(50000, 50000, 50000)
        let materialArray = []
        for (let i = 0; i < 6; i++) {
          materialArray.push(new THREE.MeshBasicMaterial({
            map: THREE.ImageUtils.loadTexture(this.skyboxArray[i]),
            side: THREE.BackSide
          }))
        }
        let skyMaterial = new THREE.MeshFaceMaterial(materialArray)
        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial)
        sceneObject3D.add(this.skyBox)
      }

      // else see http://threejs.org/examples/webgl_multiple_views.html

      sceneObject3D.name = 'Boilerplate'
      this.$el.addEventListener('click', this.onClick, false)

      this.onResize()
      this.animate()
    },
    render () {
      this.renderer.render(this.scene, this.camera)
    },

    animate () {
      requestAnimationFrame(this.animate.bind(this))
      TWEEN.update()
      this.skyBox.position.set(this.camera.position.x, this.camera.position.y, this.camera.position.z) // keep skybox centred around the camera
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    },
    onClick (event) {
      // see https://threejs.org/docs/#api/core/Raycaster.setFromCamera
      event.preventDefault()

      // get 2D coordinates of the mouse, in normalized device coordinates (NDC)
      // let x = event.offsetX - this.$.threejsNode.offsetLeft;
      // let y = event.offsetY - this.$.threejsNode.offsetTop;
      let box = event.target.getBoundingClientRect()
      let x = (event.offsetX / box.width) * 2 - 1
      let y = -(event.offsetY / box.height) * 2 + 1
      let mouse = new THREE.Vector2(x, y)

      // update the picking ray with the camera and mouse position
      this.raycaster.setFromCamera(mouse, this.camera)
      let intersects = this.raycaster.intersectObjects(this.selectableMeshArr)
      if (intersects.length > 0) {
        let selectedMesh = intersects[0].object
        this.$store.commit('SET_LEVEL_IDS', {
          level: this.level,
          ids: {
            selectedObjId: selectedMesh.parent.key
          }
        })
      }
    },
    moveCameraToPos (key) {
      let selectedModelObj = this.rootObject3D.getModelObject3DByKey(key)
      // console.log('selectedModelObj', selectedModelObj.userData.doc.text)
      this.scene.updateMatrixWorld()
      let newTargetPos = new THREE.Vector3()
      newTargetPos.setFromMatrixPosition(selectedModelObj.matrixWorld)

      new TWEEN.Tween(this.controls.target).easing(TWEEN.Easing.Quadratic.Out).to(newTargetPos, 1500).start()

      let cameraPos = this.controls.object.position.clone()
      let newCameraPos = newTargetPos.clone()
      newCameraPos.z = 2000
      let cameraTween = new TWEEN.Tween(cameraPos).to(newCameraPos, 1500)
      cameraTween.easing(TWEEN.Easing.Quadratic.Out)
      cameraTween.onUpdate(() => {
        // console.log('cameraPos', cameraPos)
        this.controls.object.position.set(cameraPos.x, cameraPos.y, cameraPos.z)
      })
      cameraTween.start()
    }
  }
}
