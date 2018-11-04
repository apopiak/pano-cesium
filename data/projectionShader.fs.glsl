precision highp float;

// cesium
// uniform vec4 czm_viewport;
// uniform mat4 czm_inverseProjection;
// uniform mat4 czm_inverseView;
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;

varying vec2 v_textureCoordinates;

// custom uniforms
uniform sampler2D u_panorama;

uniform vec3 u_camPos;
uniform vec3 u_direction;
uniform float u_nearPlaneDistance;
uniform vec2 u_nearPlaneSize;

const float PI = 3.14159265359;
const vec3 X_AXIS = vec3(1.0, 0.0, 0.0);
const vec3 Y_AXIS = vec3(0.0, 1.0, 0.0);
const vec3 Z_AXIS = vec3(0.0, 0.0, 1.0);

mat4 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}

// vec2 latLong(vec3 cartesian) {
//     const float c_1OverPi  = 0.3183098861837906715377675267450;
//     float latitude = asin(cartesian.z) * c_1OverPi;
//
//     float arctan = atan(cartesian.y, cartesian.x) * c_1OverPi;
//     float longitude = 0.0;
//     if (cartesian.x > 0.0) {
//         longitude = arctan;
//     } else if(cartesian.y > 0.0) {
//         longitude = arctan + PI;
//     } else {
//         longitude = arctan - PI;
//     }
//     return vec2(latitude, longitude);
// }

vec2 equirectangular(vec3 ray)
{
    // orig:
    // vec3 stu = normalize(ray.xyz) * vec3(-1.0, 1.0, 1.0);
    vec3 stu = normalize(ray.xyz);

    const float c_1Over2Pi = 0.1591549430918953357688837633725;
    const float c_1OverPi  = 0.3183098861837906715377675267450;

    float v = (acos(stu.y) * c_1OverPi);
    vec2 uv = vec2(atan(stu.x, stu.z) * c_1Over2Pi + 0.5, v);
    return uv;
}

vec2 equi2(vec3 ray)
{
    vec3 stu = normalize(ray);

    const float c_1OverPi  = 0.3183098861837906715377675267450;
    float latitude = asin(stu.z) * c_1OverPi;

    float arctan = atan(stu.y, stu.x) * c_1OverPi;
    float longitude = 0.0;
    if (stu.x > 0.0) {
        longitude = arctan;
    } else if(stu.y > 0.0) {
        longitude = arctan + PI;
    } else {
        longitude = arctan - PI;
    }
    vec2 ll = vec2(latitude, longitude);
    vec2 uv = (ll / vec2(PI, 2.0 * PI)) + vec2(0.5, 0.5);
    return uv;
}

vec2 sphere(vec3 ray)
{
    vec3 stu = normalize(ray) * vec3(-1.0, 1.0, -1.0);

    float z = 1.0 - stu.z;
    float m = sqrt(stu.x * stu.x + stu.y * stu.y + z * z);
    vec2 uv = 0.5 + 0.5 * vec2(+stu.x, -stu.y) / m;
    return uv;
}

vec2 polar(vec3 ray)
{
    vec3 stu = normalize(ray) * vec3(-1.0, 1.0, 1.0);

    stu.y = asin(stu.y) * 2.0 / 3.14159265359;
    float m = stu.y > 0.0 ? 1.0 + stu.y : 1.0 - stu.y;
    vec2 uv = 0.5 + 0.5 * vec2(stu.x, stu.z) / m;
    return uv;
}

int digit(float value, int dig) { //3.13
  int x1 = int(abs(value) * pow(10.0, float(dig))); //13
  int x2 = int(float(x1) / pow(10.0, float(dig - 1))); // 1
  return x1 - (x2*10);
}

vec4 rotate(vec4 ray)
{
    mat4 rot = rotationMatrix(X_AXIS, -PI / 2.0); // 90 around x-axis
    mat4 rot2 = rotationMatrix(Z_AXIS, PI / 4.0); // 45 around z-axis
    mat4 rot3 = rotationMatrix(Y_AXIS, PI / 8.5);
    mat4 rot4 = rotationMatrix(X_AXIS, -PI / 20.5);
    return rot4 * rot3 * rot2 * rot * ray;
}

void main(void)
{
    vec2 screenPos = (gl_FragCoord.xy / czm_viewport.zw) * 2.0 - 1.0;
    // we want the virtual sphere to be as far away as possible == on the
    // far plane --> ndc.z = 1.0
    vec4 ndcPos = vec4(screenPos, 1.0, 1.0);
    vec4 clipPos =  ndcPos / gl_FragCoord.w;
    vec4 eyePos = czm_inverseProjection * clipPos;
    vec4 worldPos = czm_inverseView * eyePos;

    vec4 ray = vec4(normalize(worldPos.xyz), 1.0);

    // ray = rotate(ray);

    vec2 uv = equirectangular(ray.xyz);

    vec4 color = texture2D(colorTexture, v_textureCoordinates);
    float depth = texture2D(depthTexture, v_textureCoordinates).x;
    vec4 pano = texture2D(u_panorama, uv);

    vec3 normWorld = normalize(worldPos.xyz);

    vec4 debug = 1.0 * vec4(normWorld.xyz, 1.0);
    // gl_FragColor = debug;
    if (digit(debug.x,2) == 0) debug.x = 1.0;
    if (digit(debug.y,2) == 0) debug.y = 1.0;
    if (digit(debug.z,2) == 0) debug.z = 1.0;
    vec4 combined = mix(pano, clamp(debug, 0.0, 1.0), 0.4);
    gl_FragColor = mix(color, combined, clamp(depth + 0.33, 0.0, 1.0));
}
