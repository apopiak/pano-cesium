// globals
let G = {};

function positionsToCartographic(source) {
  const dataSource = source || steinwegMetaJson;

  return _.map(dataSource, meta => {
    const steinwegUTMzone = 32;

    let utm = new UTMConv.UTMCoords(
      steinwegUTMzone,
      meta["X-Sensor"],
      meta["Y-Sensor"]
    );
    let degrees = utm.to_deg("wgs84");
    return Cesium.Cartographic.fromDegrees(degrees.lngd, degrees.latd);
  });
}

const getPanellumCanvas = () =>
  document.querySelector(".pnlm-render-container > canvas:nth-child(1)");

const getThreeCanvas = () => document.querySelector("#container > canvas");

function createImageFromTarget(renderer, target) {
  let width = target.width;
  let height = target.height;

  // Read the contents of the framebuffer
  let data = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, data);

  // Create a 2D canvas to store the result
  let canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  let context = canvas.getContext("2d");

  // Copy the pixels to a 2D canvas
  let imageData = context.createImageData(width, height);
  imageData.data.set(data);
  context.putImageData(imageData, 0, 0);

  let img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

function addOrReplacePostProcessing(index) {
  const idx = index || 0;
  const image = "images/" + steinwegMetaJson[idx].ImageName;
  const camera = G.viewer.scene.camera;
  const canvas = G.viewer.scene.canvas;
  const stages = G.viewer.scene.postProcessStages;

  const heading = Cesium.Math.toRadians(steinwegMetaJson[idx]["H-Sensor"]);
  const roll = Cesium.Math.toRadians(steinwegMetaJson[idx]["R-Sensor"]);
  const pitch = Cesium.Math.toRadians(steinwegMetaJson[idx]["P-Sensor"]);
  const orientation = { heading, roll, pitch };

  fetch("data/projectionShaderFS.glsl")
    .then(res => res.text())
    .then(shader => {
      G.viewer.scene.camera.flyTo({
        destination: G.sampledPositions[idx],
        orientation
      });
      if (stages.length != 0) {
        stages.removeAll();
      }
      stages.add(
        new Cesium.PostProcessStage({
          fragmentShader: shader,
          uniforms: {
            panorama: image,
            u_inverseView: camera.inverseViewMatrix,
            u_width: canvas.width,
            u_height: canvas.height
          }
        })
      );
    })
    .catch(err => console.error(err));
}

function rotate(code) {
  const camera = G.viewer.scene.camera;
  const rotation = 3.14159265359 / 20.0; // 180° / 20 --> 9°

  if (code === 39) {
    // right arrow
    camera.rotateView({ heading: rotation });
  } else if (code === 37) {
    // left arrow
    camera.rotateView({ heading: -rotation });
  } else if (code === 38) {
    // up arrow
    camera.rotateView({ pitch: rotation });
  } else if (code === 40) {
    // down arrow
    camera.rotateView({ pitch: -rotation });
  }
}

function moveUp() {
  G.viewer.scene.camera.moveUp(0.2);
}

function keyDownListener(event) {
  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/which
  if (event.which <= 40 && event.which >= 37) {
    // [37;40] == arrow keys
    rotate(event.which);
  }
  const SPACE = 32;
  if (event.which == SPACE) {
    moveUp();
  }
}

// add camera rotation
document.addEventListener("keydown", keyDownListener, false);

(function() {
  "use strict";

  // globals
  G = {
    // viewers
    viewer: undefined,
    panoramaViewer: undefined,

    // positions of the panoramas
    positions: positionsToCartographic(),
    sampledPositions: undefined,

    // cesium 3D tileset
    tileset: undefined,

    // for selecting panoramas
    lastPicked: undefined,
    currentPanoramaImage: undefined
  };

  ///////////////////
  // panellum panorama viewer

  const panoramaConfig = {
    type: "equirectangular",
    autoLoad: true,
    basePath: "images/"
  };

  // Cesium Ion
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZmEzMjQwMi00MjQ0LTRmZjgtODhlOS0zNDI5ZmU3NGRkODQiLCJpZCI6MTQ5MywiaWF0IjoxNTI4NzE4Mzg0fQ.4h4xuSeZTaiBGtv4sHA7WN6D1eIedRHw-6rFls9QMsQ";

  //////////////////////////////////////////////////////////////////////////
  // Creating the Viewer
  //////////////////////////////////////////////////////////////////////////

  G.viewer = new Cesium.Viewer("cesiumContainer", {
    scene3DOnly: true,
    selectionIndicator: false,
    baseLayerPicker: false
  });

  //////////////////////////////////////////////////////////////////////////
  // Loading Imagery
  //////////////////////////////////////////////////////////////////////////

  // Remove default base layer
  G.viewer.imageryLayers.remove(G.viewer.imageryLayers.get(0));

  // Add Sentinel-2 imagery
  // viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 3954 }));

  // Add Bing Maps
  G.viewer.imageryLayers.addImageryProvider(
    new Cesium.IonImageryProvider({ assetId: 4 })
  );

  //////////////////////////////////////////////////////////////////////////
  // Loading Terrain
  //////////////////////////////////////////////////////////////////////////

  // Load Cesium World Terrain
  G.viewer.terrainProvider = Cesium.createWorldTerrain({
    requestWaterMask: true, // required for water effects
    requestVertexNormals: true // required for terrain lighting
  });
  // Enable depth testing so things behind the terrain disappear.
  G.viewer.scene.globe.depthTestAgainstTerrain = true;

  //////////////////////////////////////////////////////////////////////////
  // Configuring the Scene
  //////////////////////////////////////////////////////////////////////////

  // Enable lighting based on sun/moon positions
  G.viewer.scene.globe.enableLighting = true;

  // Create an initial camera view
  // let initialPosition = Cesium.Cartesian3.fromDegrees(
  //   6.940606327909218,
  //   51.36193491538978,
  //   300
  // );
  let initialPosition = new Cesium.Cartesian3(
    3961538.873578816,
    482335.18245185615,
    4958890.174561147
  );
  let homeCameraView = {
    destination: initialPosition
  };
  // Set the initial view
  G.viewer.scene.camera.setView(homeCameraView);

  // Override the default home button
  G.viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    G.viewer.scene.camera.flyTo(homeCameraView);
  });

  G.tileset = G.viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      modelMatrix: Cesium.Matrix4.fromTranslation(
        new Cesium.Cartesian3(30, 1, 40)
      ),
      url: "http://localhost:8080/data/pointcloud/tileset.json",
      skipLevelOfDetail: true,
      baseScreenSpaceError: 1024,
      skipScreenSpaceErrorFactor: 16,
      skipLevels: 1
    })
  );

  Cesium.when(
    G.viewer.terrainProvider.readyPromise,
    () => {
      let promise = Cesium.sampleTerrainMostDetailed(
        G.viewer.terrainProvider,
        G.positions
      );
      Cesium.when(promise, updatedPositions => {
        G.sampledPositions = _.map(updatedPositions, p =>
          Cesium.Cartographic.toCartesian(p)
        );
        console.log("positions loaded");
      });
      //     _.zip(
      //       _.map(updatedPositions, p => Cesium.Cartographic.toCartesian(p)),
      //       steinwegMetaJson
      //     ).forEach(pair => {
      //       let [pos, meta] = pair;
      //       pos.z += 1.5;
      //       G.viewer.entities.add({
      //         name: meta.ImageName,
      //         position: pos,
      //         ellipsoid: {
      //           radii: { x: 2, y: 2, z: 2 },
      //           material: Cesium.Color.GREEN
      //         },
      //         properties: {
      //           image: meta.ImageName
      //         }
      //       });
      //     });
      //   },
      //   console.error
      // );
    },
    console.error
  );

  let handler = new Cesium.ScreenSpaceEventHandler(G.viewer.scene.canvas);
  handler.setInputAction(e => {
    let pickedPrimitive = G.viewer.scene.pick(e.position);
    let pickedEntity = Cesium.defined(pickedPrimitive)
      ? pickedPrimitive.id
      : undefined;

    // un-highlight the last picked entity
    if (Cesium.defined(G.lastPicked)) {
      G.lastPicked.ellipsoid.material = Cesium.Color.GREEN;
    }
    // Highlight the currently picked entity
    if (Cesium.defined(pickedEntity)) {
      // pickedEntity.ellipsoid.material = Cesium.Color.ORANGERED;
      let image = pickedEntity.properties.image.getValue();
      console.log("picked image: ", image);
      // if (G.panoramaViewer) {
      //   G.panoramaViewer.destroy();
      // }
      // G.panoramaViewer = pannellum.viewer("panorama", {
      //   panorama: image,
      //   ...panoramaConfig
      // });
      G.currentPanoramaImage = image;

      pickedEntity.ellipsoid.material = new Cesium.ImageMaterialProperty({
        image: "images/" + image,
        color: new Cesium.Color(1, 1, 1, 0.5)
      });
      G.lastPicked = pickedEntity;
      G.viewer.scene.camera.flyTo({
        destination: pickedEntity.position._value
      });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
