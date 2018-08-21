let viewer = null;
let panoramaViewer = null;

const steinwegUTMzone = 32;

let positions = _.map(steinwegMetaJson, meta => {
  let utm = new UTMConv.UTMCoords(
    steinwegUTMzone,
    meta["X-Sensor"],
    meta["Y-Sensor"]
  );
  let degrees = utm.to_deg("wgs84");
  return Cesium.Cartographic.fromDegrees(degrees.lngd, degrees.latd);
});

let tileset = null;

let lastPicked = undefined;

(function() {
  "use strict";

  // panellum panorama viewer

  let panoramaConfig = {
    type: "equirectangular",
    autoLoad: true,
    basePath: "images/"
  };

  panoramaViewer = pannellum.viewer("panorama", {
    panorama: "black.png",
    ...panoramaConfig
  });

  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZmEzMjQwMi00MjQ0LTRmZjgtODhlOS0zNDI5ZmU3NGRkODQiLCJpZCI6MTQ5MywiaWF0IjoxNTI4NzE4Mzg0fQ.4h4xuSeZTaiBGtv4sHA7WN6D1eIedRHw-6rFls9QMsQ";

  //////////////////////////////////////////////////////////////////////////
  // Creating the Viewer
  //////////////////////////////////////////////////////////////////////////

  viewer = new Cesium.Viewer("cesiumContainer", {
    scene3DOnly: true,
    selectionIndicator: false,
    baseLayerPicker: false
  });

  //////////////////////////////////////////////////////////////////////////
  // Loading Imagery
  //////////////////////////////////////////////////////////////////////////

  // Remove default base layer
  viewer.imageryLayers.remove(viewer.imageryLayers.get(0));

  // Add Sentinel-2 imagery
  // viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 3954 }));

  // Add Bing Maps
  viewer.imageryLayers.addImageryProvider(
    new Cesium.IonImageryProvider({ assetId: 4 })
  );

  //////////////////////////////////////////////////////////////////////////
  // Loading Terrain
  //////////////////////////////////////////////////////////////////////////

  // Load Cesium World Terrain
  viewer.terrainProvider = Cesium.createWorldTerrain({
    requestWaterMask: true, // required for water effects
    requestVertexNormals: true // required for terrain lighting
  });
  // Enable depth testing so things behind the terrain disappear.
  viewer.scene.globe.depthTestAgainstTerrain = true;

  //////////////////////////////////////////////////////////////////////////
  // Configuring the Scene
  //////////////////////////////////////////////////////////////////////////

  // Enable lighting based on sun/moon positions
  viewer.scene.globe.enableLighting = true;

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
  viewer.scene.camera.setView(homeCameraView);

  // Add some camera flight animation options
  homeCameraView.duration = 2.0;
  homeCameraView.maximumHeight = 2000;
  homeCameraView.pitchAdjustHeight = 2000;
  homeCameraView.endTransform = Cesium.Matrix4.IDENTITY;
  // Override the default home button
  viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    viewer.scene.camera.flyTo(homeCameraView);
  });

  tileset = viewer.scene.primitives.add(
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

  let fragmentShaderSource =
    "uniform sampler2D colorTexture; \n" +
    "uniform sampler2D image; \n" +
    "varying vec2 v_textureCoordinates; \n" +
    "const int KERNEL_WIDTH = 16; \n" +
    "void main(void) \n" +
    "{ \n" +
    "    vec2 step = 1.0 / czm_viewport.zw; \n" +
    "    vec2 integralPos = v_textureCoordinates - mod(v_textureCoordinates, 8.0 * step); \n" +
    "    vec3 averageValue = vec3(0.0); \n" +
    "    for (int i = 0; i < KERNEL_WIDTH; i++) \n" +
    "    { \n" +
    "        for (int j = 0; j < KERNEL_WIDTH; j++) \n" +
    "        { \n" +
    "            averageValue += texture2D(image, integralPos + step * vec2(i, j)).rgb; \n" +
    "        } \n" +
    "    } \n" +
    "    averageValue /= float(KERNEL_WIDTH * KERNEL_WIDTH); \n" +
    "    gl_FragColor = vec4(averageValue, 1.0); \n" +
    "} \n";

  Cesium.when(
    viewer.terrainProvider.readyPromise,
    () => {
      let promise = Cesium.sampleTerrainMostDetailed(
        viewer.terrainProvider,
        positions
      );
      Cesium.when(
        promise,
        updatedPositions => {
          _.zip(
            _.map(updatedPositions, p => Cesium.Cartographic.toCartesian(p)),
            steinwegMetaJson
          ).forEach(pair => {
            let [pos, meta] = pair;
            pos.z += 1.5;
            viewer.entities.add({
              name: meta.ImageName,
              position: pos,
              ellipsoid: {
                radii: { x: 2, y: 2, z: 2 },
                material: Cesium.Color.GREEN
              },
              properties: {
                image: meta.ImageName
              }
            });
          });
        },
        console.error
      );
    },
    console.error
  );

  let handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(e => {
    var pickedPrimitive = viewer.scene.pick(e.position);
    var pickedEntity = Cesium.defined(pickedPrimitive)
      ? pickedPrimitive.id
      : undefined;

    // un-highlight the last picked entity
    if (Cesium.defined(lastPicked)) {
      lastPicked.ellipsoid.material = Cesium.Color.GREEN;
    }
    // Highlight the currently picked entity
    if (Cesium.defined(pickedEntity)) {
      // pickedEntity.ellipsoid.material = Cesium.Color.ORANGERED;
      let image = pickedEntity.properties.image.getValue();
      console.log("picked image: ", image);
      panoramaViewer = pannellum.viewer("panorama", {
        panorama: image,
        ...panoramaConfig
      });
      viewer.scene.postProcessStages.add(
        new Cesium.PostProcessStage({
          fragmentShader: fragmentShaderSource,
          uniforms: {
            image: "images/" + image
          }
        })
      );
      pickedEntity.ellipsoid.material = "images/" + image;
      // pickedEntity.ellipsoid.material =
      //   "images/" + pickedEntity.properties.image.getValue();
      // panoramaViewer.on("load", e => {
      //   pickedEntity.ellipsoid.material =
      //     panoramaViewer.getRenderer().getCanvas().toDataURL();
      // });
      lastPicked = pickedEntity;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
