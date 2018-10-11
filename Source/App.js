// globals
let G = {};

(function() {
  "use strict";

  // util function
  const imagePath = imageName => "images/" + imageName;

  const updatePostProcessing = image => {
    G.postProcessStage.uniforms.panorama = image;
  };

  // add a panorama rendering in post processing
  const addOrUpdatePostProcessing = index => {
    const idx = index || 0;
    const meta = steinwegMetaJson[idx];
    G.currentPanoramaImage = meta.ImageName;
    const image = imagePath(meta.ImageName);
    const camera = G.viewer.scene.camera;

    const heading = Cesium.Math.toRadians(meta["H-Sensor"]);
    const roll = Cesium.Math.toRadians(meta["R-Sensor"]);
    const pitch = Cesium.Math.toRadians(meta["P-Sensor"]);
    const orientation = { heading, roll, pitch };
    const destination = G.cartesianPositions[idx];

    if (Cesium.defined(G.postProcessStage)) {
      // we don't need to do anything if the right image is already being displayed
      if (G.postProcessStage.uniforms.panorama === image) {
        return;
      }
      // otherwise we fly to the right location and update the panorama texture
      camera.flyTo({ destination, orientation });
      updatePostProcessing(image);
      return;
    }

    const canvas = G.viewer.scene.canvas;
    const stages = G.viewer.scene.postProcessStages;

    fetch("data/projectionShaderFS.glsl")
      .then(res => res.text())
      .then(shader => {
        camera.flyTo({ destination, orientation });
        if (stages.length != 0) {
          stages.removeAll();
        }
        G.postProcessStage = stages.add(
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
  };

  function positionsToCartographic(source) {
    const dataSource = source || steinwegMetaJson;

    return _.map(dataSource, meta => {
      const steinwegUTMzone = 32;

      const utm = new UTMConv.UTMCoords(
        steinwegUTMzone,
        meta["X-Sensor"],
        meta["Y-Sensor"]
      );
      const degrees = utm.to_deg("wgs84");
      const height = meta["Z-Sensor"];
      return Cesium.Cartographic.fromDegrees(
        degrees.lngd,
        degrees.latd,
        height
      );
    });
  }

  // interaction setup
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
    // [37;40] == arrow keys
    if (event.which <= 40 && event.which >= 37) {
      rotate(event.which);
    }
    const SPACE = 32;
    if (event.which == SPACE) {
      moveUp();
    }
  }

  document.addEventListener("keydown", keyDownListener, false);

  // convert positions to Cesium coordinate system
  const cartographicPositions = positionsToCartographic();

  ///////////////////////
  // Globals
  ///////////////////////
  G = {
    // viewers
    viewer: undefined,

    // positions of the panoramas
    cartographicPositions: cartographicPositions,
    cartesianPositions: _.map(cartographicPositions, p =>
      Cesium.Cartographic.toCartesian(p)
    ),
    // sampledPositions: undefined,

    // cesium 3D tileset
    tileset: undefined,

    // for selecting panoramas
    lastPicked: undefined,
    currentPanoramaImage: undefined,

    // post-processing stage
    postProcessStage: undefined,

    fn: {
      addOrUpdatePostProcessing
    }
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
  // G.viewer.imageryLayers.addImageryProvider(
  //   new Cesium.IonImageryProvider({ assetId: 4 })
  // );

  //////////////////////////////////////////////////////////////////////////
  // Loading Terrain
  //////////////////////////////////////////////////////////////////////////

  // Load Cesium World Terrain
  // G.viewer.terrainProvider = Cesium.createWorldTerrain({
  //   requestWaterMask: true, // required for water effects
  //   requestVertexNormals: true // required for terrain lighting
  // });
  // Enable depth testing so things behind the terrain disappear.
  // G.viewer.scene.globe.depthTestAgainstTerrain = true;

  //////////////////////////////////////////////////////////////////////////
  // Configuring the Scene
  //////////////////////////////////////////////////////////////////////////

  // Enable lighting based on sun/moon positions
  G.viewer.scene.globe.enableLighting = true;

  // Set the initial view
  const birdsEye = new Cesium.Cartesian3(
    3961538.873578816,
    482335.18245185615,
    4958890.174561147
  );
  const inTheStreet = {
    x: 3961467.550069339,
    y: 482298.0868178488,
    z: 4958811.655684536
  };
  const homeCameraView = {
    destination: inTheStreet,
    orientation: {
      direction: {
        x: 0.028642267278155248,
        y: 0.9168583988712383,
        z: -0.39818374771509196
      },
      up: {
        x: 0.6449769314801278,
        y: 0.28737711124775434,
        z: 0.7081095634076512
      }
    }
  };
  G.viewer.scene.camera.flyTo(homeCameraView);

  // Override the default home button
  G.viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    G.viewer.scene.camera.flyTo(homeCameraView);
  });

  G.tileset = G.viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      // modelMatrix: Cesium.Matrix4.fromTranslation(
      //   new Cesium.Cartesian3(30, 1, 40)
      // ),
      url: "http://localhost:8080/data/pointcloud/tileset.json",
      skipLevelOfDetail: true,
      baseScreenSpaceError: 1024,
      skipScreenSpaceErrorFactor: 16,
      skipLevels: 1
    })
  );

  // place spheres representing the panorama pictures
  _.zip(G.cartesianPositions, steinwegMetaJson).forEach((pair, index) => {
    let [pos, meta] = pair;
    G.viewer.entities.add({
      name: meta.ImageName,
      position: pos,
      ellipsoid: {
        radii: { x: 1, y: 1, z: 1 },
        material: Cesium.Color.DARKGREEN
      },
      properties: {
        image: meta.ImageName,
        index
      }
    });
  });


  let handler = new Cesium.ScreenSpaceEventHandler(G.viewer.scene.canvas);
  handler.setInputAction(e => {
    let pickedPrimitive = G.viewer.scene.pick(e.position);
    let pickedEntity = Cesium.defined(pickedPrimitive)
      ? pickedPrimitive.id
      : undefined;

    if (Cesium.defined(G.lastPicked)) {
      G.lastPicked.show = true;
    }
    if (Cesium.defined(pickedEntity)) {
      let image = pickedEntity.properties.image.getValue();
      console.log("picked image: ", image);

      G.currentPanoramaImage = image;

      // // set the panorama image as sphere texture
      // pickedEntity.ellipsoid.material = new Cesium.ImageMaterialProperty({
      //   image: imagePath(image),
      //   color: new Cesium.Color(1, 1, 1, 0.5)
      // });
      G.lastPicked = pickedEntity;

      addOrUpdatePostProcessing(pickedEntity.properties.index.getValue());
      pickedEntity.show = false;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
