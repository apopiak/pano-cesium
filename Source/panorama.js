var camera, scene, renderer;
var isUserInteracting = false,
  onMouseDownMouseX = 0,
  onMouseDownMouseY = 0,
  lon = 0,
  onMouseDownLon = 0,
  lat = 0,
  onMouseDownLat = 0,
  phi = 0,
  theta = 0;

var bufferScene;
// Create the texture that will store our result
var bufferTexture;
var buffer;
init();
animate();

function init() {
  var container, mesh;
  container = document.getElementById("container");
  camera = new THREE.PerspectiveCamera(
    75,
    container.offsetWidth / container.offsetHeight,
    1,
    1100
  );
  camera.target = new THREE.Vector3(0, 0, 0);
  scene = new THREE.Scene();
  var geometry = new THREE.SphereBufferGeometry(500, 60, 40);
  // invert the geometry on the x-axis so that all of the faces point inward
  geometry.scale(-1, 1, 1);
  var material = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load(
      "images/G360_Steinweg_20180208(1)-000000_000001.jpg"
    )
  });
  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.offsetWidth, container.offsetHeight);
  container.appendChild(renderer.domElement);
  document.addEventListener("mousedown", onPointerStart, false);
  document.addEventListener("mousemove", onPointerMove, false);
  document.addEventListener("mouseup", onPointerUp, false);
  document.addEventListener("wheel", onDocumentMouseWheel, false);
  document.addEventListener("touchstart", onPointerStart, false);
  document.addEventListener("touchmove", onPointerMove, false);
  document.addEventListener("touchend", onPointerUp, false);

  // off-screen rendering
  bufferScene = new THREE.Scene();
  bufferTexture = new THREE.WebGLRenderTarget(
    container.offsetWidth,
    container.offsetHeight,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping
    }
  );
  buffer = new Uint8Array(container.offsetWidth * container.offsetHeight * 4);
  //
  document.addEventListener(
    "dragover",
    function(event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    false
  );
  document.addEventListener(
    "dragenter",
    function(event) {
      document.body.style.opacity = 0.5;
    },
    false
  );
  document.addEventListener(
    "dragleave",
    function(event) {
      document.body.style.opacity = 1;
    },
    false
  );
  document.addEventListener(
    "drop",
    function(event) {
      event.preventDefault();
      var reader = new FileReader();
      reader.addEventListener(
        "load",
        function(event) {
          material.map.image.src = event.target.result;
          material.map.needsUpdate = true;
        },
        false
      );
      reader.readAsDataURL(event.dataTransfer.files[0]);
      document.body.style.opacity = 1;
    },
    false
  );
  //
  window.addEventListener("resize", onWindowResize, false);
}
function onWindowResize() {
  let container = document.getElementById("container");
  camera.aspect = container.offsetWidth / container.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.offsetWidth, container.offsetHeight);
}
function onPointerStart(event) {
  isUserInteracting = true;
  var clientX = event.clientX || event.touches[0].clientX;
  var clientY = event.clientY || event.touches[0].clientY;
  onMouseDownMouseX = clientX;
  onMouseDownMouseY = clientY;
  onMouseDownLon = lon;
  onMouseDownLat = lat;
}
function onPointerMove(event) {
  if (isUserInteracting === true) {
    var clientX = event.clientX || event.touches[0].clientX;
    var clientY = event.clientY || event.touches[0].clientY;
    lon = (onMouseDownMouseX - clientX) * 0.1 + onMouseDownLon;
    lat = (clientY - onMouseDownMouseY) * 0.1 + onMouseDownLat;
  }
}
function onPointerUp(event) {
  isUserInteracting = false;
}
function onDocumentMouseWheel(event) {
  var fov = camera.fov + event.deltaY * 0.05;
  camera.fov = THREE.Math.clamp(fov, 10, 75);
  camera.updateProjectionMatrix();
}
function animate() {
  requestAnimationFrame(animate);
  update();
}
function update() {
  if (isUserInteracting === false) {
    lon += 0.1;
  }
  lat = Math.max(-85, Math.min(85, lat));
  phi = THREE.Math.degToRad(90 - lat);
  theta = THREE.Math.degToRad(lon);
  camera.target.x = 500 * Math.sin(phi) * Math.cos(theta);
  camera.target.y = 500 * Math.cos(phi);
  camera.target.z = 500 * Math.sin(phi) * Math.sin(theta);
  camera.lookAt(camera.target);
  /*
  // distortion
  camera.position.copy( camera.target ).negate();
  */
  renderer.render(bufferScene, camera, bufferTexture);
  let gl = renderer.getContext();
  gl.readPixels(0,0, bufferTexture.width, bufferTexture.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  // renderer.readRenderTargetPixels(bufferTexture, 0, 0, bufferTexture.width, bufferTexture.height, buffer);
  renderer.render(scene, camera);
}
