var viewer = null;
var panoramaViewer = null;

var panoTuples = [
  [6.9406063, 51.3619349],
  [6.9406713, 51.3619135],
  [6.9407371, 51.3618929],
  [6.9408033, 51.3618727],
  [6.9408695, 51.3618531],
  [6.940936, 51.3618336],
  [6.9410024, 51.3618143],
  [6.941069, 51.3617955],
  [6.9411358, 51.3617767],
  [6.9412023, 51.3617577],
  [6.9412681, 51.3617377],
  [6.9413327, 51.3617164],
  [6.9413963, 51.3616936],
  [6.9414594, 51.3616714],
  [6.9415236, 51.361649],
  [6.9415912, 51.3616299],
  [6.9416605, 51.3616142],
  [6.9417296, 51.3615999],
  [6.9417972, 51.3615837],
  [6.9418673, 51.3615682],
  [6.9419364, 51.3615544],
  [6.9420063, 51.3615401],
  [6.9420759, 51.3615258],
  [6.9421464, 51.3615143],
  [6.9422181, 51.3615031],
  [6.9422896, 51.3614938],
  [6.9423618, 51.3614852],
  [6.9424337, 51.3614769],
  [6.942506, 51.3614696],
  [6.9425781, 51.3614636],
  [6.9426511, 51.3614582],
  [6.9427242, 51.3614556],
  [6.9427973, 51.3614539],
  [6.9428708, 51.3614529],
  [6.9429442, 51.3614522],
  [6.9430174, 51.3614523],
  [6.9430905, 51.3614521],
  [6.9431631, 51.3614515],
  [6.9432355, 51.3614502],
  [6.9433096, 51.3614487],
  [6.9433822, 51.3614471],
  [6.9434556, 51.3614462],
  [6.9435293, 51.3614455],
  [6.943602, 51.3614451],
  [6.9436745, 51.3614444],
  [6.9437476, 51.3614433],
  [6.9438209, 51.3614433],
  [6.943894, 51.3614436],
  [6.9439672, 51.3614439],
  [6.944041, 51.3614434],
  [6.9441147, 51.3614408],
  [6.9441843, 51.3614306],
  [6.9442494, 51.3614157],
  [6.9443025, 51.3613895],
  [6.9443359, 51.3613503],
  [6.944358, 51.3613076],
  [6.9443814, 51.3612646],
  [6.9444034, 51.3612214],
  [6.9444337, 51.3611794],
  [6.9444664, 51.3611383],
  [6.944501, 51.3610976],
  [6.9445356, 51.3610572]
];

// let positions = Cesium.Cartesian3.fromDegreesArray(panoramaPositions).map( p => Cesium.Cartographic.fromCartesian(p) );
var positions = panoTuples.map(pair => {
  const [lng, lat] = pair;
  return Cesium.Cartographic.fromDegrees(lng, lat);
});

var lastPicked = undefined;

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
  viewer.homeButton.viewModel.command.beforeExecute.addEventListener(function(
    e
  ) {
    e.cancel = true;
    viewer.scene.camera.flyTo(homeCameraView);
  });

  // //////////////////////////////////////////////////////////////////////////
  // // Loading and Styling Entity Data
  // //////////////////////////////////////////////////////////////////////////
  //
  // var kmlOptions = {
  //     camera : viewer.scene.camera,
  //     canvas : viewer.scene.canvas,
  //     clampToGround : true
  // };
  // // Load geocache points of interest from a KML file
  // // Data from : http://catalog.opendata.city/dataset/pediacities-nyc-neighborhoods/resource/91778048-3c58-449c-a3f9-365ed203e914
  // var geocachePromise = Cesium.KmlDataSource.load('./Source/SampleData/sampleGeocacheLocations.kml', kmlOptions);
  //
  // // Add geocache billboard entities to scene and style them
  // geocachePromise.then(function(dataSource) {
  //     // Add the new data as entities to the viewer
  //     viewer.dataSources.add(dataSource);
  //
  //     // Get the array of entities
  //     var geocacheEntities = dataSource.entities.values;
  //
  //     for (var i = 0; i < geocacheEntities.length; i++) {
  //         var entity = geocacheEntities[i];
  //         if (Cesium.defined(entity.billboard)) {
  //             // Adjust the vertical origin so pins sit on terrain
  //             entity.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
  //             // Disable the labels to reduce clutter
  //             entity.label = undefined;
  //             // Add distance display condition
  //             entity.billboard.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(10.0, 20000.0);
  //             // Compute latitude and longitude in degrees
  //             var cartographicPosition = Cesium.Cartographic.fromCartesian(entity.position.getValue(Cesium.JulianDate.now()));
  //             var latitude = Cesium.Math.toDegrees(cartographicPosition.latitude);
  //             var longitude = Cesium.Math.toDegrees(cartographicPosition.longitude);
  //             // Modify description
  //             var description = '<table class="cesium-infoBox-defaultTable cesium-infoBox-defaultTable-lighter"><tbody>' +
  //                 '<tr><th>' + "Longitude" + '</th><td>' + longitude.toFixed(5) + '</td></tr>' +
  //                 '<tr><th>' + "Latitude" + '</th><td>' + latitude.toFixed(5) + '</td></tr>' +
  //                 '</tbody></table>';
  //             entity.description = description;
  //         }
  //     }
  // });
  //
  // var geojsonOptions = {
  //     clampToGround : true
  // };
  // // Load neighborhood boundaries from a GeoJson file
  // // Data from : https://data.cityofnewyork.us/City-Government/Neighborhood-Tabulation-Areas/cpf4-rkhq
  // var neighborhoodsPromise = Cesium.GeoJsonDataSource.load('./Source/SampleData/sampleNeighborhoods.geojson', geojsonOptions);
  //
  // // Save an new entity collection of neighborhood data
  // var neighborhoods;
  // neighborhoodsPromise.then(function(dataSource) {
  //     // Add the new data as entities to the viewer
  //     viewer.dataSources.add(dataSource);
  //     neighborhoods = dataSource.entities;
  //
  //     // Get the array of entities
  //     var neighborhoodEntities = dataSource.entities.values;
  //     for (var i = 0; i < neighborhoodEntities.length; i++) {
  //         var entity = neighborhoodEntities[i];
  //
  //         if (Cesium.defined(entity.polygon)) {
  //             // Use kml neighborhood value as entity name
  //             entity.name = entity.properties.neighborhood;
  //             // Set the polygon material to a random, translucent color
  //             entity.polygon.material = Cesium.Color.fromRandom({
  //                 red : 0.1,
  //                 maximumGreen : 0.5,
  //                 minimumBlue : 0.5,
  //                 alpha : 0.6
  //             });
  //             // Tells the polygon to color the terrain. ClassificationType.CESIUM_3D_TILE will color the 3D tileset, and ClassificationType.BOTH will color both the 3d tiles and terrain (BOTH is the default)
  //             entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
  //             // Generate Polygon center
  //             var polyPositions = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
  //             var polyCenter = Cesium.BoundingSphere.fromPoints(polyPositions).center;
  //             polyCenter = Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(polyCenter);
  //             entity.position = polyCenter;
  //             // Generate labels
  //             entity.label = {
  //                 text : entity.name,
  //                 showBackground : true,
  //                 scale : 0.6,
  //                 horizontalOrigin : Cesium.HorizontalOrigin.CENTER,
  //                 verticalOrigin : Cesium.VerticalOrigin.BOTTOM,
  //                 distanceDisplayCondition : new Cesium.DistanceDisplayCondition(10.0, 8000.0),
  //                 disableDepthTestDistance : 100.0
  //             };
  //         }
  //     }
  // });
  //
  // // Load a drone flight path from a CZML file
  // var dronePromise = Cesium.CzmlDataSource.load('./Source/SampleData/SampleFlight.czml');
  //
  // // Save a new drone model entity
  // var drone;
  // dronePromise.then(function(dataSource) {
  //     viewer.dataSources.add(dataSource);
  //     // Get the entity using the id defined in the CZML data
  //     drone = dataSource.entities.getById('Aircraft/Aircraft1');
  //     // Attach a 3D model
  //     drone.model = {
  //         uri : './Source/SampleData/Models/CesiumDrone.gltf',
  //         minimumPixelSize : 128,
  //         maximumScale : 1000,
  //         silhouetteColor : Cesium.Color.WHITE,
  //         silhouetteSize : 2
  //     };
  //     // Add computed orientation based on sampled positions
  //     drone.orientation = new Cesium.VelocityOrientationProperty(drone.position);
  //
  //     // Smooth path interpolation
  //     drone.position.setInterpolationOptions({
  //         interpolationAlgorithm : Cesium.HermitePolynomialApproximation,
  //         interpolationDegree : 3
  //     });
  //     drone.viewFrom = new Cesium.Cartesian3(-30, 0, 0);
  // });

  //////////////////////////////////////////////////////////////////////////
  // Load 3D Tileset
  //////////////////////////////////////////////////////////////////////////

  // Load the NYC buildings tileset
  // var city = viewer.scene.primitives.add(new Cesium.Cesium3DTileset({ url: Cesium.IonResource.fromAssetId(3839) }));
  //
  // console.log("adding nyc buildings");
  // // Adjust the tileset height so it's not floating above terrain
  // var heightOffset = -32;
  // city.readyPromise.then(function(tileset) {
  //     // Position tileset
  //     console.log("loaded city tileset");
  //     var boundingSphere = tileset.boundingSphere;
  //     var cartographic = Cesium.Cartographic.fromCartesian(boundingSphere.center);
  //     var surfacePosition = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0.0);
  //     var offsetPosition = Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, heightOffset);
  //     var translation = Cesium.Cartesian3.subtract(offsetPosition, surfacePosition, new Cesium.Cartesian3());
  //     tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
  // }, (error) => {
  //     console.log(error);
  // });
  //
  // //////////////////////////////////////////////////////////////////////////
  // // Style 3D Tileset
  // //////////////////////////////////////////////////////////////////////////
  //
  // // Define a white, opaque building style
  // var defaultStyle = new Cesium.Cesium3DTileStyle({
  //     color : "color('white')",
  //     show : true
  // });
  //
  // // Set the tileset style to default
  // city.style = defaultStyle;

  // // Define a white, transparent building style
  // var transparentStyle = new Cesium.Cesium3DTileStyle({
  //     color : "color('white', 0.3)",
  //     show : true
  // });

  // // Define a style in which buildings are colored by height
  // var heightStyle = new Cesium.Cesium3DTileStyle({
  //     color : {
  //         conditions : [
  //             ["${height} >= 300", "rgba(45, 0, 75, 0.5)"],
  //             ["${height} >= 200", "rgb(102, 71, 151)"],
  //             ["${height} >= 100", "rgb(170, 162, 204)"],
  //             ["${height} >= 50", "rgb(224, 226, 238)"],
  //             ["${height} >= 25", "rgb(252, 230, 200)"],
  //             ["${height} >= 10", "rgb(248, 176, 87)"],
  //             ["${height} >= 5", "rgb(198, 106, 11)"],
  //             ["true", "rgb(127, 59, 8)"]
  //         ]
  //     }
  // });

  // var tileStyle = document.getElementById('tileStyle');
  // function set3DTileStyle() {
  //     var selectedStyle = tileStyle.options[tileStyle.selectedIndex].value;
  //     if (selectedStyle === 'none') {
  //         city.style = defaultStyle;
  //     } else if (selectedStyle === 'height') {
  //         city.style = heightStyle;
  //     } else if (selectedStyle === 'transparent') {
  //         city.style = transparentStyle;
  //     }
  // }
  // tileStyle.addEventListener('change', set3DTileStyle);

  //////////////////////////////////////////////////////////////////////////
  // Custom mouse interaction for highlighting and selecting
  //////////////////////////////////////////////////////////////////////////

  // If the mouse is over a point of interest, change the entity billboard scale and color
  // var previousPickedEntity;
  // var handler = viewer.screenSpaceEventHandler;
  // handler.setInputAction(function (movement) {
  //     var pickedPrimitive = viewer.scene.pick(movement.endPosition);
  //     var pickedEntity = Cesium.defined(pickedPrimitive) ? pickedPrimitive.id : undefined;
  //     // Unhighlight the previously picked entity
  //     if (Cesium.defined(previousPickedEntity)) {
  //         previousPickedEntity.billboard.scale = 1.0;
  //         previousPickedEntity.billboard.color = Cesium.Color.WHITE;
  //     }
  //     // Highlight the currently picked entity
  //     if (Cesium.defined(pickedEntity) && Cesium.defined(pickedEntity.billboard)) {
  //         pickedEntity.billboard.scale = 2.0;
  //         pickedEntity.billboard.color = Cesium.Color.ORANGERED;
  //         previousPickedEntity = pickedEntity;
  //     }
  // }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  //////////////////////////////////////////////////////////////////////////
  // Setup Camera Modes
  //////////////////////////////////////////////////////////////////////////

  // var freeModeElement = document.getElementById('freeMode');
  // var droneModeElement = document.getElementById('droneMode');

  // // Create a follow camera by tracking the drone entity
  // function setViewMode() {
  //     if (droneModeElement.checked) {
  //         viewer.trackedEntity = drone;
  //     } else {
  //         viewer.trackedEntity = undefined;
  //         viewer.scene.camera.flyTo(homeCameraView);
  //     }
  // }

  // freeModeElement.addEventListener('change', setViewMode);
  // droneModeElement.addEventListener('change', setViewMode);

  // viewer.trackedEntityChanged.addEventListener(function() {
  //     if (viewer.trackedEntity === drone) {
  //         freeModeElement.checked = false;
  //         droneModeElement.checked = true;
  //     }
  // });

  //////////////////////////////////////////////////////////////////////////
  // Setup Display Options
  //////////////////////////////////////////////////////////////////////////

  // var shadowsElement = document.getElementById('shadows');
  // var neighborhoodsElement =  document.getElementById('neighborhoods');

  // shadowsElement.addEventListener('change', function (e) {
  //     viewer.shadows = e.target.checked;
  // });

  // neighborhoodsElement.addEventListener('change', function (e) {
  //     neighborhoods.show = e.target.checked;
  // });

  // // Finally, wait for the initial city to be ready before removing the loading indicator.
  // var loadingIndicator = document.getElementById('loadingIndicator');
  // loadingIndicator.style.display = 'block';
  // city.readyPromise.then(function () {
  //     loadingIndicator.style.display = 'none';
  // });

  // _.zip(updatedPositions, heights).map( pair => {
  //   console.log(pair);
  //   let [ pos, height ] = pair;
  //   pos.height += height;
  //   return pos;
  // })
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
              cylinder: {
                length: 5,
                topRadius: 2,
                bottomRadius: 2,
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
      lastPicked.cylinder.material = Cesium.Color.GREEN;
    }
    // Highlight the currently picked entity
    if (Cesium.defined(pickedEntity)) {
      pickedEntity.cylinder.material = Cesium.Color.ORANGERED;
      console.log("picked image: ", pickedEntity.properties.image.getValue());
      panoramaViewer = pannellum.viewer("panorama", {
        panorama: pickedEntity.properties.image.getValue(),
        ...panoramaConfig
      });
      lastPicked = pickedEntity;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
