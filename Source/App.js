let viewer = null;
let panoramaViewer = null;

const steinwegUTMzone = 32;

let positions = _.map(steinwegMetaJson, meta => {
  let utm = new UTMConv.UTMCoords(
    steinwegUTMzone,
    meta["X-Ori"],
    meta["Y-Ori"]
  );
  let degrees = utm.to_deg("wgs84");
  return Cesium.Cartographic.fromDegrees(degrees.lngd, degrees.latd);
});

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
  let initialPosition = Cesium.Cartesian3.fromDegrees(
    6.940606327909218,
    51.36193491538978,
    300
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
            const [pos, meta] = pair;
            viewer.entities.add({
              name: meta.ImageName,
              position: pos,
              ellipsoid: {
                radii: {x: 2, y: 2, z: 2},
                material: Cesium.Color.MEDIUMSPRINGGREEN
                //material: new Cesium.ImageMaterialProperty({image: "http://localhost:8080/images/" + meta.ImageName})
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
      pickedEntity.ellipsoid.material = Cesium.Color.ORANGERED;
      console.log("picked image: ", pickedEntity.properties.image.getValue());
      panoramaViewer = pannellum.viewer("panorama", {
        panorama: pickedEntity.properties.image.getValue(),
        ...panoramaConfig
      });
      lastPicked = pickedEntity;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
